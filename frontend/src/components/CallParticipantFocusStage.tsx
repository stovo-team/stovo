import type { CSSProperties, ReactNode } from "react";
import type { RemoteMedia } from "../realtime/call/types";

const videoStyle: CSSProperties = { width: "100%", height: "100%", objectFit: "cover", display: "block", background: "#000" };
const avatarStyle: CSSProperties = { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#ccc", fontSize: "1.25rem" };
const labelStyle: CSSProperties = { position: "absolute", left: 8, bottom: 8, padding: "2px 8px", borderRadius: 4, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 12, zIndex: 3 };

function initial(label: string) {
  return label.trim().charAt(0).toUpperCase() || "?";
}

function bindStream(element: HTMLVideoElement | null, stream: MediaStream | null) {
  if (element && stream && element.srcObject !== stream) element.srcObject = stream;
}

export function CallParticipantFocusStage({
  participantId,
  localUserLabel,
  localStream,
  localHasVideo,
  localMuted,
  localPlaceholder,
  remoteMedia,
  onSelect,
  onClose,
}: {
  participantId: string;
  localUserLabel: string;
  localStream: MediaStream | null;
  localHasVideo: boolean;
  localMuted: boolean;
  localPlaceholder?: ReactNode;
  remoteMedia: RemoteMedia[];
  onSelect: (participantId: string) => void;
  onClose: () => void;
}) {
  const isLocal = participantId === localUserLabel;
  const focusedRemote = remoteMedia.find((media) => media.userId === participantId);
  const stream = isLocal ? localStream : focusedRemote?.stream ?? null;
  const hasVideo = isLocal
    ? localHasVideo || Boolean(localPlaceholder)
    : Boolean(focusedRemote?.hasVideo && focusedRemote.stream?.getVideoTracks().some((track) => track.readyState !== "ended"));
  const others = [
    { id: localUserLabel, stream: localStream, hasVideo: localHasVideo || Boolean(localPlaceholder) },
    ...remoteMedia.map((media) => ({
      id: media.userId,
      stream: media.stream,
      hasVideo: Boolean(media.hasVideo && media.stream?.getVideoTracks().some((track) => track.readyState !== "ended")),
    })),
  ].filter((participant) => participant.id !== participantId);

  return (
    <div className="call-grid call-grid--focus" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(100px, 22%)", gridTemplateRows: "minmax(0, 1fr) auto" }}>
      <div className="call-grid__focus-main" data-focus-main={participantId}>
        {hasVideo && stream ? <video className="call-grid__video" style={videoStyle} autoPlay playsInline muted ref={(element) => bindStream(element, stream)} /> : isLocal && localPlaceholder ? localPlaceholder : (
          <div className="call-grid__avatar-wrap"><div className="call-grid__avatar-circle"><div className="call-grid__avatar" style={avatarStyle}>{initial(participantId)}</div></div></div>
        )}
        <span className="call-grid__label" style={labelStyle}>{participantId}</span>
        <span className="call-grid__participant-status" role="status">{(isLocal ? localMuted : Boolean(focusedRemote?.isMuted)) ? "Muted" : "Connected"}</span>
      </div>
      <div className="call-grid__focus-participants" aria-label="Other participants">
        {others.map((person) => (
          <button type="button" className="call-grid__focus-participant" style={{ aspectRatio: "1 / 1" }} data-focus-participant={person.id} key={person.id} onClick={() => onSelect(person.id)}>
            {person.hasVideo && person.stream ? <video className="call-grid__video" style={videoStyle} autoPlay playsInline muted ref={(element) => bindStream(element, person.stream)} /> : <span className="call-grid__avatar" style={avatarStyle}>{initial(person.id)}</span>}
            <span className="call-grid__label" style={labelStyle}>{person.id}</span>
          </button>
        ))}
      </div>
      <button type="button" className="call-grid__focus-close" aria-label="Close participant focus" onClick={onClose}>Back to participants</button>
    </div>
  );
}
