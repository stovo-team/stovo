import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

import {
  bootstrapNotifications,
  consumePendingNotificationAction
} from "../api/notifications";
import { useAuth } from "../auth/AuthContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { navigateWithMotion } from "../motion/navigation";
import {
  getAudioPlaybackAppLinkPath,
  getInviteAppLinkPath,
  getQRLoginApprovalPath,
  getNotificationAppLink
} from "../appLinks";
import { parseConnectionLink } from "../connectionLink";
import { queuePendingNotificationAction } from "../notificationActions";
import { addNativeShareListener, consumeNativeSharedFiles } from "./shareReceiverPlugin";
import { queueSharedFiles } from "../sharedFileQueue";
import { applyServerNotificationDefaults, readDevicePreferences } from "../settings/devicePreferences";

/**
 * Starts NtfyService whenever a session is available — covers both login and
 * session restore on app reopen. Deduplicates via ref so it only fires once
 * per user ID (not on every token refresh).
 */
export function NotificationsBootstrapper() {
  const { currentUser, authRequest } = useAuth();
  const lastBootstrappedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!currentUser) {
      lastBootstrappedUserId.current = null;
      return;
    }
    if (lastBootstrappedUserId.current === currentUser.id) return;
    lastBootstrappedUserId.current = currentUser.id;
    void authRequest<{ defaultNotificationSettings: string }>("/api/family")
      .then((family) => applyServerNotificationDefaults(family.defaultNotificationSettings))
      .catch(() => undefined)
      .finally(() => void bootstrapNotifications(authRequest, readDevicePreferences()).catch(() => undefined));
  }, [currentUser, authRequest]);

  return null;
}

export function AndroidBackOrchestrator() {
  const location = useLocation();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return undefined;
    }

    let disposed = false;
    let listener: { remove: () => Promise<void> } | null = null;

    void (async () => {
      listener = await CapacitorApp.addListener("backButton", ({ canGoBack }) => {
        if (location.pathname.startsWith("/app/chats")) {
          return;
        }

        if (location.pathname.startsWith("/app/")) {
          if (canGoBack) {
            navigate(-1);
            return;
          }

          navigateWithMotion(navigate, "/app/chats", {
            replace: true,
            reducedMotion: prefersReducedMotion
          });
          return;
        }

        if (canGoBack) {
          navigate(-1);
          return;
        }

        void CapacitorApp.minimizeApp();
      });

      if (disposed) {
        void listener.remove();
      }
    })();

    return () => {
      disposed = true;
      void listener?.remove();
    };
  }, [location.pathname, navigate, prefersReducedMotion]);

  return null;
}

export function NativeAppLinkRouter() {
  const navigate = useNavigate();
  const { currentUser, isLoading } = useAuth();
  const lastCallbackLinkChatIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return undefined;
    }

    let disposed = false;
    let listener: { remove: () => Promise<void> } | null = null;

    const openAppLink = (url: string) => {
      const connection = parseConnectionLink(url);
      if (connection) {
        const params = new URLSearchParams({ server: connection.serverUrl, username: connection.username });
        params.set("deviceLogin", "1");
        navigate(`/server-setup?${params}`);
        return;
      }
      const notificationLink = getNotificationAppLink(url);
      if (notificationLink?.action === "callback") {
        const chatId = notificationLink.path.split("/").pop();
        if (chatId) {
          lastCallbackLinkChatIdRef.current = chatId;
          queuePendingNotificationAction({ type: "callback", chatId });
        }
      }
      const path = notificationLink
        ? `${notificationLink.path}${
            notificationLink.action
              ? `?notificationAction=${notificationLink.action}&notificationActionId=${Date.now()}`
              : ""
          }`
        : getQRLoginApprovalPath(url) ?? getAudioPlaybackAppLinkPath(url) ?? getInviteAppLinkPath(url);
      if (path) {
        navigate(path);
      }
    };

    void (async () => {
      listener = await CapacitorApp.addListener("appUrlOpen", ({ url }) => openAppLink(url));
      const launchUrl = await CapacitorApp.getLaunchUrl();
      if (launchUrl?.url) {
        openAppLink(launchUrl.url);
      }
      if (disposed) {
        void listener.remove();
      }
    })();

    return () => {
      disposed = true;
      void listener?.remove();
    };
  }, [navigate]);

  useEffect(() => {
    if (isLoading || !currentUser || !Capacitor.isNativePlatform()) {
      return;
    }
    let cancelled = false;
    void consumePendingNotificationAction().then((action) => {
      if (!action || cancelled) {
        return;
      }
      if (
        action.type === "callback" &&
        lastCallbackLinkChatIdRef.current === action.chatId
      ) {
        lastCallbackLinkChatIdRef.current = null;
        return;
      }
      queuePendingNotificationAction(action);
      navigate(
        `/app/chats/${encodeURIComponent(action.chatId)}?notificationAction=${action.type}` +
          `&notificationActionId=${Date.now()}`
      );
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser, isLoading, navigate]);

  return null;
}

export function NativeShareRouter() {
  const navigate = useNavigate();
  const { currentUser, isLoading } = useAuth();
  const [shareRevision, setShareRevision] = useState(0);

  useEffect(() => {
    let disposed = false;
    let remove: () => void = () => undefined;
    void addNativeShareListener(() => setShareRevision((current) => current + 1)).then((cleanup) => {
      remove = cleanup;
      if (disposed) remove();
    });
    return () => {
      disposed = true;
      remove();
    };
  }, []);

  useEffect(() => {
    if (isLoading || !currentUser) {
      return;
    }
    let cancelled = false;
    void consumeNativeSharedFiles().then((received) => {
      if (cancelled || (received.files.length === 0 && received.skippedCount === 0)) {
        return;
      }
      queueSharedFiles(received);
      navigate("/app/chats");
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser, isLoading, navigate, shareRevision]);

  return null;
}

export function NativeAppOrchestrators() {
  return (
    <>
      <NotificationsBootstrapper />
      <AndroidBackOrchestrator />
      <NativeAppLinkRouter />
      <NativeShareRouter />
    </>
  );
}

export default NativeAppOrchestrators;
