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

const presenterTileStyle: CSSProperties = {
  ...tileStyle,
  aspectRatio: "16 / 9",
  minHeight: "180px",
  gridColumn: "1 / -1",
};

const videoStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
  background: "#000",
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

function bindStream(el: HTMLVideoElement | HTMLAudioElement | null, stream: MediaStream | null) {
  if (el && stream && el.srcObject !== stream) {
    el.srcObject = stream;
  }
}

function ParticipantTile({
  label,
  stream,
  showVideo,
  mirror,
  isScreen,
  className,
  style,
}: {
  label: string;
  stream: MediaStream | null;
  showVideo: boolean;
  mirror?: boolean;
  isScreen?: boolean;
  className: string;
  style: CSSProperties;
}) {
  return (
    <div className={className} style={style}>
      {showVideo && stream ? (
        <video
          className="call-grid__video"
          style={{
            ...(isScreen ? screenVideoStyle : videoStyle),
            transform: mirror ? "scaleX(-1)" : undefined,
          }}
          autoPlay
          playsInline
          muted
          ref={(el) => bindStream(el, stream)}
        />
      ) : (
        <div className="call-grid__avatar" style={avatarStyle}>
          {initial(label)}
        </div>
      )}
      <span className="call-grid__label" style={labelStyle}>
        {label}
        {isScreen ? " · Screen" : ""}
      </span>
    </div>
  );
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

  const presenter = remoteMedia.find(
    (m) =>
      m.hasScreenShare &&
      m.screenStream &&
      m.screenStream.getVideoTracks().some((t) => t.readyState !== "ended"),
  );
  const isPresenting = Boolean(presenter);

  const count = 1 + remoteMedia.length;
  const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(count))));

  return (
    <div
      className={`call-grid${isPresenting ? " call-grid--presenting" : ""}`}
      style={{
        ...gridStyle,
        gridTemplateColumns: isPresenting
          ? "repeat(auto-fit, minmax(120px, 1fr))"
          : `repeat(${columns}, minmax(0, 1fr))`,
      }}
    >
      {presenter?.screenStream ? (
        <ParticipantTile
          className="call-grid__tile call-grid__tile--screen"
          style={presenterTileStyle}
          label={presenter.userId}
          stream={presenter.screenStream}
          showVideo
          isScreen
        />
      ) : null}

      <ParticipantTile
        className="call-grid__tile call-grid__tile--local"
        style={tileStyle}
        label={localUserLabel}
        stream={localStream}
        showVideo={localHasVideo}
        mirror={mirrorLocal}
      />

      {remoteMedia.map((remote) => {
        const preferScreen =
          !isPresenting &&
          remote.hasScreenShare &&
          Boolean(
            remote.screenStream?.getVideoTracks().some((t) => t.readyState !== "ended"),
          );
        const cameraVideo =
          remote.hasVideo &&
          remote.stream.getVideoTracks().some((t) => t.readyState !== "ended");
        const showVideo = preferScreen || cameraVideo;
        const stream = preferScreen ? remote.screenStream : remote.stream;

        return (
          <div key={remote.userId} className="call-grid__tile call-grid__tile--remote" style={tileStyle}>
            {showVideo && stream ? (
              <video
                className="call-grid__video"
                style={preferScreen ? screenVideoStyle : videoStyle}
                autoPlay
                playsInline
                muted
                ref={(el) => bindStream(el, stream)}
              />
            ) : (
              <div className="call-grid__avatar" style={avatarStyle}>
                {initial(remote.userId)}
              </div>
            )}
            <span className="call-grid__label" style={labelStyle}>
              {remote.userId}
              {preferScreen ? " · Screen" : ""}
            </span>
            {!showVideo && remote.hasAudio ? (
              <audio
                className="call-grid__audio"
                autoPlay
                ref={(el) => bindStream(el, remote.stream)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
