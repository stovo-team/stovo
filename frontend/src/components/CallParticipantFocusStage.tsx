import type { CSSProperties, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import type { RemoteMedia } from "../realtime/call/types";
import { useStrings } from "../i18n/LanguageContext";
import { RealAvatar } from "../features/chats/sidebar/RealAvatar";
import type { FamilyFile } from "../api/files";

const videoStyle: CSSProperties = { width: "100%", height: "100%", objectFit: "contain", display: "block", background: "var(--color-palette-7b2817bf9b80)" };
const avatarStyle: CSSProperties = { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-palette-f1147865f078)", fontSize: "var(--font-size-avatar-initials)" };
const labelStyle: CSSProperties = { position: "absolute", left: 8, bottom: 8, padding: "2px 8px", borderRadius: "var(--radius-small)", background: "var(--color-palette-e16ece2e238b)", color: "var(--color-palette-f2074b6cef37)", fontSize: "var(--font-size-caption)", zIndex: 3 };

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
  participantProfiles = {},
  accessToken,
  onSelect,
  onClose,
  showCloseControl,
  mirrorLocal = false,
}: {
  participantId: string;
  localUserLabel: string;
  localStream: MediaStream | null;
  localHasVideo: boolean;
  localMuted: boolean;
  localPlaceholder?: ReactNode;
  remoteMedia: RemoteMedia[];
  participantProfiles?: Record<string, { id?: string; displayName: string; profilePhoto: FamilyFile | null; avatarMode?: "photo" | "symbol"; avatarSymbolId?: string | null; avatarColorId?: string | null }>;
  accessToken?: string | null;
  onSelect: (participantId: string) => void;
  onClose: () => void;
  showCloseControl: boolean;
  mirrorLocal?: boolean;
}) {
  const copy = useStrings().sharedUi;
  const isLocal = participantId === localUserLabel;
  const focusedRemote = remoteMedia.find((media) => media.userId === participantId);
  const focusedProfile = participantProfiles[participantId];
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
        {hasVideo && stream ? <video className="call-grid__video" style={isLocal && mirrorLocal ? { ...videoStyle, transform: "scaleX(-1)" } : videoStyle} autoPlay playsInline muted ref={(element) => bindStream(element, stream)} /> : isLocal && localPlaceholder ? localPlaceholder : (
          <div className="call-grid__avatar-wrap"><div className="call-grid__avatar-circle"><RealAvatar accessToken={accessToken ?? null} className="call-grid__avatar" entityId={focusedProfile?.id ?? participantId} file={focusedProfile?.profilePhoto ?? null} label={focusedProfile?.displayName ?? participantId} mode={focusedProfile?.avatarMode} symbolId={focusedProfile?.avatarSymbolId} colorId={focusedProfile?.avatarColorId} style={avatarStyle} /></div></div>
        )}
        <span className="call-grid__label" style={labelStyle}>{participantId}</span>
        <span className="call-grid__participant-status" role="status">{(isLocal ? localMuted : Boolean(focusedRemote?.isMuted)) ? "Muted" : "Connected"}</span>
      </div>
      <div className="call-grid__focus-participants" aria-label={copy.otherParticipants}>
        {others.map((person) => (
          <button type="button" className="call-grid__focus-participant" style={{ aspectRatio: "16 / 9" }} data-focus-participant={person.id} key={person.id} onClick={() => onSelect(person.id)}>
            {person.hasVideo && person.stream ? <video className="call-grid__video" style={person.id === localUserLabel && mirrorLocal ? { ...videoStyle, transform: "scaleX(-1)" } : videoStyle} autoPlay playsInline muted ref={(element) => bindStream(element, person.stream)} /> : <RealAvatar accessToken={accessToken ?? null} className="call-grid__avatar" entityId={participantProfiles[person.id]?.id ?? person.id} file={participantProfiles[person.id]?.profilePhoto ?? null} label={participantProfiles[person.id]?.displayName ?? person.id} mode={participantProfiles[person.id]?.avatarMode} symbolId={participantProfiles[person.id]?.avatarSymbolId} colorId={participantProfiles[person.id]?.avatarColorId} style={avatarStyle} />}
            <span className="call-grid__label" style={labelStyle}>{person.id}</span>
          </button>
        ))}
      </div>
      {showCloseControl && <button type="button" className="call-grid__focus-close" aria-label={copy.closeParticipantFocus} onClick={onClose}><ArrowLeft size={18} aria-hidden="true" /></button>}
    </div>
  );
}
