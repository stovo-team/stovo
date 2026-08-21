import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import CallController, { type CallSettings, type RemoteMedia } from "../../../realtime/CallController";
import { audioPlaybackSession } from "../../../audioPlaybackSession";
import { videoPlaybackSession } from "../../../videoPlaybackSession";
import { enterNativePictureInPictureIfPossible, isNativeCallPluginAvailable, setNativeActiveCallState } from "../../../native/callPlugin";
import { isNativeScreenCaptureAvailable } from "../../../native/screenCapturePlugin";
import type { CallPhase } from "../shared/types";

type UseCallMediaParams = {
  audioCallRef: MutableRefObject<CallController | null>;
  callPhase: CallPhase;
  callPhaseRef: MutableRefObject<CallPhase>;
  callType: "audio" | "video";
  callAudioSettings: CallSettings;
  setCallAudioSettings: Dispatch<SetStateAction<CallSettings>>;
  setCallAudioWarning: Dispatch<SetStateAction<string | null>>;
  setCallNotice: Dispatch<SetStateAction<string | null>>;
  activeCallChatIdRef: MutableRefObject<string | null>;
  activeCallSessionIdRef: MutableRefObject<string | null>;
};

/** Owns call media streams, media-element refs, and browser/native media effects. */
export function useCallMedia({
  audioCallRef,
  callPhase,
  callPhaseRef,
  callType,
  callAudioSettings,
  setCallAudioSettings,
  setCallAudioWarning,
  setCallNotice,
  activeCallChatIdRef,
  activeCallSessionIdRef
}: UseCallMediaParams) {
  const [callRemoteMedia, setCallRemoteMedia] = useState<RemoteMedia[]>([]);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [remoteVideoStream, setRemoteVideoStream] = useState<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (callPhase !== "incoming") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = typeof window !== "undefined" ? (window as any).Capacitor : undefined;
    if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return;
    void audioCallRef.current?.prepareForCall(callType).catch(() => undefined);
  }, [audioCallRef, callPhase, callType]);

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

  const toggleScreenShare = useCallback(async () => {
    const controller = audioCallRef.current;
    const next = !callAudioSettings.screenSharing;
    setCallAudioWarning(null);
    if (next && !isNativeScreenCaptureAvailable() && (typeof navigator === "undefined" || !navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== "function")) {
      const message = "Screen demonstration is not supported on this browser or device";
      setCallNotice(message);
      setCallAudioWarning(message);
      return;
    }
    setCallAudioSettings((current) => ({ ...current, screenSharing: next }));
    if (!controller) {
      const message = "Cannot share screen: call is not connected";
      setCallNotice(message);
      setCallAudioWarning(message);
      return;
    }
    try {
      await controller.toggleScreenShare(next);
      if (next && isNativeCallPluginAvailable()) {
        const active = callPhaseRef.current !== "idle" && Boolean(activeCallSessionIdRef.current);
        if (active) {
          await setNativeActiveCallState({ active: true, video: true, chatId: activeCallChatIdRef.current, sessionId: activeCallSessionIdRef.current });
          await enterNativePictureInPictureIfPossible();
        }
      }
      setCallNotice(next ? "Screen demonstration active" : null);
    } catch (err) {
      setCallAudioSettings((current) => ({ ...current, screenSharing: false }));
      const name = (err as DOMException)?.name ?? "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "AbortError") {
        setCallNotice("Screen demonstration permission was denied");
        setCallAudioWarning("Screen demonstration permission was denied");
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to share screen";
      setCallNotice(message);
      setCallAudioWarning(message);
    }
  }, [activeCallChatIdRef, activeCallSessionIdRef, audioCallRef, callAudioSettings.screenSharing, callPhaseRef, setCallAudioSettings, setCallAudioWarning, setCallNotice]);

  return { callRemoteMedia, setCallRemoteMedia, hasRemoteVideo, setHasRemoteVideo, localVideoStream, setLocalVideoStream, localScreenStream, setLocalScreenStream, remoteVideoStream, setRemoteVideoStream, remoteAudioRef, remoteVideoRef, localVideoRef, toggleScreenShare };
}
