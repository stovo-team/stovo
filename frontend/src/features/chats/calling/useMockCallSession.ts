import { useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";

import type { User } from "../../../api/auth";
import { getChat, type Chat } from "../../../api/chats";
import type { CallSettings, CallTopology, RemoteMedia } from "../../../realtime/CallController";
import type { CallPhase } from "../shared/types";
import {
  acceptMockCall,
  createMockCall,
  declineMockCall,
  inviteMockCallUsers,
  leaveMockCall,
  publishMockCallSnapshot,
  readMockCallSnapshot,
  subscribeToMockCallChanges,
  startMockCallScreenShare,
  stopMockCallScreenShare,
  type MockCallSnapshot,
} from "../../../dev/mockCallBroker";

type MockCallSessionRefs = {
  activeCallSessionIdRef: RefObject<string | null>;
  activeCallChatIdRef: RefObject<string | null>;
  callRoomIdRef: RefObject<string | null>;
  callTypeRef: RefObject<"audio" | "video">;
  callPhaseRef: RefObject<CallPhase>;
};

type MockCallSessionSetters = {
  setActiveGroupCalls: Dispatch<SetStateAction<Record<string, Record<string, any>>>>;
  setCallPhase: Dispatch<SetStateAction<CallPhase>>;
  setActiveCallChatId: Dispatch<SetStateAction<string | null>>;
  setCallRoomId: Dispatch<SetStateAction<string | null>>;
  setCallPeerUserId: Dispatch<SetStateAction<string | null>>;
  setCallPeerDisplayName: Dispatch<SetStateAction<string | null>>;
  setCallType: Dispatch<SetStateAction<"audio" | "video">>;
  setCallTopology: Dispatch<SetStateAction<CallTopology>>;
  setCallParticipantIds: Dispatch<SetStateAction<string[]>>;
  setCallRemoteMedia: Dispatch<SetStateAction<RemoteMedia[]>>;
  setHasRemoteVideo: Dispatch<SetStateAction<boolean>>;
  setRemoteVideoStream: Dispatch<SetStateAction<MediaStream | null>>;
  setIsLocalSpeaking: Dispatch<SetStateAction<boolean>>;
  setIsPeerSpeaking: Dispatch<SetStateAction<boolean>>;
  setSpeakingUserIds: Dispatch<SetStateAction<string[]>>;
  setCallAudioSettings: Dispatch<SetStateAction<CallSettings>>;
  setCallNotice: Dispatch<SetStateAction<string | null>>;
};

type MockCallSessionParams = {
  accessToken: string | null;
  currentUser: User | null;
  selectedChat: Chat | null;
  members: User[];
  chatsRef: RefObject<Chat[]>;
  setSelectedChat: Dispatch<SetStateAction<Chat | null>>;
  setError: (message: string | null) => void;
  setPreJoinChatId: Dispatch<SetStateAction<string | null>>;
  resetCallState: (notice?: string, serverAlreadyNotified?: boolean, playEndSoundEffect?: boolean) => Promise<void>;
  refs: MockCallSessionRefs;
  setters: MockCallSessionSetters;
};

const isLocalMockCallMode = import.meta.env.DEV && import.meta.env.MODE === "mock";

function createEmptyMockMediaStream(): MediaStream {
  return {
    active: false,
    getTracks: () => [],
    getAudioTracks: () => [],
    getVideoTracks: () => [],
  } as unknown as MediaStream;
}

export function useMockCallSession({
  accessToken,
  currentUser,
  selectedChat,
  members,
  chatsRef,
  setSelectedChat,
  setError,
  setPreJoinChatId,
  resetCallState,
  refs,
  setters,
}: MockCallSessionParams) {
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const [mockScreenShareUserId, setMockScreenShareUserId] = useState<string | null>(null);
  const applySnapshotRef = useRef<(call: MockCallSnapshot | null) => void>(() => undefined);

  applySnapshotRef.current = (call) => {
    if (!call) {
      setMockScreenShareUserId(null);
      setters.setCallAudioSettings((current) => current.screenSharing ? { ...current, screenSharing: false } : current);
      return;
    }
    const isCurrentCall =
      refs.activeCallSessionIdRef.current === call.id || refs.callRoomIdRef.current === call.id;
    if (call.status === "ended") {
      setMockScreenShareUserId(null);
      setters.setActiveGroupCalls((current) => {
        if (!current[call.chatId]) return current;
        const next = { ...current };
        delete next[call.chatId];
        return next;
      });
      if (isCurrentCall) void resetCallState("Call ended", true, false);
      return;
    }

    const activeUser = currentUserRef.current;
    if (!activeUser) return;
    const screenShareUserId = call.screenShareUserId && call.participants.some(
      (participant) => participant.userId === call.screenShareUserId && participant.state === "connected",
    ) ? call.screenShareUserId : null;
    setMockScreenShareUserId(screenShareUserId);
    const self = call.participants.find((participant) => participant.userId === activeUser.id);
    if (!self) return;
    if (self.state === "declined" || self.state === "left") {
      if (isCurrentCall) {
        void resetCallState(self.state === "declined" ? "Call declined" : "Call ended", true, false);
      }
      return;
    }

    const callChat = chatsRef.current.find((chat) => chat.id === call.chatId);
    if (!callChat) return;
    const isNewCall = refs.activeCallSessionIdRef.current !== call.id;
    const isGroupCall = callChat.type === "group" || callChat.type === "family";
    const connectedIds = call.participants
      .filter((participant) => participant.state === "connected")
      .map((participant) => participant.userId);
    const remoteUsers = call.participants
      .filter((participant) => participant.userId !== activeUser.id && participant.state === "connected")
      .map((participant) => participant.userId);
    const peerId = call.participants.find((participant) =>
      participant.userId !== activeUser.id &&
      participant.state !== "declined" &&
      participant.state !== "left"
    )?.userId ?? null;
    const peer = members.find((member) => member.id === peerId) ??
      callChat.members.find((member) => member.id === peerId);
    const phase: CallPhase = self.state === "ringing"
      ? "incoming"
      : call.status === "ringing" && call.callerId === activeUser.id
        ? "outgoing"
        : call.status === "active"
          ? "in-call"
          : "connecting";

    refs.activeCallSessionIdRef.current = call.id;
    refs.activeCallChatIdRef.current = call.chatId;
    refs.callRoomIdRef.current = call.id;
    refs.callTypeRef.current = call.callType;
    setters.setCallPhase(phase);
    refs.callPhaseRef.current = phase;
    setters.setActiveCallChatId(call.chatId);
    setters.setCallRoomId(call.id);
    setters.setCallPeerUserId(peerId);
    setters.setCallPeerDisplayName(isGroupCall ? (callChat.title ?? "Group call") : (peer?.displayName ?? "Call"));
    setters.setCallType(call.callType);
    setters.setCallTopology(isGroupCall ? "sfu" : "mesh");
    setters.setCallParticipantIds(connectedIds);
    setters.setCallRemoteMedia(remoteUsers.map((userId) => ({
      userId,
      stream: createEmptyMockMediaStream(),
      screenStream: null,
      hasVideo: false,
      hasAudio: false,
      hasScreenShare: screenShareUserId === userId,
      isMuted: true,
    })));
    setters.setHasRemoteVideo(call.callType === "video" && remoteUsers.length > 0);
    setters.setRemoteVideoStream(null);
    setters.setIsLocalSpeaking(false);
    setters.setIsPeerSpeaking(false);
    setters.setSpeakingUserIds([]);
    setters.setCallAudioSettings((current) => ({
      ...current,
      ...(isNewCall ? { micMuted: true, soundDisabled: true, cameraEnabled: false } : {}),
      screenSharing: screenShareUserId === activeUser.id,
    }));
    if (isNewCall) setters.setCallNotice("Mock call: audio and camera devices are disabled");
    if (isGroupCall) {
      setters.setActiveGroupCalls((current) => ({
        ...current,
        [call.chatId]: {
          roomId: call.id,
          topology: "sfu",
          callType: call.callType,
          participants: call.participants.map(({ userId, state }) => ({ userId, state })),
        },
      }));
    }
  };

  useEffect(() => {
    if (!isLocalMockCallMode || !currentUser?.id) return;
    const unsubscribe = subscribeToMockCallChanges((call) => applySnapshotRef.current(call));
    applySnapshotRef.current(readMockCallSnapshot());
    const leaveOnPageHide = () => {
      const call = readMockCallSnapshot();
      if (!call || call.status === "ended") return;
      const participant = call.participants.find((item) => item.userId === currentUser.id);
      if (!participant || (participant.state !== "connected" && participant.state !== "ringing")) return;
      const updated = leaveMockCall(call, currentUser.id);
      if (updated) publishMockCallSnapshot(updated);
    };
    window.addEventListener("pagehide", leaveOnPageHide);
    return () => {
      window.removeEventListener("pagehide", leaveOnPageHide);
      unsubscribe();
    };
  }, [currentUser?.id]);

  const startDirectCall = async (type: "audio" | "video", inviteUserIds?: string[]) => {
    if (!isLocalMockCallMode || !currentUser) return false;
    let callChat = selectedChat;
    let peers = callChat?.members.filter((member) => member.id !== currentUser.id) ?? [];
    if (peers.length === 0 && callChat && accessToken) {
      try {
        callChat = await getChat(accessToken, callChat.id);
        setSelectedChat(callChat);
        peers = callChat.members.filter((member) => member.id !== currentUser.id);
      } catch {
        // The local fixtures are authoritative for mock calls.
      }
    }
    if (!callChat) return true;
    if (peers.length === 0 && callChat.type !== "group" && callChat.type !== "family") {
      setError("This chat has no other members to call.");
      return true;
    }
    const invitees = inviteUserIds && inviteUserIds.length > 0
      ? inviteUserIds
      : callChat.type === "direct"
        ? peers.slice(0, 1).map((peer) => peer.id)
        : peers.map((peer) => peer.id);
    const call = createMockCall({
      id: "mock-call-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      chatId: callChat.id,
      callType: type,
      callerId: currentUser.id,
      inviteeIds: invitees,
    });
    setError(null);
    publishMockCallSnapshot(call);
    applySnapshotRef.current(call);
    return true;
  };

  const sendInvites = (userIds: string[]) => {
    if (!isLocalMockCallMode) return;
    const call = readMockCallSnapshot();
    if (!call) return;
    const updated = inviteMockCallUsers(call, userIds);
    if (updated) publishMockCallSnapshot(updated);
  };

  const acceptIncomingCall = () => {
    if (!isLocalMockCallMode || !currentUser) return false;
    const call = readMockCallSnapshot();
    if (call && call.id === refs.callRoomIdRef.current) {
      const accepted = acceptMockCall(call, currentUser.id);
      if (accepted) publishMockCallSnapshot(accepted);
    }
    return true;
  };

  const joinOngoingGroupCall = (targetChat: Chat) => {
    if (!isLocalMockCallMode || !currentUser) return false;
    setPreJoinChatId(null);
    const call = readMockCallSnapshot();
    if (call && call.chatId === targetChat.id) {
      const joined = acceptMockCall(call, currentUser.id);
      if (joined) publishMockCallSnapshot(joined);
    }
    return true;
  };

  const joinVoiceChannel = (targetChat: Chat) => {
    if (!isLocalMockCallMode || !currentUser) return false;
    const invitees = targetChat.members
      .filter((member) => member.id !== currentUser.id)
      .map((member) => member.id);
    const call = createMockCall({
      id: "mock-call-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      chatId: targetChat.id,
      callType: "audio",
      callerId: currentUser.id,
      inviteeIds: invitees,
    });
    const joined = acceptMockCall(call, currentUser.id);
    if (joined) {
      publishMockCallSnapshot(joined);
      applySnapshotRef.current(joined);
    }
    return true;
  };

  const declineIncomingCall = () => {
    if (!isLocalMockCallMode || !currentUser) return false;
    const call = readMockCallSnapshot();
    if (call && call.id === refs.callRoomIdRef.current) {
      const declined = declineMockCall(call, currentUser.id);
      if (declined) publishMockCallSnapshot(declined);
    }
    return true;
  };

  const endActiveCall = () => {
    if (!isLocalMockCallMode || !currentUser) return false;
    const call = readMockCallSnapshot();
    if (call && call.id === refs.callRoomIdRef.current) {
      const left = leaveMockCall(call, currentUser.id);
      if (left) publishMockCallSnapshot(left);
    }
    return true;
  };

  const toggleScreenShare = (): boolean => {
    if (!isLocalMockCallMode || !currentUser) return false;
    const call = readMockCallSnapshot();
    if (!call || call.id !== refs.callRoomIdRef.current) return true;
    const updated = call.screenShareUserId === currentUser.id
      ? stopMockCallScreenShare(call, currentUser.id)
      : startMockCallScreenShare(call, currentUser.id);
    if (updated) publishMockCallSnapshot(updated);
    return true;
  };

  return {
    isEnabled: isLocalMockCallMode,
    mockScreenShareUserId,
    startDirectCall,
    sendInvites,
    acceptIncomingCall,
    joinOngoingGroupCall,
    joinVoiceChannel,
    declineIncomingCall,
    endActiveCall,
    toggleScreenShare,
  };
}
