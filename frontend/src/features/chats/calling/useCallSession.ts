import {
  Dispatch,
  RefObject,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { Socket } from "socket.io-client";
import type { NavigateFunction } from "react-router-dom";
import { Capacitor } from "@capacitor/core";

import type { User } from "../../../api/auth";
import type { Chat, Message } from "../../../api/chats";
import CallController, {
  CallCapabilities,
  CallDevice,
  CallSettings,
  type RemoteMedia,
  type CallTopology
} from "../../../realtime/CallController";
import { waitForSocketConnection } from "../../../realtime/socketConnection";
import { createCallSoundPlayer } from "../../../realtime/callSounds";
import { getAudioSettings, mergeWithDefaults } from "../../../api/audioSettings";
import {
  addPictureInPictureListener,
  addProximityListener,
  disableNativeCallMode,
  enableNativeCallMode,
  isNativeCallPluginAvailable,
  setNativeActiveCallState,
  type PictureInPictureState
} from "../../../native/callPlugin";
import { isNativeScreenCaptureAvailable } from "../../../native/screenCapturePlugin";
import { navigateWithMotion } from "../../../motion/navigation";
import { audioPlaybackSession } from "../../../audioPlaybackSession";
import { videoPlaybackSession } from "../../../videoPlaybackSession";
import { activeSessionVideoElement, callTerminationEvent, hasLiveLocalVideo } from "../shared/callLifecycle";
import type { CallPhase, CallTrackStatus } from "../shared/types";
import { useCallTimer } from "./useCallTimer";

export type UseCallSessionParams = {
  accessToken: string | null;
  currentUser: User | null;
  selectedChat: Chat | null;
  chats: Chat[];
  members: User[];
  chatId: string | undefined;
  navigate: NavigateFunction;
  prefersReducedMotion: boolean;
  setError: (message: string | null) => void;
  chatsRef: RefObject<Chat[]>;
  activeChatIdRef: RefObject<string | undefined>;
  messageCacheRef: RefObject<Record<string, Message[]>>;
  setSelectedChat: Dispatch<SetStateAction<Chat | null>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setIsDetailsOpen: Dispatch<SetStateAction<boolean>>;
  socketRef: RefObject<Socket | null>;
  /** Restores the message-video PiP surface; owned by ChatsPage, invoked by the native PiP listener this hook registers. */
  restoreActiveVideoSurface: (state: PictureInPictureState) => void;
  setIsVideoPictureInPictureActive: Dispatch<SetStateAction<boolean>>;
  videoPictureInPictureActiveRef: RefObject<boolean>;
  lastNativeVideoRevisionRef: RefObject<number>;
};

/**
 * Sole owner of the CallController instance, call phase/state, audio & video
 * device settings, ringtone playback, native-call plugin integration
 * (proximity, PiP ownership arbitration, native call state reporting), and
 * call cleanup. The socket itself is still created/owned by ChatsPage (it is
 * shared with message realtime listeners); this hook exposes `attachToSocket`
 * so ChatsPage can wire the CallController + call:* listeners onto that
 * socket once it exists, mirroring the `bindMessageListeners` pattern used by
 * `useChatRealtime`.
 */
export function useCallSession({
  accessToken,
  currentUser,
  selectedChat,
  chats,
  members,
  chatId,
  navigate,
  prefersReducedMotion,
  setError,
  chatsRef,
  activeChatIdRef,
  messageCacheRef,
  setSelectedChat,
  setMessages,
  setIsDetailsOpen,
  socketRef,
  restoreActiveVideoSurface,
  setIsVideoPictureInPictureActive,
  videoPictureInPictureActiveRef,
  lastNativeVideoRevisionRef
}: UseCallSessionParams) {
  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const [activeCallChatId, setActiveCallChatId] = useState<string | null>(null);
  const [callPeerUserId, setCallPeerUserId] = useState<string | null>(null);
  const [callNotice, setCallNotice] = useState<string | null>(null);
  const [callType, setCallType] = useState<"audio" | "video">("audio");
  const [callAudioSettings, setCallAudioSettings] = useState<CallSettings>({
    micMuted: false,
    soundDisabled: false,
    cameraEnabled: false,
    screenSharing: false,
    cameraFacingMode: "user",
    speakerMode: "small",
    inputDeviceId: "",
    outputDeviceId: "",
    videoDeviceId: "",
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    voiceEnhancement: false,
    inputGain: 100,
    outputVolume: 100,
    voiceEnhancementThreshold: -24,
    voiceEnhancementHighpass: 120,
    mirrorLocalVideo: true
  });
  const [isCallSettingsMenuOpen, setIsCallSettingsMenuOpen] = useState(false);
  const [isCallAudioPopupOpen, setIsCallAudioPopupOpen] = useState(false);
  const [isCallVideoPopupOpen, setIsCallVideoPopupOpen] = useState(false);
  const [isCallMinimized, setIsCallMinimized] = useState(false);
  const [callTrackStatus, setCallTrackStatus] = useState<CallTrackStatus | null>(null);
  const [callAudioDevices, setCallAudioDevices] = useState<CallDevice[]>([]);
  const [callAudioCapabilities, setCallAudioCapabilities] = useState<CallCapabilities>({
    canSelectInputDevice: false,
    canSelectOutputDevice: false,
    canUseNoiseSuppression: false,
    canUseEchoCancellation: false,
    canUseAutoGainControl: false,
    canUseVoiceEnhancement: false,
    canUseCamera: false,
    canShareScreen: false
  });
  const [callAudioWarning, setCallAudioWarning] = useState<string | null>(null);
  const [isPeerSpeaking, setIsPeerSpeaking] = useState(false);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [speakingUserIds, setSpeakingUserIds] = useState<string[]>([]);
  const [isProximityNear, setIsProximityNear] = useState(false);
  const [isSpeakerSheetOpen, setIsSpeakerSheetOpen] = useState(false);
  const [callPeerDisplayName, setCallPeerDisplayName] = useState<string | null>(null);
  const [callRoomId, setCallRoomId] = useState<string | null>(null);
  const [callTopology, setCallTopology] = useState<CallTopology>("mesh");
  const [callRemoteMedia, setCallRemoteMedia] = useState<RemoteMedia[]>([]);
  const [callParticipantIds, setCallParticipantIds] = useState<string[]>([]);
  const [isCallInviteOpen, setIsCallInviteOpen] = useState(false);
  const [callInviteSelection, setCallInviteSelection] = useState<string[]>([]);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [remoteVideoStream, setRemoteVideoStream] = useState<MediaStream | null>(null);
  const callTimer = useCallTimer(callPhase === "in-call");

  const [activeGroupCalls, setActiveGroupCalls] = useState<Record<string, Record<string, any>>>({});
  const [preJoinChatId, setPreJoinChatId] = useState<string | null>(null);

  useEffect(() => {
    setActiveGroupCalls((prev) => {
      let changed = false;
      const next: Record<string, Record<string, any>> = {};
      for (const c of chats) {
        if (c.activeCall) {
          next[c.id] = c.activeCall;
        }
      }
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) {
        changed = true;
      } else {
        for (const k of nextKeys) {
          if (!prev[k] || JSON.stringify(prev[k]) !== JSON.stringify(next[k])) {
            changed = true;
            break;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [chats]);

  const openPreJoinModal = useCallback((chatId: string) => {
    setPreJoinChatId(chatId);
  }, []);

  const closePreJoinModal = useCallback(() => {
    setPreJoinChatId(null);
  }, []);

  const callRoomIdRef = useRef<string | null>(null);
  const audioCallRef = useRef<CallController | null>(null);
  const callSoundPlayerRef = useRef(createCallSoundPlayer());
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const activeCallChatIdRef = useRef<string | null>(null);
  // Per-session identifier set from call:ringing.createdAt; guards stale same-chatId
  // termination events from previous call sessions.
  const activeCallSessionIdRef = useRef<string | null>(null);
  const callTypeRef = useRef<"audio" | "video">("audio");
  const callPhaseRef = useRef<CallPhase>("idle");
  const pictureInPictureActiveRef = useRef(false);
  const soundDisabledRef = useRef(callAudioSettings.soundDisabled);
  const callSettingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const callSettingsMenuRef = useRef<HTMLDivElement | null>(null);
  const callAudioPopupRef = useRef<HTMLDivElement | null>(null);

  const activeCallChat = useMemo(
    () => (activeCallChatId ? chats.find((chat) => chat.id === activeCallChatId) ?? null : null),
    [activeCallChatId, chats]
  );
  const activeCallPeerName = useMemo(() => {
    if (activeCallChat?.type === "voice" || activeCallChat?.type === "group" || activeCallChat?.type === "family" || activeCallChat?.type === "channel") {
      return activeCallChat.title || (activeCallChat.type === "voice" ? "Voice Channel" : "Group Call");
    }
    if (selectedChat && selectedChat.id === activeCallChatId && (selectedChat.type === "voice" || selectedChat.type === "group" || selectedChat.type === "family" || selectedChat.type === "channel")) {
      return selectedChat.title || (selectedChat.type === "voice" ? "Voice Channel" : "Group Call");
    }
    if (!currentUser || !callPeerUserId) {
      if (activeCallChat) {
        return activeCallChat.title || "Active Call";
      }
      return "Active Call";
    }
    // Try selectedChat.members first — most up-to-date when the caller initiates
    if (selectedChat && selectedChat.id === activeCallChatId) {
      const m = selectedChat.members.find((candidate) => candidate.id === callPeerUserId);
      if (m?.displayName) return m.displayName;
    }
    if (activeCallChat) {
      const member = activeCallChat.members.find((candidate) => candidate.id === callPeerUserId);
      if (member?.displayName) {
        return member.displayName;
      }
    }
    const member = members.find((candidate) => candidate.id === callPeerUserId);
    return member?.displayName ?? "Active Call";
  }, [activeCallChat, activeCallChatId, callPeerUserId, currentUser, members, selectedChat]);

  const syncNativePictureInPictureCallState = useCallback(() => {
    const phase = callPhaseRef.current;
    if (phase !== "idle") {
      videoPictureInPictureActiveRef.current = false;
      setIsVideoPictureInPictureActive(false);
      try {
        activeSessionVideoElement()?.pause();
      } catch {
        // Detached media can reject a synchronous pause during route changes.
      }
    }
    if (!isNativeCallPluginAvailable()) return;

    const hasLiveSession = Boolean(activeCallSessionIdRef.current);
    const active = phase !== "idle" && hasLiveSession;
    // A native screen capture still relies on the WebView to turn capture frames
    // into the WebRTC track. Keep it visible in Android PiP when leaving an
    // audio call that is sharing the screen, just as we do for a camera call.
    const video = active && (
      callTypeRef.current === "video" || callAudioSettings.screenSharing
    );

    void setNativeActiveCallState({
      active,
      video,
      chatId: active ? activeCallChatIdRef.current : null,
      sessionId: active ? activeCallSessionIdRef.current : null
    });
  }, [
    callAudioSettings.screenSharing,
    setIsVideoPictureInPictureActive,
    videoPictureInPictureActiveRef
  ]);

  const restoreActiveCallSurface = useCallback(() => {
    if (callPhaseRef.current === "idle") {
      return;
    }

    setIsCallMinimized(false);
    setIsDetailsOpen(false);

    const callChatId = activeCallChatIdRef.current;
    if (!callChatId || activeChatIdRef.current === callChatId) {
      return;
    }

    const callChat = chatsRef.current.find((candidate) => candidate.id === callChatId) ?? null;
    if (callChat) {
      setSelectedChat(callChat);
      const cachedMessages = messageCacheRef.current[callChat.id];
      if (cachedMessages) {
        setMessages(cachedMessages);
      }
    }

    navigateWithMotion(navigate, `/app/chats/${callChatId}`, {
      reducedMotion: prefersReducedMotion
    });
  }, [
    activeChatIdRef,
    chatsRef,
    messageCacheRef,
    navigate,
    prefersReducedMotion,
    setIsDetailsOpen,
    setMessages,
    setSelectedChat
  ]);

  const stopCallRingtone = useCallback(() => {
    callSoundPlayerRef.current.stopRingtone();
  }, []);

  const startIncomingRingtone = useCallback(() => {
    callSoundPlayerRef.current.startIncomingRingtone(() => soundDisabledRef.current);
  }, []);

  const startOutgoingRingtone = useCallback(() => {
    callSoundPlayerRef.current.startOutgoingRingtone(() => soundDisabledRef.current);
  }, []);

  const playCallEndSound = useCallback(() => {
    void callSoundPlayerRef.current.playCallEndSound(() => soundDisabledRef.current);
  }, []);

  useEffect(() => {
    soundDisabledRef.current = callAudioSettings.soundDisabled;
  }, [callAudioSettings.soundDisabled]);

  // On Android (Capacitor), proactively acquire the local media stream as soon
  // as an incoming call is displayed.  This triggers the OS permission dialog
  // while the user can still see the incoming-call screen, so that when they
  // tap Accept the stream is already ready and no second dialog appears.
  useEffect(() => {
    if (callPhase !== "incoming") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = typeof window !== "undefined" ? (window as any).Capacitor : undefined;
    if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return;
    void audioCallRef.current?.prepareForCall(callType).catch(() => undefined);
  }, [callPhase, callType]);

  const refreshCallAudioDevices = useCallback(async () => {
    const controller = audioCallRef.current;
    if (!controller) {
      return;
    }
    const devices = await controller.getAvailableDevices();
    setCallAudioDevices(devices);
  }, []);

  const applyCallAudioPatch = useCallback(async (patch: Partial<CallSettings>) => {
    const controller = audioCallRef.current;
    setCallAudioWarning(null);
    setCallAudioSettings((current) => ({ ...current, ...patch }));
    if (!controller) {
      return;
    }
    try {
      await controller.applySettings(patch);
    } catch (err) {
      setCallAudioWarning(
        err instanceof Error ? err.message : "Could not apply setting. Check permissions."
      );
    }
  }, []);

  const toggleScreenShare = useCallback(async () => {
    const controller = audioCallRef.current;
    const next = !callAudioSettings.screenSharing;
    setCallAudioWarning(null);

    if (
      next &&
      !isNativeScreenCaptureAvailable() &&
      (typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getDisplayMedia !== "function")
    ) {
      const msg = "Screen demonstration is not supported on this browser or device";
      setCallNotice(msg);
      setCallAudioWarning(msg);
      return;
    }

    setCallAudioSettings((current) => ({ ...current, screenSharing: next }));
    if (!controller) {
      const msg = "Cannot share screen: call is not connected";
      setCallNotice(msg);
      setCallAudioWarning(msg);
      return;
    }
    try {
      await controller.toggleScreenShare(next);
      setCallNotice(next ? "Screen demonstration active" : null);
    } catch (err) {
      setCallAudioSettings((current) => ({ ...current, screenSharing: false }));
      const name = (err as DOMException)?.name ?? "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "AbortError") {
        setCallNotice("Screen demonstration permission was denied");
        setCallAudioWarning("Screen demonstration permission was denied");
        return;
      }
      const msg = err instanceof Error ? err.message : "Failed to share screen";
      setCallNotice(msg);
      setCallAudioWarning(msg);
    }
  }, [callAudioSettings.screenSharing]);

  useEffect(() => {
    if (!callNotice) return;
    const timer = window.setTimeout(() => {
      setCallNotice(null);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [callNotice]);

  // Call ↔ message media arbitration: suppress message audio/video while a call is active.
  useEffect(() => {
    void (async () => {
      if (callPhase !== "idle") {
        videoPlaybackSession.pauseActive();
        await audioPlaybackSession.setCallActive(true);
        return;
      }
      await audioPlaybackSession.setCallActive(false);
    })().catch(() => undefined);
  }, [callPhase]);

  useEffect(() => {
    syncNativePictureInPictureCallState();
  }, [
    activeCallChatId,
    callAudioSettings.screenSharing,
    callPhase,
    callType,
    syncNativePictureInPictureCallState
  ]);

  useEffect(() => {
    audioCallRef.current?.updateAccessToken(accessToken ?? "");
  }, [accessToken]);

  // Auto-minimize the call popup when the user opens a different chat.
  useEffect(() => {
    if (activeCallChatId && chatId && activeCallChatId !== chatId && callPhase !== "idle") {
      setIsCallMinimized(true);
    }
  }, [chatId, activeCallChatId, callPhase]);

  useEffect(() => {
    if (!isCallAudioPopupOpen) {
      return;
    }
    void refreshCallAudioDevices().catch(() => undefined);
    if (!navigator.mediaDevices?.addEventListener) {
      return;
    }
    const onDeviceChange = () => {
      void refreshCallAudioDevices().catch(() => undefined);
    };
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
    };
  }, [isCallAudioPopupOpen, refreshCallAudioDevices]);

  useEffect(() => {
    if (callAudioSettings.soundDisabled) {
      stopCallRingtone();
    }
  }, [callAudioSettings.soundDisabled, stopCallRingtone]);

  useEffect(() => {
    if (callPhase === "outgoing" && !callAudioSettings.soundDisabled) {
      startOutgoingRingtone();
    }
  }, [callPhase, callAudioSettings.soundDisabled, startOutgoingRingtone]);

  // Android: proximity sensor blanks the screen near the ear; route audio to earpiece/speaker.
  useEffect(() => {
    if (!isNativeCallPluginAvailable() || callPhase === "idle") {
      setIsProximityNear(false);
      void disableNativeCallMode();
      return;
    }

    const earpiece =
      callAudioSettings.speakerMode === "small" && !callAudioSettings.outputDeviceId;
    void enableNativeCallMode(earpiece);

    let removeListener: (() => void) | undefined;
    void addProximityListener((near) => setIsProximityNear(near)).then((remove) => {
      removeListener = remove;
    });

    return () => {
      removeListener?.();
      setIsProximityNear(false);
      void disableNativeCallMode();
    };
  }, [callPhase, callAudioSettings.speakerMode, callAudioSettings.outputDeviceId]);

  useEffect(() => {
    if (callPhase === "idle") {
      pictureInPictureActiveRef.current = false;
    }
  }, [callPhase]);

  // Watchdog timer for "connecting" phase: prevents eternal connecting state
  useEffect(() => {
    if (callPhase !== "connecting" || !activeCallChatId || !callPeerUserId) {
      return;
    }
    const timerId = setTimeout(() => {
      if (callPhaseRef.current === "connecting") {
        console.warn("[CALL] Connecting watchdog triggered — attempting signaling retry");
        if (audioCallRef.current && activeCallChatIdRef.current && callPeerUserId) {
          void audioCallRef.current.resumeSignaling(
            activeCallChatIdRef.current,
            callPeerUserId,
            callTypeRef.current,
            true
          );
        }
      }
    }, 6000);

    const timeoutId = setTimeout(() => {
      if (callPhaseRef.current === "connecting") {
        console.error("[CALL] Connecting watchdog timeout — connection failed");
        void resetCallState("Call connection timed out. Please try again.", false, true);
      }
    }, 15000);

    return () => {
      clearTimeout(timerId);
      clearTimeout(timeoutId);
    };
  }, [callPhase, activeCallChatId, callPeerUserId]);

  // Re-attach video refs to the controller whenever a call becomes active.
  // startOutgoing / acceptIncoming await getUserMedia (hundreds of ms), giving
  // React time to render the popup and populate the refs before they're needed.
  useEffect(() => {
    if (callPhase !== "idle" && audioCallRef.current) {
      audioCallRef.current.attachRemoteVideoElement(remoteVideoRef.current);
      audioCallRef.current.attachLocalVideoElement(localVideoRef.current);
      // Re-sync in case the remote track arrived before the call popup rendered.
      audioCallRef.current.syncRemoteVideoToUI();
    }
  }, [callPhase]);

  // When remote video track arrives, ensure the video element resumes playback
  // (some browsers won't auto-play a video element that was hidden when srcObject was set)
  useEffect(() => {
    if ((hasRemoteVideo || remoteVideoStream) && remoteVideoRef.current) {
      void remoteVideoRef.current.play().catch(() => undefined);
    }
  }, [hasRemoteVideo, remoteVideoStream]);

  // Sync localVideoRef with local screen stream or camera stream on desktop/1:1 view
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el) return;
    if (callAudioSettings.screenSharing && localScreenStream) {
      if (el.srcObject !== localScreenStream) {
        el.srcObject = localScreenStream;
      }
      void el.play().catch(() => undefined);
    } else if (localVideoStream && callAudioSettings.cameraEnabled) {
      if (el.srcObject !== localVideoStream) {
        el.srcObject = localVideoStream;
      }
      void el.play().catch(() => undefined);
    }
  }, [callAudioSettings.screenSharing, localScreenStream, localVideoStream, callAudioSettings.cameraEnabled]);

  // Native PiP ownership arbitration: decide whether the call surface or the
  // message-video surface owns the OS picture-in-picture window.
  useEffect(() => {
    if (!(Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android")) {
      return;
    }

    let cancelled = false;
    let removeListener: (() => void) | null = null;

    void addPictureInPictureListener((state: PictureInPictureState) => {
      pictureInPictureActiveRef.current = state.active;
      if (Number.isSafeInteger(state.acceptedRevision) && state.acceptedRevision >= 0) {
        lastNativeVideoRevisionRef.current = Math.max(
          lastNativeVideoRevisionRef.current,
          state.acceptedRevision
        );
      }
      if (state.active) {
        const videoOwner = state.owner === "video";
        videoPictureInPictureActiveRef.current = videoOwner;
        setIsVideoPictureInPictureActive(videoOwner);
        setIsCallMinimized(false);
        return;
      }
      videoPictureInPictureActiveRef.current = false;
      setIsVideoPictureInPictureActive(false);
      if (state.owner === "video") {
        restoreActiveVideoSurface(state);
      } else if (state.owner === "call" && callPhaseRef.current !== "idle") {
        restoreActiveCallSurface();
      }
    }).then((remove) => {
      if (cancelled) {
        remove();
      } else {
        removeListener = remove;
      }
    });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [
    lastNativeVideoRevisionRef,
    restoreActiveCallSurface,
    restoreActiveVideoSurface,
    setIsVideoPictureInPictureActive,
    videoPictureInPictureActiveRef
  ]);

  /** Dismiss the native Android incoming-call notification (no-op on web/iOS). */
  function dismissNativeCallNotification() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = typeof window !== "undefined" ? (window as any).Capacitor : undefined;
    if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cap.Plugins?.NtfyPlugin as any)?.dismissCallNotification?.();
    }
  }

  async function resetCallState(
    notice?: string,
    serverAlreadyNotified = false,
    playEndSoundEffect = true
  ) {
    console.log("[resetCallState] notice=", notice, "serverAlreadyNotified=", serverAlreadyNotified, new Error().stack?.split("\n").slice(1, 4).join(" | "));
    dismissNativeCallNotification();
    if (playEndSoundEffect && callPhaseRef.current !== "idle") {
      playCallEndSound();
    } else {
      stopCallRingtone();
    }
    await audioCallRef.current?.cleanup(serverAlreadyNotified);
    callPhaseRef.current = "idle";
    activeCallSessionIdRef.current = null;
    activeCallChatIdRef.current = null;
    callTypeRef.current = "audio";
    pictureInPictureActiveRef.current = false;
    setCallPhase("idle");
    setActiveCallChatId(null);
    setCallPeerUserId(null);
    setCallPeerDisplayName(null);
    setCallRoomId(null);
    callRoomIdRef.current = null;
    setCallTopology("mesh");
    setCallRemoteMedia([]);
    setCallParticipantIds([]);
    setIsCallInviteOpen(false);
    setCallInviteSelection([]);
    setHasRemoteVideo(false);
    setLocalVideoStream(null);
    setLocalScreenStream(null);
    setRemoteVideoStream(null);
    setCallType("audio");
    setCallAudioSettings((cur) => ({
      ...cur,
      micMuted: false,
      soundDisabled: false,
      cameraEnabled: false,
      screenSharing: false
    }));
    setIsCallSettingsMenuOpen(false);
    setIsCallAudioPopupOpen(false);
    setIsCallMinimized(false);
    setCallTrackStatus(null);
    setCallAudioWarning(null);
    setIsPeerSpeaking(false);
    setCallNotice(notice ?? null);
  }

  async function startDirectCall(type: "audio" | "video", inviteUserIds?: string[]) {
    console.log("[CALL] startDirectCall: entered type=", type, "callPhase=", callPhaseRef.current, "chatId=", selectedChat?.id, "socketConnected=", socketRef.current?.connected);
    if (callPhaseRef.current !== "idle") {
      console.warn("[CALL] startDirectCall: cannot start call while another call is active (callPhase=", callPhaseRef.current, ")");
      return;
    }
    const canCall =
      selectedChat &&
      currentUser &&
      (selectedChat.type === "direct" || selectedChat.type === "group" || selectedChat.type === "family");
    if (!canCall || !selectedChat || !currentUser) {
      console.warn("[CALL] startDirectCall: guard failed — selectedChat=", !!selectedChat, "type=", selectedChat?.type, "currentUser=", !!currentUser);
      return;
    }
    const socket = socketRef.current;
    if (!socket) {
      setError("Realtime is not connected yet. Please wait a moment and try again.");
      return;
    }
    console.log("[CALL] startDirectCall: ensuring socket connected, socket.connected=", socket.connected);
    const connected = await waitForSocketConnection(socket, { attemptTimeoutMs: 4500 });
    console.log("[CALL] startDirectCall: socket connected=", connected);
    if (!connected) {
      setError("Realtime connection is offline. Please refresh and try again.");
      return;
    }
    const peers = selectedChat.members.filter((member) => member.id !== currentUser.id);
    if (peers.length === 0) {
      console.warn("[CALL] startDirectCall: no peer member found in chat");
      return;
    }
    const selectedInvitees =
      inviteUserIds && inviteUserIds.length > 0
        ? inviteUserIds
        : selectedChat.type === "direct"
          ? [peers[0].id]
          : peers.map((p) => p.id);
    const primaryPeer = peers.find((p) => selectedInvitees.includes(p.id)) ?? peers[0];
    const isGroup = selectedChat.type === "group" || selectedChat.type === "family";
    console.log("[CALL] startDirectCall: peer=", primaryPeer.id, "invitees=", selectedInvitees, "isGroup=", isGroup);
    setError(null);
    setCallNotice(null);
    setCallType(type);
    callTypeRef.current = type;
    if (type === "audio") {
      void applyCallAudioPatch({ cameraEnabled: false, speakerMode: "small" });
    } else {
      void applyCallAudioPatch({ cameraEnabled: true, speakerMode: "large" });
    }
    const initialPhase: CallPhase = isGroup ? "connecting" : "outgoing";
    setCallPhase(initialPhase);
    callPhaseRef.current = initialPhase;
    activeCallSessionIdRef.current = "pending";
    setActiveCallChatId(selectedChat.id);
    setCallPeerUserId(primaryPeer.id);
    setCallPeerDisplayName(isGroup ? (selectedChat.title ?? primaryPeer.displayName ?? null) : (primaryPeer.displayName ?? null));
    setCallParticipantIds([currentUser.id, ...selectedInvitees]);
    setCallTopology("mesh");
    activeCallChatIdRef.current = selectedChat.id;
    audioCallRef.current?.setLocalUserId(currentUser.id);
    console.log("[CALL] startDirectCall: calling prepareForCall type=", type);
    try {
      await audioCallRef.current?.prepareForCall(type);
      console.log("[CALL] startDirectCall: prepareForCall resolved OK");
    } catch (err) {
      console.error("[CALL] startDirectCall: prepareForCall threw:", err instanceof Error ? err.name + ": " + err.message : err);
      stopCallRingtone();
      void audioCallRef.current?.cleanup(true).catch(() => undefined);
      setCallPhase("idle");
      callPhaseRef.current = "idle";
      activeCallSessionIdRef.current = null;
      callTypeRef.current = "audio";
      setActiveCallChatId(null);
      setCallPeerUserId(null);
      activeCallChatIdRef.current = null;
      setError(err instanceof Error ? err.message : "Microphone permission is required to call");
      return;
    }
    console.log("[CALL] startDirectCall: emitting call:start chatId=", selectedChat.id, "callType=", type);
    socket.emit("call:start", {
      chatId: selectedChat.id,
      callType: type,
      inviteUserIds: selectedInvitees
    });
    console.log("[CALL] startDirectCall: call:start emitted — waiting for call:ringing from server");
  }

  function sendCallInvites() {
    if (!callInviteSelection.length) {
      setIsCallInviteOpen(false);
      return;
    }
    audioCallRef.current?.inviteUsers(callInviteSelection);
    setIsCallInviteOpen(false);
    setCallInviteSelection([]);
  }

  async function acceptIncomingCall() {
    const socket = socketRef.current;
    if (!socket || !activeCallChatId || !callPeerUserId) {
      return;
    }
    dismissNativeCallNotification();
    setCallNotice(null);
    setCallPhase("connecting");
    callPhaseRef.current = "connecting"; // Sync update — see startDirectCall for rationale
    callTypeRef.current = callType;
    stopCallRingtone();
    try {
      if (callType === "audio") {
        await applyCallAudioPatch({ cameraEnabled: false, speakerMode: "small" });
      }
      // Acquire mic and create the peer BEFORE telling the server we accepted.
      // If this fails the call stays ringing — we must not emit call:accept then
      // call:end, which kills the session for both parties.
      if (callRoomIdRef.current) {
        audioCallRef.current?.setRoomId(callRoomIdRef.current);
      }
      if (currentUser?.id) {
        audioCallRef.current?.setLocalUserId(currentUser.id);
      }
      if (callTopology === "sfu") {
        await audioCallRef.current?.prepareForCall(callType);
      } else {
        await audioCallRef.current?.acceptIncoming(activeCallChatId, callPeerUserId, callType);
      }
      const connected = await waitForSocketConnection(socket, {
        onAttempt: (attempt, totalAttempts) => {
          setCallNotice(
            attempt === 1
              ? "Connecting to the call…"
              : `Reconnecting to the call… (${attempt}/${totalAttempts})`
          );
        }
      });
      if (!connected) {
        throw new Error("Realtime connection is still unavailable. Please try accepting again.");
      }
      socket.emit("call:accept", { chatId: activeCallChatId, roomId: callRoomIdRef.current ?? undefined });
      if (callTopology === "sfu") {
        await audioCallRef.current?.switchToSfu();
      }
    } catch (err) {
      await audioCallRef.current?.cleanup(true).catch(() => undefined);
      setCallPhase("incoming");
      setCallNotice(
        callType === "video" ? "Incoming video call" : "Incoming audio call"
      );
      setError(err instanceof Error ? err.message : "Could not join call");
    }
  }

  async function joinOngoingGroupCall(
    targetChat: Chat,
    activeCall: Record<string, any>,
    settings: { micMuted: boolean; cameraEnabled: boolean }
  ) {
    const socket = socketRef.current;
    if (!socket || !targetChat.id) {
      return;
    }
    setPreJoinChatId(null);
    const targetRoomId = activeCall.roomId;
    const targetTopology = (activeCall.topology as CallTopology) || "sfu";
    const targetCallType = (activeCall.callType || "audio") as "audio" | "video";

    dismissNativeCallNotification();
    stopCallRingtone();
    setCallNotice(null);
    setActiveCallChatId(targetChat.id);
    activeCallChatIdRef.current = targetChat.id;
    setCallRoomId(targetRoomId);
    callRoomIdRef.current = targetRoomId;
    setCallTopology(targetTopology);
    setCallType(targetCallType);
    callTypeRef.current = targetCallType;

    setCallPhase("connecting");
    callPhaseRef.current = "connecting";

    try {
      await applyCallAudioPatch({
        micMuted: settings.micMuted,
        cameraEnabled: settings.cameraEnabled,
        speakerMode: targetCallType === "video" ? "large" : "small",
      });

      if (targetRoomId) {
        audioCallRef.current?.setRoomId(targetRoomId);
      }
      if (currentUser?.id) {
        audioCallRef.current?.setLocalUserId(currentUser.id);
      }

      if (targetTopology === "sfu") {
        await audioCallRef.current?.prepareForCall(targetCallType);
      } else {
        const callerId = activeCall.callerId || currentUser?.id || "";
        await audioCallRef.current?.acceptIncoming(targetChat.id, callerId, targetCallType);
      }

      const connected = await waitForSocketConnection(socket, {
        onAttempt: (attempt, totalAttempts) => {
          setCallNotice(
            attempt === 1
              ? "Connecting to the call…"
              : `Reconnecting to the call… (${attempt}/${totalAttempts})`
          );
        }
      });
      if (!connected) {
        throw new Error("Realtime connection is still unavailable. Please try joining again.");
      }

      socket.emit("call:accept", { chatId: targetChat.id, roomId: targetRoomId });
      if (targetTopology === "sfu") {
        await audioCallRef.current?.switchToSfu();
      }
    } catch (err) {
      await audioCallRef.current?.cleanup(true).catch(() => undefined);
      void resetCallState("Could not join call", true, false);
      setError(err instanceof Error ? err.message : "Could not join call");
    }
  }

  async function joinVoiceChannel(
    targetChat: Chat,
    settings: { micMuted?: boolean; cameraEnabled?: boolean } = { micMuted: false, cameraEnabled: false }
  ) {
    const socket = socketRef.current;
    if (!socket || !targetChat.id) {
      return;
    }
    if (callPhaseRef.current !== "idle" && activeCallChatIdRef.current !== targetChat.id) {
      await endActiveCall();
    }

    dismissNativeCallNotification();
    stopCallRingtone();
    setCallNotice("Connecting to voice channel…");
    setActiveCallChatId(targetChat.id);
    activeCallChatIdRef.current = targetChat.id;
    setCallTopology("sfu");
    setCallType("audio");
    callTypeRef.current = "audio";

    setCallPhase("connecting");
    callPhaseRef.current = "connecting";

    try {
      await applyCallAudioPatch({
        micMuted: Boolean(settings.micMuted),
        cameraEnabled: Boolean(settings.cameraEnabled),
        speakerMode: "small",
      });

      if (currentUser?.id) {
        audioCallRef.current?.setLocalUserId(currentUser.id);
      }
      audioCallRef.current?.setChatId(targetChat.id);

      await audioCallRef.current?.prepareForCall("audio");

      const connected = await waitForSocketConnection(socket, {
        onAttempt: (attempt, totalAttempts) => {
          setCallNotice(
            attempt === 1
              ? "Connecting to voice channel…"
              : `Reconnecting to voice channel… (${attempt}/${totalAttempts})`
          );
        }
      });
      if (!connected) {
        throw new Error("Realtime connection is still unavailable. Please try joining again.");
      }

      socket.emit("call:join", { chatId: targetChat.id, callType: "audio" });
    } catch (err) {
      await audioCallRef.current?.cleanup(true).catch(() => undefined);
      void resetCallState("Could not join voice channel", true, false);
      setError(err instanceof Error ? err.message : "Could not join voice channel");
    }
  }

  function declineIncomingCall() {
    const declineChatId = activeCallChatId ?? activeCallChatIdRef.current;
    if (!socketRef.current || !declineChatId) {
      return;
    }
    stopCallRingtone();
    socketRef.current.emit("call:decline", { chatId: declineChatId });
    // Reset local state immediately (optimistic) — don't wait for the server
    // round-trip.  The server will still send call:declined to the caller which
    // triggers their own reset.  Passing serverAlreadyNotified=true prevents
    // cleanup() from emitting a duplicate call:end.
    void resetCallState("Call declined", true, false);
  }

  async function endActiveCall() {
    if (!socketRef.current || !activeCallChatId) {
      return;
    }
    const endingChatId = activeCallChatId;
    const terminationEvent = callTerminationEvent(callPhaseRef.current);
    setCallNotice("Ending call...");
    stopCallRingtone();
    playCallEndSound();
    callPhaseRef.current = "idle";
    activeCallSessionIdRef.current = null;
    activeCallChatIdRef.current = null;
    callTypeRef.current = "audio";
    pictureInPictureActiveRef.current = false;
    socketRef.current.emit(terminationEvent, { chatId: activeCallChatId });
    // serverAlreadyNotified=true: we just sent the phase-appropriate termination
    // event above, so cleanup must not send a second call:end.
    await audioCallRef.current?.cleanup(true).catch(() => undefined);
    setCallPhase("idle");
    setActiveCallChatId(null);
    setCallPeerUserId(null);
    setCallPeerDisplayName(null);
    setHasRemoteVideo(false);
    setLocalVideoStream(null);
    setLocalScreenStream(null);
    setRemoteVideoStream(null);
    setCallType("audio");
    setCallAudioSettings((cur) => ({
      ...cur,
      micMuted: false,
      soundDisabled: false,
      cameraEnabled: false,
      screenSharing: false
    }));
    setIsCallSettingsMenuOpen(false);
    setIsCallAudioPopupOpen(false);
    setIsCallMinimized(false);
    setCallTrackStatus(null);
    setCallAudioWarning(null);
    setIsPeerSpeaking(false);
    setCallNotice("Call ended");
    if (selectedChat?.id === endingChatId && selectedChat.type === "direct") {
      window.setTimeout(() => {
        setCallNotice((current) => (current === "Call ended" ? null : current));
      }, 2200);
    }
  }

  /**
   * Creates the CallController for a freshly-created socket, wires its
   * callbacks to call state, and binds every `call:*` socket listener.
   * Returns a cleanup function that ChatsPage must invoke (before
   * disconnecting the socket) when the owning effect tears down.
   */
  const attachToSocket = useCallback(
    (socket: Socket, socketAccessToken: string) => {
      const audioController = new CallController(socket, socketAccessToken);
      if (currentUser?.id) {
        audioController.setLocalUserId(currentUser.id);
      }
      audioController.attachRemoteAudioElement(remoteAudioRef.current);
      audioController.onVideoUnavailable = () => {
        setCallType("audio");
        setCallNotice("Camera not available — continuing with audio only");
      };
      audioController.onConnectionReconnecting = () => {
        if (callPhaseRef.current === "idle") return;
        setCallPhase("connecting");
        setCallNotice("Reconnecting to call…");
      };
      audioController.onConnectionEstablished = () => {
        console.log("[CALL] onConnectionEstablished fired callPhase=", callPhaseRef.current);
        setCallPhase("in-call");
        setCallNotice(null);
        if (callTypeRef.current === "video") {
          void applyCallAudioPatch({ speakerMode: "large" });
        }
      };
      // When the remote party enables their camera mid-call, show the video UI
      // on the receiving side without requiring the local user to act.
      audioController.onRemoteVideoTrack = (stream: MediaStream) => {
        setCallType("video");
        setHasRemoteVideo(true);
        setRemoteVideoStream(stream);
      };
      audioController.onLocalStreamReady = (stream: MediaStream) => {
        if (hasLiveLocalVideo(stream)) {
          setLocalVideoStream(stream);
        }
      };
      audioController.onLocalScreenStreamChange = (stream: MediaStream | null) => {
        setLocalScreenStream(stream);
      };
      audioController.onRemoteMediaChange = (media) => {
        setCallRemoteMedia(media);
        const withVideo = media.find((m) => m.hasScreenShare || m.hasVideo);
        if (withVideo) {
          setHasRemoteVideo(true);
          setRemoteVideoStream(
            withVideo.hasScreenShare && withVideo.screenStream
              ? withVideo.screenStream
              : withVideo.stream
          );
        }
      };
      audioController.onTopologyChange = (topology) => {
        setCallTopology(topology);
        if (topology === "sfu") {
          setCallNotice("Switching to group media…");
        }
      };
      audioController.onScreenShareEnded = () => {
        setCallAudioSettings((cur) => ({ ...cur, screenSharing: false }));
        setLocalScreenStream(null);
      };
      audioController.onSpeakingChange(setIsPeerSpeaking);
      audioController.onLocalSpeakingChange(setIsLocalSpeaking);
      audioController.onPeerSpeakingUserIdsChange(setSpeakingUserIds);
      setCallAudioCapabilities(audioController.getCapabilities());
      setCallAudioSettings(audioController.getSettings());
      audioCallRef.current = audioController;

      let audioSettingsCancelled = false;
      void getAudioSettings(socketAccessToken)
        .then((saved) => {
          if (audioSettingsCancelled) return;
          const merged = mergeWithDefaults(saved);
          setCallAudioSettings((cur) => ({ ...cur, ...merged }));
          return audioController.applySettings(merged);
        })
        .catch(() => undefined);

      function isSessionMismatch(p: { sessionStartedAt?: string; chatId?: string }) {
        if (callPhaseRef.current === "idle") {
          console.log("[CALL] isSessionMismatch: MISMATCH — callPhase is idle");
          return true; // not in a call
        }
        if (p.chatId && activeCallChatIdRef.current && p.chatId !== activeCallChatIdRef.current) {
          console.log("[CALL] isSessionMismatch: MISMATCH — chatId", p.chatId, "!== activeCallChatId", activeCallChatIdRef.current);
          return true; // wrong chat
        }
        if (activeCallSessionIdRef.current) {
          if (!p.sessionStartedAt || p.sessionStartedAt !== activeCallSessionIdRef.current) {
            console.log("[CALL] isSessionMismatch: MISMATCH — sessionStartedAt", p.sessionStartedAt, "!== activeSession", activeCallSessionIdRef.current);
            return true; // stale or untagged session
          }
        }
        console.log("[CALL] isSessionMismatch: PASS — event is for current session");
        return false;
      }

      socket.on(
        "call:ringing",
        (payload: {
          chatId: string;
          roomId?: string;
          callerId: string;
          calleeId: string;
          callType?: string;
          topology?: CallTopology;
          expiresAt?: string;
          createdAt?: string;
          participants?: Array<{ userId: string; state: string; role: string }>;
        }) => {
          console.log("[call:ringing] received", payload, "selfId=", currentUser?.id);
          const selfUserId = currentUser?.id ?? null;
          const isCaller = selfUserId !== null && payload.callerId === selfUserId;
          if (callPhaseRef.current !== "idle") {
            const isPendingOutgoingConfirm =
              isCaller &&
              activeCallSessionIdRef.current === "pending" &&
              payload.chatId === activeCallChatIdRef.current;
            const isCurrentSessionReemit =
              payload.createdAt && payload.createdAt === activeCallSessionIdRef.current;
            if (!isPendingOutgoingConfirm && !isCurrentSessionReemit) {
              console.log("[call:ringing] ignoring stale event — active session mismatch",
                "payload.createdAt=", payload.createdAt,
                "payload.chatId=", payload.chatId,
                "activeSession=", activeCallSessionIdRef.current,
                "activeChat=", activeCallChatIdRef.current);
              return;
            }
          }
          const incomingCallType: "audio" | "video" = payload.callType === "video" ? "video" : "audio";
          setCallType(incomingCallType);
          setActiveCallChatId(payload.chatId);
          activeCallChatIdRef.current = payload.chatId;
          if (payload.roomId) {
            setCallRoomId(payload.roomId);
            callRoomIdRef.current = payload.roomId;
            audioController.setRoomId(payload.roomId);
          }
          audioController.setChatId(payload.chatId);
          if (payload.topology) {
            setCallTopology(payload.topology);
            audioController.setTopology(payload.topology);
          }
          if (selfUserId) {
            audioController.setLocalUserId(selfUserId);
          }
          if (payload.participants) {
            setCallParticipantIds(payload.participants.map((p) => p.userId));
          }
          if (payload.createdAt) {
            activeCallSessionIdRef.current = payload.createdAt;
          }
          const peerId = isCaller
            ? (payload.participants?.find((p) => p.userId !== selfUserId)?.userId ?? payload.calleeId)
            : payload.callerId;
          setCallPeerUserId(peerId);

          const chat = chatsRef.current.find((c) => c.id === payload.chatId) ?? selectedChat;
          const isGroup = chat ? (chat.type === "group" || chat.type === "family") : (payload.participants ? payload.participants.length > 2 : false);
          const selfParticipant = payload.participants?.find((p) => p.userId === selfUserId);
          const isSelfConnected = selfParticipant?.state === "connected" || selfParticipant?.state === "connecting";

          if (payload.chatId && isGroup) {
            setActiveGroupCalls((prev) => ({
              ...prev,
              [payload.chatId]: {
                roomId: payload.roomId,
                chatId: payload.chatId,
                callerId: payload.callerId,
                callType: payload.callType,
                topology: payload.topology,
                participants: payload.participants,
                createdAt: payload.createdAt,
              },
            }));
          }

          if (isCaller) {
            if (isGroup || isSelfConnected) {
              console.log("[CALL] call:ringing: isCaller=true & isGroup/connected — transitioning immediately to in-call, sessionId=", payload.createdAt);
              stopCallRingtone();
              setCallPhase("in-call");
              callPhaseRef.current = "in-call";
              setCallNotice(null);
              if (selfUserId) {
                void audioController.syncMeshPeers([selfUserId]).catch((err) => {
                  console.error("[CALL] syncMeshPeers for group host failed:", err);
                });
              }
            } else {
              console.log("[CALL] call:ringing: isCaller=true — transitioning to outgoing, sessionId=", payload.createdAt);
              setCallPhase("outgoing");
              callPhaseRef.current = "outgoing";
            }
          } else {
            console.log("[CALL] call:ringing: isCaller=false — transitioning to incoming, sessionId=", payload.createdAt);
            setCallPhase("incoming");
            callPhaseRef.current = "incoming";
            setCallNotice(incomingCallType === "video" ? "Incoming video call" : "Incoming audio call");
            startIncomingRingtone();
          }
        }
      );

      socket.on("call:accepted", (payload: {
        chatId: string;
        roomId?: string;
        callerId: string;
        calleeId: string;
        callType?: string;
        topology?: CallTopology;
        sessionStartedAt?: string;
        participants?: Array<{ userId: string; state: string; role: string }>;
      }) => {
        console.log("[call:accepted] chatId=", payload.chatId, "ref=", activeCallChatIdRef.current, "currentUser=", currentUser?.id);
        if (!currentUser || payload.chatId !== activeCallChatIdRef.current) {
          console.warn("[call:accepted] GUARD FAILED — bailing. currentUser=", !!currentUser, "chatMatch=", payload.chatId === activeCallChatIdRef.current);
          return;
        }
        stopCallRingtone();
        const mediaPeers = (payload.participants ?? [])
          .filter((p) => p.userId !== currentUser.id && (p.state === "connecting" || p.state === "connected"))
          .map((p) => p.userId);
        const peerId = mediaPeers[0]
          ?? (payload.callerId === currentUser.id ? payload.calleeId : payload.callerId);
        const acceptedCallType: "audio" | "video" = payload.callType === "video" ? "video" : "audio";
        if (payload.sessionStartedAt) {
          activeCallSessionIdRef.current = payload.sessionStartedAt;
        }
        if (payload.roomId) {
          setCallRoomId(payload.roomId);
          callRoomIdRef.current = payload.roomId;
          audioController.setRoomId(payload.roomId);
        }
        audioController.setChatId(payload.chatId);
        if (payload.topology) {
          setCallTopology(payload.topology);
          audioController.setTopology(payload.topology);
        }
        audioController.setLocalUserId(currentUser.id);
        setCallPeerUserId(peerId);
        setCallType(acceptedCallType);
        callTypeRef.current = acceptedCallType;
        setCallParticipantIds((payload.participants ?? []).map((p) => p.userId));
        setCallPhase("connecting");

        if (payload.chatId) {
          setActiveGroupCalls((prev) => {
            const existing = prev[payload.chatId];
            if (!existing) return prev;
            return {
              ...prev,
              [payload.chatId]: {
                ...existing,
                ...(payload.roomId ? { roomId: payload.roomId } : {}),
                ...(payload.topology ? { topology: payload.topology } : {}),
                ...(payload.participants ? { participants: payload.participants } : {}),
              },
            };
          });
        }

        const joinMedia = async () => {
          if (payload.topology === "sfu") {
            try {
              await audioController.switchToSfu();
              return;
            } catch (sfuErr) {
              console.warn("[call:accepted] SFU join failed, attempting mesh fallback:", sfuErr);
              setCallTopology("mesh");
              audioController.setTopology("mesh");
              if (mediaPeers.length > 0) {
                await audioController.syncMeshPeers([currentUser.id, ...mediaPeers]);
                return;
              }
              if (payload.callerId === currentUser.id) {
                await audioController.startOutgoing(payload.chatId, peerId, acceptedCallType);
              } else {
                await audioController.acceptIncoming(payload.chatId, peerId, acceptedCallType);
              }
              return;
            }
          }
          if (mediaPeers.length > 0) {
            await audioController.syncMeshPeers([currentUser.id, ...mediaPeers]);
            return;
          }
          if (payload.callerId === currentUser.id) {
            await audioController.startOutgoing(payload.chatId, peerId, acceptedCallType);
          } else {
            await audioController.acceptIncoming(payload.chatId, peerId, acceptedCallType);
          }
        };

        void joinMedia()
          .then(() => {
            console.log("[call:accepted] media join resolved");
            setCallPhase("in-call");
            callPhaseRef.current = "in-call";
            setCallNotice(null);
          })
          .catch(async (err) => {
            console.error("[call:accepted] media join threw:", err);
            if (socket.connected) socket.emit("call:end", { chatId: payload.chatId, roomId: payload.roomId });
            await resetCallState("Camera/mic permission or device failed", true, false);
            setError(err instanceof Error ? err.message : "Could not start call");
          });
      });

      socket.on("call:participant-updated", (payload: {
        chatId?: string;
        roomId?: string;
        topology?: CallTopology;
        participants?: Array<{ userId: string; state: string; role: string }>;
      }) => {
        if (!currentUser || callPhaseRef.current === "idle") return;
        if (payload.chatId && payload.chatId !== activeCallChatIdRef.current) return;
        const participants = payload.participants ?? [];
        setCallParticipantIds(participants.map((p) => p.userId));
        if (payload.roomId) {
          setCallRoomId(payload.roomId);
          callRoomIdRef.current = payload.roomId;
          audioController.setRoomId(payload.roomId);
        }
        if (payload.chatId) {
          setActiveGroupCalls((prev) => {
            const existing = prev[payload.chatId!];
            if (!existing) return prev;
            return {
              ...prev,
              [payload.chatId!]: {
                ...existing,
                ...(payload.roomId ? { roomId: payload.roomId } : {}),
                ...(payload.topology ? { topology: payload.topology } : {}),
                ...(payload.participants ? { participants: payload.participants } : {}),
              },
            };
          });
        }
        const mediaPeers = participants
          .filter((p) => p.userId !== currentUser.id && (p.state === "connecting" || p.state === "connected"))
          .map((p) => p.userId);
        if (payload.topology === "sfu") {
          setCallTopology("sfu");
          void audioController.switchToSfu()
            .then(() => {
              setCallNotice(null);
              setCallPhase("in-call");
              callPhaseRef.current = "in-call";
            })
            .catch((err) => {
              console.warn("[call:participant-updated] switchToSfu failed, continuing with mesh:", err);
              setCallTopology("mesh");
              audioController.setTopology("mesh");
              setCallNotice(null);
              setCallPhase("in-call");
              callPhaseRef.current = "in-call";
              if (mediaPeers.length > 0) {
                void audioController.syncMeshPeers([currentUser.id, ...mediaPeers]).catch(() => undefined);
              }
            });
          return;
        }
        if (mediaPeers.length > 0 && callPhaseRef.current !== "incoming" && callPhaseRef.current !== "outgoing") {
          void audioController.syncMeshPeers([currentUser.id, ...mediaPeers]).catch((err) => {
            console.error("[call:participant-updated] syncMeshPeers failed", err);
          });
        }
      });

      socket.on("call:topology", (payload: {
        chatId?: string;
        roomId?: string;
        topology?: CallTopology;
        sfuUrl?: string;
        roomName?: string;
      }) => {
        if (!currentUser || callPhaseRef.current === "idle") return;
        if (payload.chatId && payload.chatId !== activeCallChatIdRef.current) return;
        if (payload.roomId) {
          setCallRoomId(payload.roomId);
          callRoomIdRef.current = payload.roomId;
          audioController.setRoomId(payload.roomId);
        }
        if (payload.topology === "sfu") {
          setCallTopology("sfu");
          setCallNotice("Switching to group media…");
          void audioController.switchToSfu()
            .then(() => {
              setCallNotice(null);
              setCallPhase("in-call");
              callPhaseRef.current = "in-call";
            })
            .catch((err) => {
              console.warn("[call:topology] switchToSfu failed, keeping mesh:", err);
              setCallTopology("mesh");
              audioController.setTopology("mesh");
              setCallNotice(null);
              setCallPhase("in-call");
              callPhaseRef.current = "in-call";
            });
        }
      });

      socket.on(
        "call:signal",
        (payload: { chatId: string; fromUserId: string; data: Record<string, unknown> }) => {
          void audioController.handleSignal(payload as { chatId: string; fromUserId: string; data: Record<string, unknown> }).catch((err) => {
            setError(err instanceof Error ? err.message : "Call signaling failed");
          });
        }
      );

      socket.on("call:declined", (payload: { chatId?: string; sessionStartedAt?: string }) => {
        console.log("[CALL] call:declined received chatId=", payload?.chatId, "sessionStartedAt=", payload?.sessionStartedAt, "activeSession=", activeCallSessionIdRef.current, "callPhase=", callPhaseRef.current);
        if (payload?.chatId) {
          setActiveGroupCalls((prev) => {
            if (!prev[payload.chatId!]) return prev;
            const next = { ...prev };
            delete next[payload.chatId!];
            return next;
          });
        }
        // Guard against stale queued events from previous calls being delivered
        // via drainPendingEvents on socket reconnect killing a newly started call.
        if (isSessionMismatch(payload)) {
          console.log("[CALL] call:declined ignored — session mismatch or idle");
          return;
        }
        console.log("[CALL] call:declined: resetting call state");
        stopCallRingtone();
        // Server already ended the session — pass serverAlreadyNotified=true so
        // cleanup() does not send a redundant call:end that would produce a
        // spurious call:error response.
        void resetCallState("Call declined", true);
      });
      socket.on("call:canceled", (payload: { chatId?: string; sessionStartedAt?: string }) => {
        console.log("[CALL] call:canceled received chatId=", payload?.chatId, "sessionStartedAt=", payload?.sessionStartedAt, "activeSession=", activeCallSessionIdRef.current, "callPhase=", callPhaseRef.current);
        if (payload?.chatId) {
          setActiveGroupCalls((prev) => {
            if (!prev[payload.chatId!]) return prev;
            const next = { ...prev };
            delete next[payload.chatId!];
            return next;
          });
        }
        if (isSessionMismatch(payload)) {
          console.log("[CALL] call:canceled ignored — session mismatch or idle");
          return;
        }
        console.log("[CALL] call:canceled: resetting call state");
        stopCallRingtone();
        void resetCallState("Call canceled", true);
      });
      socket.on("call:timeout", (payload: { chatId?: string; sessionStartedAt?: string }) => {
        console.log("[CALL] call:timeout received chatId=", payload?.chatId, "sessionStartedAt=", payload?.sessionStartedAt, "activeSession=", activeCallSessionIdRef.current, "callPhase=", callPhaseRef.current);
        if (payload?.chatId) {
          setActiveGroupCalls((prev) => {
            if (!prev[payload.chatId!]) return prev;
            const next = { ...prev };
            delete next[payload.chatId!];
            return next;
          });
        }
        if (isSessionMismatch(payload)) {
          console.log("[CALL] call:timeout ignored — session mismatch or idle");
          return;
        }
        console.log("[CALL] call:timeout: resetting call state");
        stopCallRingtone();
        void resetCallState("Missed call", true);
      });
      socket.on("call:ended", (payload: { chatId?: string; sessionStartedAt?: string }) => {
        console.log("[call:ended] received chatId=", payload?.chatId, "sessionStartedAt=", payload?.sessionStartedAt, "activeSession=", activeCallSessionIdRef.current);
        if (payload?.chatId) {
          setActiveGroupCalls((prev) => {
            if (!prev[payload.chatId!]) return prev;
            const next = { ...prev };
            delete next[payload.chatId!];
            return next;
          });
        }
        if (isSessionMismatch(payload)) {
          console.log("[call:ended] ignoring — session mismatch or idle");
          return;
        }
        stopCallRingtone();
        void resetCallState("Call ended", true);
      });
      // call:sync is emitted by the server when the user's socket reconnects during
      // an active call. Resume WebRTC signaling so the call can recover from a brief
      // socket disconnect without ending the call entirely.
      socket.on("call:sync", (payload: { chatId: string; callerId: string; calleeId: string; callType?: string; state?: string }) => {
        console.log("[call:sync] received", payload);
        if (!currentUser || callPhaseRef.current === "idle") return;
        if (payload.chatId !== activeCallChatIdRef.current) return;
        const syncCallType: "audio" | "video" = payload.callType === "video" ? "video" : "audio";
        const asOfferer = payload.callerId === currentUser.id;
        const peerId = asOfferer ? payload.calleeId : payload.callerId;
        void audioController.resumeSignaling(payload.chatId, peerId, syncCallType, asOfferer).catch((err) => {
          console.error("[call:sync] resumeSignaling failed:", err);
        });
      });
      socket.on("call:error", (payload: { message?: string }) => {
        const message = payload.message ?? "Call failed";
        console.error("[call:error] received:", payload);
        stopCallRingtone();
        // Late call:end / call:signal on an already-cleared session is harmless noise.
        if (message === "Call not available") {
          if (callPhaseRef.current === "idle") return;
          void resetCallState("Call ended", true);
          return;
        }
        setError(message);
        // Server encountered an error and the session may already be gone;
        // pass serverAlreadyNotified=true to avoid a redundant call:end.
        void resetCallState(undefined, true);
      });

      return () => {
        audioSettingsCancelled = true;
        socket.off("call:ringing");
        socket.off("call:accepted");
        socket.off("call:participant-updated");
        socket.off("call:topology");
        socket.off("call:signal");
        socket.off("call:declined");
        socket.off("call:canceled");
        socket.off("call:timeout");
        socket.off("call:ended");
        socket.off("call:sync");
        socket.off("call:error");
        stopCallRingtone();
        // Do not emit call:end here — socket teardown must not kill an active call.
        void audioController.cleanup(true).catch(() => undefined);
        audioCallRef.current = null;
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser?.id]
  );

  return {
    // State
    callPhase,
    setCallPhase,
    activeCallChatId,
    setActiveCallChatId,
    callPeerUserId,
    setCallPeerUserId,
    callNotice,
    setCallNotice,
    callType,
    setCallType,
    callAudioSettings,
    setCallAudioSettings,
    isCallSettingsMenuOpen,
    setIsCallSettingsMenuOpen,
    isCallAudioPopupOpen,
    setIsCallAudioPopupOpen,
    isCallVideoPopupOpen,
    setIsCallVideoPopupOpen,
    isCallMinimized,
    setIsCallMinimized,
    callTrackStatus,
    setCallTrackStatus,
    callAudioDevices,
    setCallAudioDevices,
    callAudioCapabilities,
    setCallAudioCapabilities,
    callAudioWarning,
    setCallAudioWarning,
    isPeerSpeaking,
    setIsPeerSpeaking,
    isLocalSpeaking,
    setIsLocalSpeaking,
    speakingUserIds,
    setSpeakingUserIds,
    isProximityNear,
    setIsProximityNear,
    isSpeakerSheetOpen,
    setIsSpeakerSheetOpen,
    callPeerDisplayName,
    setCallPeerDisplayName,
    callRoomId,
    setCallRoomId,
    callTopology,
    setCallTopology,
    callRemoteMedia,
    setCallRemoteMedia,
    callParticipantIds,
    setCallParticipantIds,
    isCallInviteOpen,
    setIsCallInviteOpen,
    callInviteSelection,
    setCallInviteSelection,
    hasRemoteVideo,
    setHasRemoteVideo,
    localVideoStream,
    setLocalVideoStream,
    localScreenStream,
    setLocalScreenStream,
    remoteVideoStream,
    setRemoteVideoStream,
    callTimer,

    // Refs
    callRoomIdRef,
    audioCallRef,
    callSoundPlayerRef,
    remoteAudioRef,
    remoteVideoRef,
    localVideoRef,
    activeCallChatIdRef,
    activeCallSessionIdRef,
    callTypeRef,
    callPhaseRef,
    soundDisabledRef,
    callSettingsButtonRef,
    callSettingsMenuRef,
    callAudioPopupRef,

    // Computed
    activeCallChat,
    activeCallPeerName,

    // Handlers
    syncNativePictureInPictureCallState,
    restoreActiveCallSurface,
    stopCallRingtone,
    startIncomingRingtone,
    startOutgoingRingtone,
    playCallEndSound,
    refreshCallAudioDevices,
    applyCallAudioPatch,
    toggleScreenShare,
    startDirectCall,
    sendCallInvites,
    acceptIncomingCall,
    declineIncomingCall,
    endActiveCall,
    activeGroupCalls,
    preJoinChatId,
    openPreJoinModal,
    closePreJoinModal,
    joinOngoingGroupCall,
    joinVoiceChannel,

    // Socket wiring (called by ChatsPage's socket-owning effect)
    attachToSocket,

    // Transcription prerequisites — provided so sub-components (e.g.
    // DesktopCallControls) can use useTranscription without extra prop drilling.
    accessToken,
    socketRef
  };
}

export type CallSessionApi = ReturnType<typeof useCallSession>;
