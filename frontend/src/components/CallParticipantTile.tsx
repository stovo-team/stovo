import type { CSSProperties, ReactNode } from "react";
import type { FamilyFile } from "../api/files";
import { CallControlButton } from "../features/chats/calling/CallControlButton";
import { RealAvatar } from "../features/chats/sidebar/RealAvatar";

const videoStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
  background: "var(--color-palette-7b2817bf9b80)",
};

const screenVideoStyle: CSSProperties = {
  ...videoStyle,
  objectFit: "contain",
};

const avatarStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--color-palette-f1147865f078)",
  fontSize: "var(--font-size-avatar-initials)",
  letterSpacing: "0.02em",
};

const labelStyle: CSSProperties = {
  position: "absolute",
  left: 8,
  bottom: 8,
  padding: "2px 8px",
  borderRadius: "var(--radius-small)",
  background: "var(--color-palette-e16ece2e238b)",
  color: "var(--color-palette-f2074b6cef37)",
  fontSize: "var(--font-size-caption)",
  zIndex: 3,
};

function initial(label: string): string {
  const trimmedLabel = label.trim();
  return trimmedLabel ? trimmedLabel.charAt(0).toUpperCase() : "?";
}

function bindStream(el: HTMLVideoElement | null, stream: MediaStream | null) {
  if (el && stream && el.srcObject !== stream) {
    el.srcObject = stream;
  }
}

export function CallParticipantTile({
  label,
  stream,
  showVideo,
  mirror,
  isScreen,
  isSpeaking,
  isMuted = false,
  className,
  style,
  onFlipCamera,
  isFlippingCamera,
  localVideoPlaceholder,
  mobilePrimary,
  mobilePip,
  onClick,
  isConnected = true,
  accessToken,
  profilePhoto,
  onVideoMetadata,
}: {
  label: string;
  stream: MediaStream | null;
  showVideo: boolean;
  mirror?: boolean;
  isScreen?: boolean;
  isSpeaking?: boolean;
  isMuted?: boolean;
  className: string;
  style: CSSProperties;
  onFlipCamera?: () => void;
  isFlippingCamera?: boolean;
  localVideoPlaceholder?: ReactNode;
  mobilePrimary?: boolean;
  mobilePip?: boolean;
  onClick?: () => void;
  isConnected?: boolean;
  accessToken?: string | null;
  profilePhoto?: FamilyFile | null;
  onVideoMetadata?: (width: number, height: number) => void;
}) {
  return (
    <div
      className={`${className}${isSpeaking && !isScreen ? " is-speaking" : ""}${mobilePrimary ? " call-grid__mobile-primary" : ""}${mobilePip ? " call-grid__mobile-pip mobile-active-pip" : ""}`}
      style={style}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : isScreen ? -1 : undefined}
      aria-label={onClick ? `${label} video tile` : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick || event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") event.preventDefault();
        if (event.key === "Enter") {
          onClick();
        }
      }}
      onKeyUp={(event) => {
        if (!onClick || event.target !== event.currentTarget) return;
        if (event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      {showVideo && stream ? (
        <video
          className={`call-grid__video${mobilePrimary ? " mobile-active-fullscreen-video" : ""}${mobilePip ? " mobile-active-pip-video" : ""}`}
          style={{
            ...(isScreen ? screenVideoStyle : videoStyle),
            transform: mirror ? "scaleX(-1)" : undefined,
          }}
          autoPlay
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nofullscreen noremoteplayback"
          muted
          ref={(el) => bindStream(el, stream)}
          onLoadedMetadata={(event) => onVideoMetadata?.(event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
        />
      ) : localVideoPlaceholder ? (
        localVideoPlaceholder
      ) : (
        <div className="call-grid__avatar-wrap">
          {profilePhoto ? <RealAvatar accessToken={accessToken ?? null} className="call-grid__profile-avatar" file={profilePhoto} label={label} /> : (
            <div className="call-grid__avatar-circle">
              <div className="call-grid__avatar" style={avatarStyle}>{initial(label)}</div>
            </div>
          )}
        </div>
      )}
      {onFlipCamera && showVideo && (
        <CallControlButton
          action="flip-camera"
          label="Flip camera"
          state="idle"
          iconSize={16}
          className="call-grid__flip-camera"
          disabled={isFlippingCamera}
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onFlipCamera(); }}
        />
      )}
      <span className="call-grid__label" style={labelStyle}>
        {label}
        {isScreen ? " · Screen" : ""}
      </span>
      {isConnected && !isScreen && <span className="call-grid__participant-status" role="status">{isMuted ? "Muted" : isSpeaking ? "Speaking" : "Connected"}</span>}
    </div>
  );
}
