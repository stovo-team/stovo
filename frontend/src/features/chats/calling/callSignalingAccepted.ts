import type { Socket } from "socket.io-client";
import CallController, { type CallTopology } from "../../../realtime/CallController";
import type { CallSignalingDependencies } from "./useCallSignaling";

export function registerCallAcceptedHandler(socket: Socket, audioController: CallController, dependencies: CallSignalingDependencies) {
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
          setActiveGroupCalls((prev: Record<string, Record<string, unknown>>) => {
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

}