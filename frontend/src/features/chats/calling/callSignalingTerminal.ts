import type { Socket } from "socket.io-client";
import CallController from "../../../realtime/CallController";
import type { CallSignalingDependencies } from "./useCallSignaling";

export function registerCallTerminalHandlers(socket: Socket, audioController: CallController, dependencies: CallSignalingDependencies, isSessionMismatch: (payload: { sessionStartedAt?: string; chatId?: string }) => boolean) {
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
      socket.on("call:declined", (payload: { chatId?: string; sessionStartedAt?: string }) => {
        console.log("[CALL] call:declined received chatId=", payload?.chatId, "sessionStartedAt=", payload?.sessionStartedAt, "activeSession=", activeCallSessionIdRef.current, "callPhase=", callPhaseRef.current);
        if (payload?.chatId) {
          setActiveGroupCalls((prev: Record<string, Record<string, unknown>>) => {
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
          setActiveGroupCalls((prev: Record<string, Record<string, unknown>>) => {
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
          setActiveGroupCalls((prev: Record<string, Record<string, unknown>>) => {
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
          setActiveGroupCalls((prev: Record<string, Record<string, unknown>>) => {
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
      socket.on("call:error", (payload: { chatId?: string; message?: string }) => {
        const message = payload.message ?? "Call failed";
        console.error("[call:error] received:", payload);
        stopCallRingtone();
        if (
          message === "call already in progress for this chat" &&
          payload.chatId &&
          payload.chatId === activeCallChatIdRef.current &&
          callPhaseRef.current !== "idle"
        ) {
          socket.emit("call:join", { chatId: payload.chatId, callType: callTypeRef.current });
          return;
        }
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

}
