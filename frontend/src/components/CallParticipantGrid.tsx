import { useEffect, useState, type CSSProperties } from "react";
import type { RemoteMedia } from "../realtime/call/types";
import { SpeakingWaveBadge } from "../features/chats/calling/SpeakingWaveBadge";

type CallParticipantGridProps = {
  localStream: MediaStream | null;
  localScreenStream?: MediaStream | null;
  remoteMedia: RemoteMedia[];
  localUserLabel?: string;
  mirrorLocal?: boolean;
  callType: "audio" | "video";
  isLocalSpeaking?: boolean;
  isPeerSpeaking?: boolean;
  speakingUserIds?: string[];
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

const participantSquareTileStyle: CSSProperties = {
  ...tileStyle,
  aspectRatio: "1 / 1",
  minHeight: 0,
};

const landscapePresenterTileStyle: CSSProperties = {
  ...tileStyle,
  aspectRatio: "16 / 9",
  minHeight: "180px",
  gridColumn: "1 / -1",
};

const portraitPresenterTileStyle: CSSProperties = {
  ...tileStyle,
  aspectRatio: "9 / 16",
  minHeight: "180px",
  maxWidth: "min(100%, calc(52vh * 9 / 16))",
  gridColumn: "1 / -1",
  justifySelf: "center",
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
  zIndex: 3,
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
  isSpeaking,
  onVideoDimensions,
  className,
  style,
}: {
  label: string;
  stream: MediaStream | null;
  showVideo: boolean;
  mirror?: boolean;
  isScreen?: boolean;
  isSpeaking?: boolean;
  onVideoDimensions?: (width: number, height: number) => void;
  className: string;
  style: CSSProperties;
}) {
  return (
    <div className={`${className}${isSpeaking ? " is-speaking" : ""}`} style={style}>
      {showVideo && stream ? (
        <>
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
            onLoadedMetadata={(event) => {
              onVideoDimensions?.(event.currentTarget.videoWidth, event.currentTarget.videoHeight);
            }}
          />
          {isSpeaking && <SpeakingWaveBadge />}
          {isSpeaking && <span className="voice-video-speaking-border" aria-hidden="true" />}
        </>
      ) : (
        <div className="call-grid__avatar-wrap">
          <div className="call-grid__avatar-circle">
            <div className="call-grid__avatar" style={avatarStyle}>
              {initial(label)}
            </div>
            {isSpeaking && <span className="voice-speaking-ring" aria-hidden="true" />}
          </div>
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
  localScreenStream,
  remoteMedia,
  localUserLabel = "You",
  mirrorLocal = true,
  callType: _callType,
  isLocalSpeaking = false,
  isPeerSpeaking = false,
  speakingUserIds = [],
}: CallParticipantGridProps) {
  const [isPresenterPortrait, setIsPresenterPortrait] = useState(false);
  // Voice channels may keep their audio call type while a local camera track
  // is live. The presentation/PiP grid must follow the actual track, otherwise
  // it replaces the user's camera with an avatar during a screen share.
  const localHasVideo = Boolean(
    localStream?.getVideoTracks().some((track) => track.readyState !== "ended" && track.enabled),
  );

  const presenter =
    localScreenStream && localScreenStream.getVideoTracks().some((t) => t.readyState !== "ended")
      ? { userId: localUserLabel, screenStream: localScreenStream }
      : remoteMedia.find(
          (m) =>
            m.hasScreenShare &&
            m.screenStream &&
            m.screenStream.getVideoTracks().some((t) => t.readyState !== "ended"),
        );
  const isPresenting = Boolean(presenter);

  useEffect(() => {
    const track = presenter?.screenStream?.getVideoTracks()[0];
    const settings = track?.getSettings?.();
    setIsPresenterPortrait(
      Boolean(settings?.width && settings?.height && settings.height > settings.width),
    );
  }, [presenter?.screenStream]);

  const count = 1 + remoteMedia.length;
  const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(count))));

  const isPresenterSpeaking = presenter
    ? presenter.userId === localUserLabel
      ? isLocalSpeaking
      : (speakingUserIds.includes(presenter.userId) || (isPeerSpeaking && remoteMedia.length === 1))
    : false;

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
          style={isPresenterPortrait ? portraitPresenterTileStyle : landscapePresenterTileStyle}
          label={presenter.userId}
          stream={presenter.screenStream}
          showVideo
          isScreen
          isSpeaking={isPresenterSpeaking}
          onVideoDimensions={(width, height) => {
            if (width > 0 && height > 0) {
              setIsPresenterPortrait(height > width);
            }
          }}
        />
      ) : null}

      <ParticipantTile
        className="call-grid__tile call-grid__tile--local"
        style={isPresenting ? participantSquareTileStyle : tileStyle}
        label={localUserLabel}
        stream={localStream}
        showVideo={localHasVideo}
        mirror={mirrorLocal}
        isSpeaking={isLocalSpeaking}
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
        const isRemoteSpeaking =
          speakingUserIds.includes(remote.userId) ||
          (isPeerSpeaking && remoteMedia.length === 1);

        return (
          <div key={remote.userId} style={{ position: "relative", width: "100%", height: "100%" }}>
            <ParticipantTile
              className="call-grid__tile call-grid__tile--remote"
              style={isPresenting ? participantSquareTileStyle : tileStyle}
              label={remote.userId}
              stream={stream}
              showVideo={showVideo}
              isScreen={preferScreen}
              isSpeaking={isRemoteSpeaking}
            />
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
