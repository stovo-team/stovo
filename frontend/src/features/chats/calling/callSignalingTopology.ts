import type { Socket } from "socket.io-client";
import CallController, { type CallTopology } from "../../../realtime/CallController";
import type { CallSignalingDependencies } from "./useCallSignaling";

export function registerCallTopologyHandlers(socket: Socket, audioController: CallController, dependencies: CallSignalingDependencies) {
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
          setActiveGroupCalls((prev: Record<string, Record<string, unknown>>) => {
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

}