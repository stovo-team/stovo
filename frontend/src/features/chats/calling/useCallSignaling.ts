import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Socket } from "socket.io-client";
import CallController, { type CallTopology, type CallCapabilities, type CallSettings, type RemoteMedia } from "../../../realtime/CallController";
import type { User } from "../../../api/auth";
import type { Chat } from "../../../api/chats";
import type { CallPhase } from "../shared/types";
import { getAudioSettings, mergeWithDefaults } from "../../../api/audioSettings";
import { hasLiveLocalVideo } from "../shared/callLifecycle";
import { registerCallRingingHandler } from "./callSignalingRinging";
import { registerCallAcceptedHandler } from "./callSignalingAccepted";
import { registerCallTopologyHandlers } from "./callSignalingTopology";
import { registerCallTerminalHandlers } from "./callSignalingTerminal";

/** Dependencies injected from useCallSession; socket ownership remains in ChatsPage. */
export type CallSignalingDependencies = {
  currentUser: User | null;
  remoteAudioRef: RefObject<HTMLAudioElement | null>;
  setCallType: Dispatch<SetStateAction<"audio" | "video">>; setCallNotice: Dispatch<SetStateAction<string | null>>;
  callPhaseRef: RefObject<CallPhase>; setCallPhase: Dispatch<SetStateAction<CallPhase>>; callTypeRef: RefObject<"audio" | "video">;
  applyCallAudioPatch: (patch: Partial<CallSettings>) => Promise<void>;
  setHasRemoteVideo: Dispatch<SetStateAction<boolean>>; setRemoteVideoStream: Dispatch<SetStateAction<MediaStream | null>>;
  setLocalVideoStream: Dispatch<SetStateAction<MediaStream | null>>; setLocalScreenStream: Dispatch<SetStateAction<MediaStream | null>>;
  setCallRemoteMedia: Dispatch<SetStateAction<RemoteMedia[]>>; setCallTopology: Dispatch<SetStateAction<CallTopology>>;
  setCallAudioSettings: Dispatch<SetStateAction<CallSettings>>; setIsPeerSpeaking: Dispatch<SetStateAction<boolean>>;
  setIsLocalSpeaking: Dispatch<SetStateAction<boolean>>; setSpeakingUserIds: Dispatch<SetStateAction<string[]>>;
  setCallAudioCapabilities: Dispatch<SetStateAction<CallCapabilities>>; audioCallRef: RefObject<CallController | null>;
  activeCallChatIdRef: RefObject<string | null>; activeCallSessionIdRef: RefObject<string | null>;
  setActiveCallChatId: Dispatch<SetStateAction<string | null>>; setCallRoomId: Dispatch<SetStateAction<string | null>>;
  callRoomIdRef: RefObject<string | null>; setCallParticipantIds: Dispatch<SetStateAction<string[]>>;
  setCallPeerUserId: Dispatch<SetStateAction<string | null>>; chatsRef: RefObject<Chat[]>; selectedChat: Chat | null;
  setActiveGroupCalls: Dispatch<SetStateAction<Record<string, Record<string, unknown>>>>;
  stopCallRingtone: () => void; startIncomingRingtone: () => void; setError: (message: string | null) => void;
  resetCallState: (notice?: string, serverAlreadyNotified?: boolean, playEndSoundEffect?: boolean) => Promise<void>;
};

export function useCallSignaling(dependencies: CallSignalingDependencies) {
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
  return useCallback(
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
        callPhaseRef.current = "in-call";
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
        setCallAudioSettings((cur: CallSettings) => ({ ...cur, screenSharing: false }));
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
          setCallAudioSettings((cur: CallSettings) => ({ ...cur, ...merged }));
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

      registerCallRingingHandler(socket, audioController, dependencies);
      registerCallAcceptedHandler(socket, audioController, dependencies);
      registerCallTopologyHandlers(socket, audioController, dependencies);

      registerCallTerminalHandlers(socket, audioController, dependencies, isSessionMismatch);

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
}