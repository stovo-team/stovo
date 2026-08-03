import type { CSSProperties } from "react";
import type { RemoteMedia } from "../realtime/call/types";

type CallParticipantGridProps = {
  localStream: MediaStream | null;
  remoteMedia: RemoteMedia[];
  localUserLabel?: string;
  mirrorLocal?: boolean;
  callType: "audio" | "video";
};

const gridStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
  width: "100%",
  height: "100%",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  alignContent: "center",
};

const tileStyle: CSSProperties = {
  position: "relative",
  background: "#1a1a1a",
  borderRadius: "8px",
  overflow: "hidden",
  minHeight: "120px",
  aspectRatio: "4 / 3",
};

const videoStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
  background: "#000",
};

const avatarStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#ccc",
  fontSize: "1.25rem",
  letterSpacing: "0.02em",
};

const labelStyle: CSSProperties = {
  position: "absolute",
  left: 8,
  bottom: 8,
  padding: "2px 8px",
  borderRadius: 4,
  background: "rgba(0,0,0,0.55)",
  color: "#fff",
  fontSize: 12,
};

function initial(label: string): string {
  const t = label.trim();
  return t ? t.charAt(0).toUpperCase() : "?";
}

export default function CallParticipantGrid({
  localStream,
  remoteMedia,
  localUserLabel = "You",
  mirrorLocal = true,
  callType,
}: CallParticipantGridProps) {
  const localHasVideo =
    callType === "video" &&
    Boolean(localStream?.getVideoTracks().some((t) => t.readyState !== "ended" && t.enabled));

  const count = 1 + remoteMedia.length;
  const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(count))));

  return (
    <div
      className="call-grid"
      style={{ ...gridStyle, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      <div className="call-grid__tile call-grid__tile--local" style={tileStyle}>
        {localHasVideo && localStream ? (
          <video
            className="call-grid__video"
            style={{
              ...videoStyle,
              transform: mirrorLocal ? "scaleX(-1)" : undefined,
            }}
            autoPlay
            playsInline
            muted
            ref={(el) => {
              if (el && el.srcObject !== localStream) el.srcObject = localStream;
            }}
          />
        ) : (
          <div className="call-grid__avatar" style={avatarStyle}>
            {initial(localUserLabel)}
          </div>
        )}
        <span className="call-grid__label" style={labelStyle}>
          {localUserLabel}
        </span>
      </div>

      {remoteMedia.map((remote) => {
        const showVideo =
          remote.hasVideo &&
          remote.stream.getVideoTracks().some((t) => t.readyState !== "ended");
        return (
          <div
            key={remote.userId}
            className="call-grid__tile call-grid__tile--remote"
            style={tileStyle}
          >
            {showVideo ? (
              <video
                className="call-grid__video"
                style={videoStyle}
                autoPlay
                playsInline
                muted
                ref={(el) => {
                  if (el && el.srcObject !== remote.stream) el.srcObject = remote.stream;
                }}
              />
            ) : (
              <div className="call-grid__avatar" style={avatarStyle}>
                {initial(remote.userId)}
              </div>
            )}
            <span className="call-grid__label" style={labelStyle}>
              {remote.userId}
            </span>
            {/* Audio plays via CallSessionController-managed elements; keep a hidden
                track sink only if this tile is video-muted but has audio for debugging. */}
            {!showVideo && remote.hasAudio ? (
              <audio
                className="call-grid__audio"
                autoPlay
                ref={(el) => {
                  if (el && el.srcObject !== remote.stream) el.srcObject = remote.stream;
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
