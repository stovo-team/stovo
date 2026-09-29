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

import type { User } from "../../../api/auth";
import type { Chat, Message } from "../../../api/chats";
import { getFamily } from "../../../api/family";
import CallController, {
  CallCapabilities,
  CallDevice,
  CallSettings,
  type CallTopology
} from "../../../realtime/CallController";
import { callQualityProfileForChatType, DEFAULT_CALL_QUALITY_BITRATES, resolveCallQualityBitrates, type CallQualityProfile } from "../../../realtime/call/callQuality";
import { waitForSocketConnection } from "../../../realtime/socketConnection";
import { waitForVoiceChannelConnection } from "./voiceChannelConnection";
import { createCallSoundPlayer } from "../../../realtime/callSounds";
import { getAudioSettings, mergeWithDefaults } from "../../../api/audioSettings";
import {
  isNativeCallPluginAvailable,
  setNativeActiveCallState,
  type PictureInPictureState
} from "../../../native/callPlugin";
import { navigateWithMotion } from "../../../motion/navigation";
import { activeSessionVideoElement, callTerminationEvent, hasLiveLocalVideo } from "../shared/callLifecycle";
import type { CallPhase, CallTrackStatus } from "../shared/types";
import { useCallTimer } from "./useCallTimer";
import { useCallMedia } from "./useCallMedia";
import { useCallSessionMediaEffects } from "./useCallSessionMediaEffects";
import { useCallSessionNativeEffects } from "./useCallSessionNativeEffects";
import { useCallInviteControls } from "./useCallInviteControls";
import { useCallSignaling } from "./useCallSignaling";

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
    voiceEnhancement: true,
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
  const [callParticipantIds, setCallParticipantIds] = useState<string[]>([]);
  const [isCallInviteOpen, setIsCallInviteOpen] = useState(false);
  const [callInviteSelection, setCallInviteSelection] = useState<string[]>([]);
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
  const {
    callRemoteMedia,
    setCallRemoteMedia,
    hasRemoteVideo,
    setHasRemoteVideo,
    localVideoStream,
    setLocalVideoStream,
    localScreenStream,
    setLocalScreenStream,
    remoteVideoStream,
    setRemoteVideoStream,
    remoteAudioRef,
    remoteVideoRef,
    localVideoRef,
    toggleScreenShare
  } = useCallMedia({
    audioCallRef,
    callPhase,
    callType,
    callAudioSettings,
    setCallAudioSettings,
    setCallAudioWarning,
    setCallNotice
  });

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
    // Android PiP keeps the active call WebView alive. This must include
    // audio-only calls (notably voice channels), not just camera or screen-share
    // calls, so leaving the app never tears down the active call surface.
    const video = active;

    void setNativeActiveCallState({
      active,
      video,
      chatId: active ? activeCallChatIdRef.current : null,
      sessionId: active ? activeCallSessionIdRef.current : null
    });
  }, [
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

  useEffect(() => {
    if (!callNotice) return;
    const timer = window.setTimeout(() => {
      setCallNotice(null);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [callNotice]);

  useCallSessionNativeEffects({
    callPhase, callAudioSettings, callPhaseRef, activeCallChatIdRef, activeCallSessionIdRef,
    pictureInPictureActiveRef, videoPictureInPictureActiveRef, lastNativeVideoRevisionRef,
    setIsProximityNear, setIsVideoPictureInPictureActive, setIsCallMinimized,
    syncNativePictureInPictureCallState, restoreActiveCallSurface, restoreActiveVideoSurface
  });

  useCallSessionMediaEffects({
    accessToken, callPhase, hasRemoteVideo, remoteVideoStream, localVideoStream, localScreenStream,
    cameraEnabled: callAudioSettings.cameraEnabled, screenSharing: callAudioSettings.screenSharing,
    audioCallRef, remoteVideoRef, localVideoRef
  });

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

  // Watchdog timer for "connecting" phase: prevents eternal connecting state
  useEffect(() => {
    if (callPhase !== "connecting" || !activeCallChatId || !callPeerUserId) {
      return;
    }
    const timerId = setTimeout(() => {
      if (callPhaseRef.current === "connecting") {
        console.warn("[CALL] Connecting watchdog triggered — attempting signaling retry");
        if (audioCallRef.current && activeCallChatIdRef.current && callPeerUserId !== currentUser?.id) {
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
  }, [callPhase, activeCallChatId, callPeerUserId, currentUser?.id]);

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
    setCallNotice(notice === "Call ended" ? null : notice ?? null);
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
      await loadCallQuality(callQualityProfileForChatType(selectedChat.type));
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

  const sendCallInvites = useCallInviteControls({
    audioCallRef,
    callInviteSelection,
    setCallInviteSelection,
    setIsCallInviteOpen
  });

  async function loadCallQuality(profile: CallQualityProfile) {
    if (!accessToken) {
      audioCallRef.current?.setCallQualityBitrates({ ...DEFAULT_CALL_QUALITY_BITRATES });
      return;
    }
    try {
      const family = await getFamily(accessToken);
      audioCallRef.current?.setCallQualityBitrates(resolveCallQualityBitrates(family, profile));
    } catch {
      audioCallRef.current?.setCallQualityBitrates({ ...DEFAULT_CALL_QUALITY_BITRATES });
    }
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
      const activeChat = chats.find((chat) => chat.id === activeCallChatId);
      await loadCallQuality(callQualityProfileForChatType(activeChat?.type));
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
      await loadCallQuality(callQualityProfileForChatType(targetChat.type));

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
    // PiP eligibility is keyed by a live session. Voice channels receive the
    // server session timestamp asynchronously, so arm the native call surface
    // immediately and replace this marker when `call:accepted` arrives.
    activeCallSessionIdRef.current = "pending";

    setCallPhase("connecting");
    callPhaseRef.current = "connecting";

    try {
      if (currentUser?.id) {
        audioCallRef.current?.setLocalUserId(currentUser.id);
      }
      audioCallRef.current?.setChatId(targetChat.id);
      void loadCallQuality(callQualityProfileForChatType(targetChat.type));

      const connected = await waitForVoiceChannelConnection(socket, (attempt, totalAttempts) => {
          setCallNotice(
            attempt === 1
              ? "Connecting to voice channel…"
              : `Reconnecting to voice channel… (${attempt}/${totalAttempts})`
          );
      });
      if (!connected) {
        throw new Error("Realtime connection is still unavailable. Please try joining again.");
      }

      await applyCallAudioPatch({
        micMuted: Boolean(settings.micMuted),
        cameraEnabled: Boolean(settings.cameraEnabled),
        speakerMode: "small",
      });
      socket.emit("call:join", { chatId: targetChat.id, callType: "audio" });
    } catch (err) {
      console.error("[CALL] Voice channel join failed before signaling", {
        message: err instanceof Error ? err.message : String(err),
        socketConnected: socket.connected,
        transport: socket.io.engine?.transport?.name ?? "unknown",
      });
      await audioCallRef.current?.cleanup(true).catch(() => undefined);
      void resetCallState(undefined, true, false);
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
    setCallNotice(null);
  }

  /**
   * Creates the CallController for a freshly-created socket, wires its
   * callbacks to call state, and binds every `call:*` socket listener.
   * Returns a cleanup function that ChatsPage must invoke (before
   * disconnecting the socket) when the owning effect tears down.
   */
  const attachToSocket = useCallSignaling({
    currentUser,
    remoteAudioRef,
    setCallType,
    setCallNotice,
    callPhaseRef,
    setCallPhase,
    callTypeRef,
    applyCallAudioPatch,
    setHasRemoteVideo,
    setRemoteVideoStream,
    setLocalVideoStream,
    setLocalScreenStream,
    setCallRemoteMedia,
    setCallTopology,
    setCallAudioSettings,
    setIsPeerSpeaking,
    setIsLocalSpeaking,
    setSpeakingUserIds,
    setCallAudioCapabilities,
    audioCallRef,
    activeCallChatIdRef,
    activeCallSessionIdRef,
    setActiveCallChatId,
    setCallRoomId,
    callRoomIdRef,
    setCallParticipantIds,
    setCallPeerUserId,
    chatsRef,
    selectedChat,
    setActiveGroupCalls,
    stopCallRingtone,
    startIncomingRingtone,
    setError,
    resetCallState
  });

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
