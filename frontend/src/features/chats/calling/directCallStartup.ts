import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Socket } from "socket.io-client";

import type { User } from "../../../api/auth";
import { getChat, type Chat } from "../../../api/chats";
import CallController, { type CallSettings, type CallTopology } from "../../../realtime/CallController";
import { callQualityProfileForChatType, type CallQualityProfile } from "../../../realtime/call/callQuality";
import { callTerminationEvent } from "../shared/callLifecycle";
import type { CallPhase } from "../shared/types";
import { launchCallStartup } from "./callStartup";
import { waitForSocketConnection } from "../../../realtime/socketConnection";

type DirectCallStartupRefs = {
  activeCallChatIdRef: RefObject<string | null>;
  activeCallSessionIdRef: RefObject<string | null>;
  callTypeRef: RefObject<"audio" | "video">;
  callPhaseRef: RefObject<CallPhase>;
  callStartupGenerationRef: RefObject<number>;
  callStartupPromiseRef: RefObject<Promise<void>>;
  callCleanupPromiseRef: RefObject<Promise<void>>;
};

type DirectCallStartupSetters = {
  setActiveCallChatId: Dispatch<SetStateAction<string | null>>;
  setCallAudioSettings: Dispatch<SetStateAction<CallSettings>>;
  setCallAudioWarning: Dispatch<SetStateAction<string | null>>;
  setCallNotice: Dispatch<SetStateAction<string | null>>;
  setCallParticipantIds: Dispatch<SetStateAction<string[]>>;
  setCallPeerDisplayName: Dispatch<SetStateAction<string | null>>;
  setCallPeerUserId: Dispatch<SetStateAction<string | null>>;
  setCallPhase: Dispatch<SetStateAction<CallPhase>>;
  setCallTopology: Dispatch<SetStateAction<CallTopology>>;
  setCallType: Dispatch<SetStateAction<"audio" | "video">>;
};

type MockCallSessionStartup = {
  isEnabled: boolean;
  startDirectCall: (type: "audio" | "video", inviteUserIds?: string[]) => Promise<boolean>;
};

type CreateDirectCallStarterParams = {
  accessToken: string | null;
  currentUser: User | null;
  selectedChat: Chat | null;
  socketRef: RefObject<Socket | null>;
  audioCallRef: RefObject<CallController | null>;
  refs: DirectCallStartupRefs;
  setters: DirectCallStartupSetters;
  mockCallSession: MockCallSessionStartup;
  setError: (message: string | null) => void;
  setSelectedChat: Dispatch<SetStateAction<Chat | null>>;
  resetCallState: (notice?: string, serverAlreadyNotified?: boolean, playEndSoundEffect?: boolean) => Promise<void>;
  applyCallAudioPatch: (patch: Partial<CallSettings>) => Promise<void>;
  loadCallQuality: (profile: CallQualityProfile) => Promise<void>;
};

export function createDirectCallStarter({
  accessToken,
  currentUser,
  selectedChat,
  socketRef,
  audioCallRef,
  refs,
  setters,
  mockCallSession,
  setError,
  setSelectedChat,
  resetCallState,
  applyCallAudioPatch,
  loadCallQuality
}: CreateDirectCallStarterParams) {
  return async function startDirectCall(type: "audio" | "video", inviteUserIds?: string[]) {
    console.log("[CALL] startDirectCall: entered type=", type, "callPhase=", refs.callPhaseRef.current, "chatId=", selectedChat?.id, "socketConnected=", socketRef.current?.connected);
    const canCall = selectedChat && currentUser && (
      selectedChat.type === "direct" || selectedChat.type === "group" || selectedChat.type === "family"
    );
    if (!canCall || !selectedChat || !currentUser) {
      console.warn("[CALL] startDirectCall: guard failed — selectedChat=", !!selectedChat, "type=", selectedChat?.type, "currentUser=", !!currentUser);
      return;
    }
    if (mockCallSession.isEnabled) {
      if (refs.callPhaseRef.current !== "idle") {
        console.warn("[CALL] startDirectCall: cannot start a mock call while another call is active (callPhase=", refs.callPhaseRef.current, ")");
        return;
      }
      if (await mockCallSession.startDirectCall(type, inviteUserIds)) return;
    }

    const chatAtStart = selectedChat;
    const userAtStart = currentUser;
    const initialPeers = chatAtStart.members.filter((member) => member.id !== userAtStart.id);
    const initialInvitees = inviteUserIds && inviteUserIds.length > 0
      ? inviteUserIds
      : chatAtStart.type === "direct"
        ? (initialPeers[0] ? [initialPeers[0].id] : [])
        : initialPeers.map((member) => member.id);
    const initialPeer = initialPeers.find((member) => initialInvitees.includes(member.id)) ?? initialPeers[0];
    const isGroup = chatAtStart.type === "group" || chatAtStart.type === "family";
    const initialPhase: CallPhase = isGroup ? "connecting" : "outgoing";
    const previousCallPhase = refs.callPhaseRef.current;
    const previousCallChatId = refs.activeCallChatIdRef.current;
    const socket = socketRef.current;
    if (previousCallPhase !== "idle") {
      console.warn("[CALL] startDirectCall: replacing local call state (callPhase=", previousCallPhase, ")");
      if (socket && previousCallChatId) {
        socket.emit(callTerminationEvent(previousCallPhase), { chatId: previousCallChatId });
      }
    }
    const previousCallCleanup = previousCallPhase !== "idle"
      ? resetCallState(undefined, true, false)
      : refs.callCleanupPromiseRef.current;
    const attemptId = ++refs.callStartupGenerationRef.current;
    const isCurrentAttempt = () =>
      refs.callStartupGenerationRef.current === attemptId &&
      refs.callPhaseRef.current !== "idle" &&
      refs.activeCallChatIdRef.current === chatAtStart.id;
    const previousStartup = refs.callStartupPromiseRef.current;

    setError(null);
    const startup = launchCallStartup(
      () => {
        setters.setCallNotice(null);
        setters.setCallType(type);
        refs.callTypeRef.current = type;
        const audioPatch = type === "audio"
          ? { cameraEnabled: false, speakerMode: "small" as const }
          : { cameraEnabled: true, speakerMode: "large" as const };
        setters.setCallAudioWarning(null);
        setters.setCallAudioSettings((current) => ({ ...current, ...audioPatch }));
        setters.setCallPhase(initialPhase);
        refs.callPhaseRef.current = initialPhase;
        refs.activeCallSessionIdRef.current = "pending";
        setters.setActiveCallChatId(chatAtStart.id);
        setters.setCallPeerUserId(initialPeer?.id ?? null);
        setters.setCallPeerDisplayName(isGroup
          ? (chatAtStart.title ?? initialPeer?.displayName ?? null)
          : (initialPeer?.displayName ?? null));
        setters.setCallParticipantIds([userAtStart.id, ...initialInvitees]);
        setters.setCallTopology("mesh");
        refs.activeCallChatIdRef.current = chatAtStart.id;
        audioCallRef.current?.setLocalUserId(userAtStart.id);
      },
      async () => {
        await previousStartup.catch(() => undefined);
        await previousCallCleanup.catch(() => undefined);
        if (!isCurrentAttempt()) return;
        await applyCallAudioPatch(type === "audio"
          ? { cameraEnabled: false, speakerMode: "small" }
          : { cameraEnabled: true, speakerMode: "large" });
        if (!isCurrentAttempt()) return;

        const activeSocket = socketRef.current;
        if (!activeSocket) throw new Error("Realtime is not connected yet. Please wait a moment and try again.");
        console.log("[CALL] startDirectCall: ensuring socket connected, socket.connected=", activeSocket.connected);
        const connected = await waitForSocketConnection(activeSocket, { attemptTimeoutMs: 4500 });
        if (!isCurrentAttempt()) return;
        if (!connected) throw new Error("Realtime connection is offline. Please refresh and try again.");

        let callChat = chatAtStart;
        let peers = callChat.members.filter((member) => member.id !== userAtStart.id);
        if (peers.length === 0 && accessToken) {
          try {
            callChat = await getChat(accessToken, chatAtStart.id);
            if (!isCurrentAttempt()) return;
            setSelectedChat(callChat);
            peers = callChat.members.filter((member) => member.id !== userAtStart.id);
          } catch (err) {
            console.warn("[CALL] startDirectCall: failed to refresh chat members", err);
          }
        }
        if (peers.length === 0 && callChat.type !== "group" && callChat.type !== "family") {
          throw new Error("This chat has no other members to call. Add someone to the chat and try again.");
        }

        const selectedInvitees = inviteUserIds && inviteUserIds.length > 0
          ? inviteUserIds
          : callChat.type === "direct"
            ? [peers[0].id]
            : peers.map((peer) => peer.id);
        const primaryPeer = peers.find((peer) => selectedInvitees.includes(peer.id)) ?? peers[0];
        console.log("[CALL] startDirectCall: peer=", primaryPeer?.id ?? null, "invitees=", selectedInvitees, "isGroup=", isGroup);
        setters.setCallPeerUserId(primaryPeer?.id ?? null);
        setters.setCallPeerDisplayName(isGroup
          ? (callChat.title ?? primaryPeer?.displayName ?? null)
          : (primaryPeer?.displayName ?? null));
        setters.setCallParticipantIds([userAtStart.id, ...selectedInvitees]);

        await loadCallQuality(callQualityProfileForChatType(callChat.type));
        if (!isCurrentAttempt()) return;
        console.log("[CALL] startDirectCall: calling prepareForCall type=", type);
        await audioCallRef.current?.prepareForCall(type);
        if (!isCurrentAttempt()) {
          await audioCallRef.current?.cleanup(true).catch(() => undefined);
          return;
        }
        console.log("[CALL] startDirectCall: prepareForCall resolved OK");
        activeSocket.emit("call:start", { chatId: callChat.id, callType: type, inviteUserIds: selectedInvitees });
        console.log("[CALL] startDirectCall: call:start emitted — waiting for call:ringing from server");
      },
      (err) => {
        if (!isCurrentAttempt()) return;
        console.error("[CALL] startDirectCall: setup failed:", err instanceof Error ? err.name + ": " + err.message : err);
        setError(err instanceof Error ? err.message : "Microphone permission is required to call");
        void resetCallState(undefined, true, false);
      }
    );
    refs.callStartupPromiseRef.current = startup;
  };
}
