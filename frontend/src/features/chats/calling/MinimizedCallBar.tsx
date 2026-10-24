import { useFloatingCallPanel } from "./useFloatingCallPanel";
import { useEffect, useReducer, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import type { CallPhase } from "../shared/types";
import type { RemoteMedia } from "../../../realtime/CallController";
import { CallControlButton } from "./CallControlButton";
import { useStrings } from "../../../i18n/LanguageContext";

type Props = {
  peerName: string;
  callPhase: CallPhase;
  callTimer: string;
  micMuted: boolean;
  soundDisabled: boolean;
  onToggleMic: () => void;
  onToggleSound: () => void;
  onEnd: () => void;
  onExpand: () => void;
  visible: boolean;
  remoteMedia: RemoteMedia[];
  localVideoStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  cameraEnabled: boolean;
  screenSharing: boolean;
  localUserId: string;
  speakingUserIds: string[];
  isLocalSpeaking: boolean;
  isPeerSpeaking: boolean;
  mirrorLocalVideo: boolean;
  anchorChatId?: string;
};
const hasVideo = (stream: MediaStream | null) => stream?.getVideoTracks().some(
  track => track.readyState !== "ended" && track.enabled !== false && !track.muted,
) ?? false;

/** The single minimized surface for every call type, kept mounted to remember speakers. */
export function MinimizedCallBar({ visible = true, ...props }: Props) {
  const copy = useStrings().sharedUi;
  const { remoteMedia, localVideoStream, localScreenStream, localUserId } = props;
  const floating = useFloatingCallPanel<HTMLElement>(visible && props.callPhase !== "idle", props.anchorChatId);
  const [lastSpeaker, setLastSpeaker] = useState<string | null>(null);
  const [, refreshTracks] = useReducer(value => value + 1, 0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const speaker = props.isLocalSpeaking ? localUserId : props.speakingUserIds[0] ??
    (props.isPeerSpeaking && remoteMedia.length === 1 ? remoteMedia[0].userId : null);
  useEffect(() => {
    const tracks = [localVideoStream, localScreenStream, ...remoteMedia.flatMap(m => [m.stream, m.screenStream])]
      .flatMap(stream => stream?.getVideoTracks() ?? []);
    for (const track of tracks) for (const event of ["ended", "mute", "unmute"]) track.addEventListener?.(event, refreshTracks);
    return () => { for (const track of tracks) for (const event of ["ended", "mute", "unmute"]) track.removeEventListener?.(event, refreshTracks); };
  }, [localVideoStream, localScreenStream, remoteMedia]);

  const cameras = remoteMedia.filter(m => m.hasVideo && hasVideo(m.stream))
    .map(m => ({ id: m.userId, stream: m.stream, mirror: false }));
  if (props.cameraEnabled && hasVideo(localVideoStream)) {
    cameras.push({ id: localUserId, stream: localVideoStream!, mirror: props.mirrorLocalVideo });
  }
  const cameraSpeaker = cameras.find(c => c.id === speaker)?.id;
  useEffect(() => { if (cameraSpeaker) setLastSpeaker(cameraSpeaker); }, [cameraSpeaker]);
  const sharedScreen = props.screenSharing && hasVideo(localScreenStream) ? localScreenStream :
    remoteMedia.find(m => m.hasScreenShare && hasVideo(m.screenStream))?.screenStream;
  const camera = cameras.find(c => c.id === speaker) ?? cameras.find(c => c.id === lastSpeaker) ?? cameras[0];
  const preview = props.callPhase === "in-call" ? sharedScreen ?? camera?.stream ?? null : null;
  const mirrored = !sharedScreen && camera?.mirror;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = preview;
    return () => { video.srcObject = null; };
  }, [preview, visible]);
  if (!visible || props.callPhase === "idle") return null;
  const status = props.callPhase === "in-call" ? props.callTimer :
    props.callPhase === "incoming" ? "Incoming…" : props.callPhase === "outgoing" ? "Calling…" : "Connecting…";
  return (
    <section {...floating} className={`minimized-call${preview ? " minimized-call--video" : ""}`} role="status" aria-label={copy.minimizedCall}>
      {preview && <video ref={videoRef} className={mirrored ? "is-mirrored" : ""} autoPlay playsInline muted />}
      <div className="minimized-call-heading">
        <button type="button" className="minimized-call-button" aria-label={copy.restoreCall} onClick={props.onExpand}>
          <Maximize2 size={18} aria-hidden="true" />
        </button>
        <div className="minimized-call-metadata" data-call-drag-handle role="button" tabIndex={0}
          onClick={props.onExpand}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.onExpand(); } }}>
          <span className="minimized-call-title" title={props.peerName}>{props.peerName}</span>
          <span className="minimized-call-duration"> · {status}</span>
        </div>
      </div>
      <div className="minimized-call-controls">
        <CallControlButton action="microphone" className="minimized-call-button" state={props.micMuted ? "muted" : "active"} label={props.micMuted ? "Unmute microphone" : "Mute microphone"} onClick={props.onToggleMic} />
        <CallControlButton action="audio-output" toggle className="minimized-call-button" state={props.soundDisabled ? "muted" : "active"} label={props.soundDisabled ? "Unmute speaker" : "Mute speaker"} onClick={props.onToggleSound} />
        <CallControlButton action="end-call" className="minimized-call-button minimized-call-button--end" label="End call" onClick={props.onEnd} />
      </div>
    </section>
  );
}
