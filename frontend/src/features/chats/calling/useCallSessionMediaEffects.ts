import { useEffect, type MutableRefObject } from "react";

import type CallController from "../../../realtime/CallController";
import type { CallPhase } from "../shared/types";

type MediaEffectsParams = {
  accessToken: string | null;
  callPhase: CallPhase;
  hasRemoteVideo: boolean;
  remoteVideoStream: MediaStream | null;
  localVideoStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  cameraEnabled: boolean;
  screenSharing: boolean;
  audioCallRef: MutableRefObject<CallController | null>;
  remoteVideoRef: MutableRefObject<HTMLVideoElement | null>;
  localVideoRef: MutableRefObject<HTMLVideoElement | null>;
};

/** Keeps controller credentials and rendered video elements synchronized with call media. */
export function useCallSessionMediaEffects({
  accessToken, callPhase, hasRemoteVideo, remoteVideoStream, localVideoStream, localScreenStream,
  cameraEnabled, screenSharing, audioCallRef, remoteVideoRef, localVideoRef
}: MediaEffectsParams) {
  useEffect(() => { audioCallRef.current?.updateAccessToken(accessToken ?? ""); }, [accessToken, audioCallRef]);
  useEffect(() => {
    if (callPhase === "idle" || !audioCallRef.current) return;
    audioCallRef.current.attachRemoteVideoElement(remoteVideoRef.current);
    audioCallRef.current.attachLocalVideoElement(localVideoRef.current);
    audioCallRef.current.syncRemoteVideoToUI();
  }, [audioCallRef, callPhase, localVideoRef, remoteVideoRef]);
  useEffect(() => {
    if ((hasRemoteVideo || remoteVideoStream) && remoteVideoRef.current) void remoteVideoRef.current.play().catch(() => undefined);
  }, [hasRemoteVideo, remoteVideoRef, remoteVideoStream]);
  useEffect(() => {
    const element = localVideoRef.current;
    const stream = screenSharing ? localScreenStream : cameraEnabled ? localVideoStream : null;
    if (!element || !stream) return;
    if (element.srcObject !== stream) element.srcObject = stream;
    void element.play().catch(() => undefined);
  }, [cameraEnabled, localScreenStream, localVideoRef, localVideoStream, screenSharing]);
}
