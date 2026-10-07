import { useState, type CSSProperties, type ReactNode } from "react";
import type { RemoteMedia } from "../realtime/call/types";
import { CallControlButton } from "../features/chats/calling/CallControlButton";
import { CallParticipantFocusStage } from "./CallParticipantFocusStage";

type CallParticipantGridProps = {
  localStream: MediaStream | null;
  localScreenStream?: MediaStream | null;
  remoteMedia: RemoteMedia[];
  localUserLabel?: string;
  mirrorLocal?: boolean;
  callType: "audio" | "video";
  isLocalSpeaking?: boolean;
  isLocalMuted?: boolean;
  isPeerSpeaking?: boolean;
  speakingUserIds?: string[];
  onFlipLocalCamera?: () => void;
  isFlippingCamera?: boolean;
  localVideoPlaceholder?: ReactNode;
  mobileSingleRemote?: boolean;
  isLocalPrimary?: boolean;
  onToggleMobileStage?: () => void;
  onFocusChange?: (focused: boolean, closeFocus: () => void) => void;
  isMobileLayout?: boolean;
  isCallConnected?: boolean;
  hideParticipants?: boolean;
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
  background: "#080808",
  borderRadius: "18px",
  overflow: "hidden",
  minHeight: "120px",
  aspectRatio: "16 / 9",
};

const landscapePresenterTileStyle: CSSProperties = {
  ...tileStyle,
  aspectRatio: "19 / 9",
  minHeight: "180px",
  gridColumn: "1 / -1",
};

const videoStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
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
}) {
  return (
    <div
      className={`${className}${isSpeaking ? " is-speaking" : ""}${mobilePrimary ? " call-grid__mobile-primary" : ""}${mobilePip ? " call-grid__mobile-pip mobile-active-pip" : ""}`}
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
        <>
          <video
            className={`call-grid__video${mobilePrimary ? " mobile-active-fullscreen-video" : ""}${mobilePip ? " mobile-active-pip-video" : ""}`}
            style={{
              ...(isScreen ? screenVideoStyle : videoStyle),
              transform: mirror ? "scaleX(-1)" : undefined,
            }}
            autoPlay
            playsInline
            muted
            ref={(el) => bindStream(el, stream)}
          />
        </>
      ) : localVideoPlaceholder ? (
        localVideoPlaceholder
      ) : (
        <div className="call-grid__avatar-wrap">
          <div className="call-grid__avatar-circle">
            <div className="call-grid__avatar" style={avatarStyle}>
              {initial(label)}
            </div>
          </div>
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
      {isConnected && <span className="call-grid__participant-status" role="status">{isMuted ? "Muted" : isSpeaking ? "Speaking" : "Connected"}</span>}
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
  isLocalMuted = false,
  isPeerSpeaking = false,
  speakingUserIds = [],
  onFlipLocalCamera,
  isFlippingCamera,
  localVideoPlaceholder,
  mobileSingleRemote = false,
  isLocalPrimary = false,
  onToggleMobileStage,
  onFocusChange,
  isMobileLayout = false,
  isCallConnected = true,
  hideParticipants = false,
}: CallParticipantGridProps) {
  const [focusedParticipantId, setFocusedParticipantId] = useState<string | null>(null);
  // Voice channels may keep their audio call type while a local camera track
  // is live. The presentation/PiP grid must follow the actual track, otherwise
  // it replaces the user's camera with an avatar during a screen share.
  const localHasVideo = Boolean(
    localStream?.getVideoTracks().some((track) => track.readyState !== "ended" && track.enabled !== false),
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

  const count = 1 + remoteMedia.length;
  const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(count))));

  const isPresenterSpeaking = presenter
    ? presenter.userId === localUserLabel
      ? isLocalSpeaking && !isLocalMuted
      : isCallConnected && !("isMuted" in presenter && presenter.isMuted) && (speakingUserIds.includes(presenter.userId) || (isPeerSpeaking && remoteMedia.length === 1))
    : false;
  const useScreenShareRail = isPresenting && !mobileSingleRemote && !isMobileLayout;

  const closeFocus = () => {
    setFocusedParticipantId(null);
    onFocusChange?.(false, () => undefined);
  };

  const focusParticipant = (participantId: string) => {
    setFocusedParticipantId(participantId);
    onFocusChange?.(true, closeFocus);
  };

  const localTile = (
    <ParticipantTile
      className="call-grid__tile call-grid__tile--local"
      style={mobileSingleRemote ? { ...tileStyle, width: "100%", height: "100%", minHeight: 0, aspectRatio: "auto" } : tileStyle}
      label={localUserLabel}
      stream={localStream}
      showVideo={localHasVideo || Boolean(localVideoPlaceholder)}
      mirror={mirrorLocal}
      isSpeaking={isCallConnected && isLocalSpeaking && !isLocalMuted}
      isMuted={isLocalMuted}
      isConnected={isCallConnected}
      onFlipCamera={mobileSingleRemote ? undefined : onFlipLocalCamera}
      isFlippingCamera={isFlippingCamera}
      localVideoPlaceholder={localVideoPlaceholder}
      mobilePrimary={mobileSingleRemote && isLocalPrimary}
      mobilePip={mobileSingleRemote && !isLocalPrimary}
      onClick={() => { if (mobileSingleRemote) onToggleMobileStage?.(); else focusParticipant(localUserLabel); }}
    />
  );

  const remoteTiles = remoteMedia.map((remote) => {
    const preferScreen = !isPresenting && remote.hasScreenShare && Boolean(remote.screenStream?.getVideoTracks().some((track) => track.readyState !== "ended"));
    const cameraVideo = remote.hasVideo && remote.stream.getVideoTracks().some((track) => track.readyState !== "ended");
    const showVideo = preferScreen || cameraVideo;
    const stream = preferScreen ? remote.screenStream : remote.stream;
    const isRemoteSpeaking = isCallConnected && !remote.isMuted && (speakingUserIds.includes(remote.userId) || (isPeerSpeaking && remoteMedia.length === 1));
    return (
      <div key={remote.userId} data-participant-id={remote.userId} className={mobileSingleRemote ? (isLocalPrimary ? "call-grid__remote-wrap call-grid__remote-wrap--pip" : "call-grid__remote-wrap call-grid__remote-wrap--primary") : undefined} style={{ position: "relative", width: "100%", height: "100%", aspectRatio: isPresenting && !mobileSingleRemote ? "16 / 9" : undefined }}>
        <ParticipantTile className="call-grid__tile call-grid__tile--remote" style={tileStyle} label={remote.userId} stream={stream} showVideo={showVideo} isScreen={preferScreen} isSpeaking={isRemoteSpeaking} isMuted={Boolean(remote.isMuted)} isConnected={isCallConnected} mobilePrimary={mobileSingleRemote && !isLocalPrimary} mobilePip={mobileSingleRemote && isLocalPrimary} onClick={() => { if (mobileSingleRemote) onToggleMobileStage?.(); else focusParticipant(remote.userId); }} />
      </div>
    );
  });

  const stageContent = focusedParticipantId ? (
    <CallParticipantFocusStage participantId={focusedParticipantId} localUserLabel={localUserLabel} localStream={localStream} localHasVideo={localHasVideo} localMuted={isLocalMuted} localPlaceholder={localVideoPlaceholder} remoteMedia={remoteMedia} onSelect={focusParticipant} onClose={closeFocus} showCloseControl={!onFocusChange} />
  ) : (
    <div
      className={`call-grid${isPresenting ? " call-grid--presenting" : ""}${useScreenShareRail ? " call-grid--screen-share" : ""}${mobileSingleRemote ? " call-grid--mobile-single" : ""}`}
      style={{
        ...gridStyle,
        gridTemplateColumns: !useScreenShareRail && isPresenting
          ? "repeat(auto-fit, minmax(120px, 1fr))"
          : !useScreenShareRail ? `repeat(${columns}, minmax(0, 1fr))` : undefined,
      }}
    >
      {presenter?.screenStream ? (
        <ParticipantTile
          className="call-grid__tile call-grid__tile--screen"
          style={useScreenShareRail
            ? { ...landscapePresenterTileStyle, gridColumn: "2", gridRow: "1", maxWidth: "none", minHeight: 0, aspectRatio: "auto", justifySelf: "stretch" }
            : landscapePresenterTileStyle}
          label={presenter.userId}
          stream={presenter.screenStream}
          showVideo
          isScreen
          isSpeaking={isPresenterSpeaking}
          isMuted={presenter.userId === localUserLabel ? isLocalMuted : "isMuted" in presenter && Boolean(presenter.isMuted)}
          isConnected={isCallConnected}
        />
      ) : null}

      {hideParticipants ? null : useScreenShareRail ? (
        <div className="call-grid__participant-rail">
          <div className="call-grid__participant-pin" data-participant-id={localUserLabel}>{localTile}</div>
          <div className="call-grid__remote-rail">{remoteTiles}</div>
        </div>
      ) : mobileSingleRemote ? (
        <div className={`call-grid__mobile-local-wrap ${isLocalPrimary ? "call-grid__mobile-local-wrap--primary" : "call-grid__mobile-local-wrap--pip"}`}>
          {localTile}
          {localHasVideo && onFlipLocalCamera && (
            <CallControlButton
              action="flip-camera"
              label="Flip camera"
              state="idle"
              iconSize={16}
              className="call-grid__flip-camera call-grid__mobile-flip-camera"
              disabled={isFlippingCamera}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); onFlipLocalCamera(); }}
            />
          )}
        </div>
      ) : localTile}

      {!hideParticipants && !useScreenShareRail ? remoteTiles : null}
    </div>
  );

  return (
    <div className="call-grid-shell">
      {stageContent}
      <div className="call-grid__audio-pool" aria-hidden="true">
        {remoteMedia.map((remote) => {
          const hasLiveCamera = Boolean(remote.hasVideo && remote.stream?.getVideoTracks().some((track) => track.readyState !== "ended"));
          return remote.hasAudio && !hasLiveCamera ? <audio key={remote.userId} className="call-grid__audio" autoPlay ref={(element) => bindStream(element, remote.stream)} /> : null;
        })}
      </div>
    </div>
  );
}
