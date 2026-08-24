import type { Socket } from "socket.io-client";
import type { Chat } from "../../../api/chats";
import CallController, { type CallTopology } from "../../../realtime/CallController";
import type { CallSignalingDependencies } from "./useCallSignaling";

export function registerCallRingingHandler(socket: Socket, audioController: CallController, dependencies: CallSignalingDependencies) {
  const {
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
  } = dependencies;
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

          const chat = chatsRef.current.find((c: Chat) => c.id === payload.chatId) ?? selectedChat;
          const isGroup = chat ? (chat.type === "group" || chat.type === "family") : (payload.participants ? payload.participants.length > 2 : false);
          const selfParticipant = payload.participants?.find((p) => p.userId === selfUserId);
          const isSelfConnected = selfParticipant?.state === "connected" || selfParticipant?.state === "connecting";

          if (payload.chatId && isGroup) {
            setActiveGroupCalls((prev: Record<string, Record<string, unknown>>) => ({
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

}