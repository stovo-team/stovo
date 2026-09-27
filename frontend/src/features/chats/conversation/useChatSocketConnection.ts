import { RefObject, useEffect, useRef } from "react";
import { Socket, io } from "socket.io-client";
import { Capacitor } from "@capacitor/core";
import { App, AppState } from "@capacitor/app";

import type { User } from "../../../api/auth";
import { getApiUrl } from "../../../api/client";
import { getSocketConfigForUrl } from "../../../api/serverRegistry";
import { dismissChatNotifications } from "../../../api/notifications";
import {
  addPictureInPictureActionListener,
} from "../../../native/callPlugin";
import { applyPictureInPictureAction } from "../../../videoPiPBridge";
import { audioPlaybackSession } from "../../../audioPlaybackSession";
import { videoPlaybackSession } from "../../../videoPlaybackSession";
import type { CallSessionApi } from "../calling/useCallSession";
import { activeSessionVideoElement, androidAppStatePayload } from "../shared/callLifecycle";
import { preferPollingFirst } from "../shared/socketPolling";

export type UseChatSocketConnectionParams = {
  socketRef: RefObject<Socket | null>;
  accessToken: string | null;
  currentUser: User | null;
  chatId: string | undefined;
  bindMessageListeners: (socket: Socket) => () => void;
  callSession: CallSessionApi;
  lastNativeVideoRevisionRef: RefObject<number>;
  reloadOverview: () => void;
};

/**
 * Sole owner of the shared socket.io connection: creates/tears it down as
 * the authenticated user changes, binds the message-realtime listeners
 * (`useChatRealtime`) and the call controller (`useCallSession.attachToSocket`)
 * onto it, tracks Android foreground/background state for push-notification
 * suppression, and forwards native picture-in-picture transport controls
 * (play/pause/seek) to the active in-conversation video element.
 *
 * Important: this effect must NOT depend on freshly-allocated objects like
 * `callSession` or unstable callback identities — that reconnects the socket
 * every render, fires reloadOverview on every connect, and pegs backend/DB CPU.
 */
export function useChatSocketConnection({
  socketRef,
  accessToken,
  currentUser,
  chatId,
  bindMessageListeners,
  callSession,
  lastNativeVideoRevisionRef,
  reloadOverview
}: UseChatSocketConnectionParams) {
  const chatIdRef = useRef(chatId);
  const accessTokenRef = useRef(accessToken);
  const bindMessageListenersRef = useRef(bindMessageListeners);
  const attachToSocketRef = useRef(callSession.attachToSocket);
  const callPhaseRef = useRef(callSession.callPhaseRef);
  const reloadOverviewRef = useRef(reloadOverview);
  const hasSession = Boolean(accessToken && currentUser?.id);

  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    bindMessageListenersRef.current = bindMessageListeners;
  }, [bindMessageListeners]);

  useEffect(() => {
    attachToSocketRef.current = callSession.attachToSocket;
    callPhaseRef.current = callSession.callPhaseRef;
  }, [callSession.attachToSocket, callSession.callPhaseRef]);

  useEffect(() => {
    reloadOverviewRef.current = reloadOverview;
  }, [reloadOverview]);

  // Keep the live socket's auth/query token current across accessToken refreshes
  // without tearing down and recreating the connection.
  useEffect(() => {
    const socket = socketRef.current;
    if (socket && accessToken) {
      socket.auth = { token: accessToken };
      const query =
        socket.io.opts.query && typeof socket.io.opts.query === "object"
          ? { ...(socket.io.opts.query as Record<string, string>) }
          : {};
      query.token = accessToken;
      socket.io.opts.query = query;
    }
  }, [accessToken, socketRef]);

  // Dismiss local notifications for the newly active chat and let the server
  // know whether the app is foregrounded on it (Android push suppression).
  useEffect(() => {
    if (chatId) {
      void dismissChatNotifications(chatId);
    }
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      void App.getState()
        .then((state) => {
          socketRef.current?.emit("app:state", androidAppStatePayload(state.isActive, chatId));
        })
        .catch(() => undefined);
    }
  }, [chatId, socketRef]);

  useEffect(() => {
    if (!hasSession) {
      return;
    }

    const token = accessTokenRef.current;
    if (!token) {
      return;
    }

    const isNative = Capacitor.isNativePlatform();
    const transports: Array<"polling" | "websocket"> = preferPollingFirst(window.location.hostname)
      ? ["polling", "websocket"]
      : ["websocket", "polling"];

    const apiUrl = getApiUrl();
    const socketConfig = getSocketConfigForUrl(apiUrl);

    // Capture token at connect time; later refreshes update socket.auth via the
    // effect above. Do NOT put accessToken in this effect's deps — a refresh
    // would tear down/rebuild the socket, fire connect → reloadOverview, and
    // create an API storm against backend/Postgres.
    const socket = io(socketConfig.origin, {
      path: socketConfig.path,
      auth: { token },
      query: { token },
      transports,
      // The backend Socket.IO implementation cannot reliably resume an authenticated
      // polling session over WebSocket: its WebSocket handshake omits the URL used by
      // the server's token extraction. Keep the authenticated polling transport for
      // browsers as well as native clients so calls are not lost during upgrade.
      upgrade: false,
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity
    });
    socketRef.current = socket;
    const detachMessageListeners = bindMessageListenersRef.current(socket);
    const detachCallSession = attachToSocketRef.current(socket, token);

    // Track foreground/background state on Android so the backend can decide
    // whether to suppress ntfy push notifications (only suppress when in foreground).
    let appStateListener: { remove: () => Promise<void> } | null = null;
    let appStateCancelled = false;
    let removePictureInPictureActionListener: (() => void) | null = null;
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      void (async () => {
        try {
          const currentState = await App.getState();
          if (!appStateCancelled) {
            socket.emit("app:state", androidAppStatePayload(currentState.isActive, chatIdRef.current));
            if (currentState.isActive && chatIdRef.current) {
              void dismissChatNotifications(chatIdRef.current);
            }
          }
          const listener = await App.addListener("appStateChange", (state: AppState) => {
            socket.emit("app:state", androidAppStatePayload(state.isActive, chatIdRef.current));
            if (state.isActive && chatIdRef.current) {
              void dismissChatNotifications(chatIdRef.current);
            }
          });
          if (appStateCancelled) {
            void listener.remove();
          } else {
            appStateListener = listener;
          }
        } catch {
          // Non-critical: if app state tracking fails, ntfy will fire as fallback.
        }
      })();

      void addPictureInPictureActionListener((event) => {
        if (callPhaseRef.current.current !== "idle") return;
        const snapshot = videoPlaybackSession.getSnapshot();
        const action = applyPictureInPictureAction(event, snapshot, lastNativeVideoRevisionRef.current);
        const element = activeSessionVideoElement();
        if (!action || !element) return;

        try {
          switch (action.type) {
            case "play":
              void audioPlaybackSession
                .pauseForVideo()
                .then(() => element.play())
                .catch(() => undefined);
              break;
            case "pause":
              element.pause();
              break;
            case "seek":
              element.currentTime = action.currentTime;
              break;
            case "mute":
              break;
          }
        } catch {
          // A detached or not-yet-seekable element safely ignores stale actions.
        }
      }).then((remove) => {
        if (appStateCancelled) {
          remove();
        } else {
          removePictureInPictureActionListener = remove;
        }
      });
    }

    const syncAfterSocketResume = () => {
      reloadOverviewRef.current();
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
        void App.getState()
          .then((state) => {
            socket.emit("app:state", androidAppStatePayload(state.isActive, chatIdRef.current));
          })
          .catch(() => undefined);
      }
    };

    // Only sync on successful (re)connect / server-requested sync.
    // Do NOT hook connect_error — that was firing reloadOverview in a storm
    // whenever the socket struggled, pegging backend + Postgres CPU.
    socket.on("connect", syncAfterSocketResume);
    socket.io.on("reconnect", syncAfterSocketResume);
    socket.on("sync:needed", syncAfterSocketResume);

    return () => {
      appStateCancelled = true;
      void appStateListener?.remove();
      removePictureInPictureActionListener?.();
      socket.off("connect", syncAfterSocketResume);
      socket.io.off("reconnect", syncAfterSocketResume);
      socket.off("sync:needed", syncAfterSocketResume);
      detachMessageListeners();
      detachCallSession();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [hasSession, currentUser?.id, lastNativeVideoRevisionRef, socketRef, getApiUrl()]);
}
