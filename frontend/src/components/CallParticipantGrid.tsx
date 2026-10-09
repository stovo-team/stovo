import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { RemoteMedia } from "../realtime/call/types";
import type { FamilyFile } from "../api/files";
import { CallControlButton } from "../features/chats/calling/CallControlButton";
import { CallParticipantFocusStage } from "./CallParticipantFocusStage";
import { CallParticipantTile } from "./CallParticipantTile";
import { getScreenShareBottomRailHeight, getScreenShareLayout, getScreenSharePresenterSize } from "../features/chats/calling/screenShareLayout";

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
  participantProfiles?: Record<string, { displayName: string; profilePhoto: FamilyFile | null }>;
  accessToken?: string | null;
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
  aspectRatio: "16 / 9",
  minHeight: 0,
  gridColumn: "1 / -1",
};

function bindStream(el: HTMLVideoElement | HTMLAudioElement | null, stream: MediaStream | null) {
  if (el && stream && el.srcObject !== stream) {
    el.srcObject = stream;
  }
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
  participantProfiles = {},
  accessToken,
}: CallParticipantGridProps) {
  const [focusedParticipantId, setFocusedParticipantId] = useState<string | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updateSize = (width: number, height: number) => {
      if (!width || !height) return;
      setStageSize((current) => current?.width === width && current.height === height ? current : { width, height });
    };

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) updateSize(entry.contentRect.width, entry.contentRect.height);
      });
      observer.observe(stage);
      return () => observer.disconnect();
    }

    const measure = () => {
      const { width, height } = stage.getBoundingClientRect();
      updateSize(width, height);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

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

  const useScreenShareRail = isPresenting && !mobileSingleRemote && !isMobileLayout;
  const useBottomScreenShareRail = useScreenShareRail && (
    stageSize
      ? getScreenShareLayout(stageSize.width, stageSize.height, remoteMedia.length + 1) === "bottom"
      : remoteMedia.length >= 4
  );
  const screenPresenterSize = useScreenShareRail && stageSize
    ? getScreenSharePresenterSize(
      stageSize.width,
      stageSize.height,
      useBottomScreenShareRail ? "bottom" : "side",
      getScreenShareBottomRailHeight(window.innerHeight),
    )
    : null;
  const useMobilePresentationRow = isPresenting && isMobileLayout && !mobileSingleRemote;
  const hasLongMobileParticipantRow = useMobilePresentationRow && remoteMedia.length >= 5;

  const closeFocus = () => {
    setFocusedParticipantId(null);
    onFocusChange?.(false, () => undefined);
  };

  const focusParticipant = (participantId: string) => {
    setFocusedParticipantId(participantId);
    onFocusChange?.(true, closeFocus);
  };

  const localTile = (
    <CallParticipantTile
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
      accessToken={accessToken}
      profilePhoto={participantProfiles[localUserLabel]?.profilePhoto ?? null}
      mobilePrimary={mobileSingleRemote && isLocalPrimary}
      mobilePip={mobileSingleRemote && !isLocalPrimary}
      onClick={mobileSingleRemote ? () => onToggleMobileStage?.() : isMobileLayout ? undefined : () => focusParticipant(localUserLabel)}
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
        <CallParticipantTile className="call-grid__tile call-grid__tile--remote" style={tileStyle} label={participantProfiles[remote.userId]?.displayName ?? remote.userId} stream={stream} showVideo={showVideo} isScreen={preferScreen} isSpeaking={isRemoteSpeaking} isMuted={Boolean(remote.isMuted)} isConnected={isCallConnected} accessToken={accessToken} profilePhoto={participantProfiles[remote.userId]?.profilePhoto ?? null} mobilePrimary={mobileSingleRemote && !isLocalPrimary} mobilePip={mobileSingleRemote && isLocalPrimary} onClick={mobileSingleRemote ? () => onToggleMobileStage?.() : isMobileLayout ? undefined : () => focusParticipant(remote.userId)} />
      </div>
    );
  });

  const stageContent = focusedParticipantId ? (
    <CallParticipantFocusStage participantId={focusedParticipantId} localUserLabel={localUserLabel} localStream={localStream} localHasVideo={localHasVideo} localMuted={isLocalMuted} localPlaceholder={localVideoPlaceholder} remoteMedia={remoteMedia} onSelect={focusParticipant} onClose={closeFocus} showCloseControl={!onFocusChange} />
  ) : (
    <div
      className={`call-grid${isPresenting ? " call-grid--presenting" : ""}${useScreenShareRail ? " call-grid--screen-share" : ""}${useBottomScreenShareRail ? " call-grid--screen-share-bottom" : ""}${useMobilePresentationRow ? " call-grid--mobile-presentation" : ""}${hasLongMobileParticipantRow ? " call-grid--mobile-presentation-many" : ""}${mobileSingleRemote ? " call-grid--mobile-single" : ""}`}
      style={{
        ...gridStyle,
        gridTemplateColumns: useScreenShareRail
          ? undefined
          : useMobilePresentationRow
          ? "minmax(0, 1fr)"
          : isPresenting
          ? "repeat(auto-fit, minmax(120px, 1fr))"
          : `repeat(${columns}, minmax(0, 1fr))`,
      }}
    >
      {presenter?.screenStream ? (
        <CallParticipantTile
          className="call-grid__tile call-grid__tile--screen"
          style={useScreenShareRail
            ? useBottomScreenShareRail
              ? { ...landscapePresenterTileStyle, gridColumn: "1", gridRow: "1", width: screenPresenterSize?.width ?? "100%", height: screenPresenterSize?.height ?? "auto", maxWidth: "100%", maxHeight: "100%", aspectRatio: "16 / 9", alignSelf: "center", justifySelf: "center" }
              : { ...landscapePresenterTileStyle, gridColumn: "1", gridRow: "1", width: screenPresenterSize?.width ?? "100%", height: screenPresenterSize?.height ?? "auto", maxWidth: "100%", maxHeight: "100%", aspectRatio: "16 / 9", alignSelf: "center", justifySelf: "center" }
            : useMobilePresentationRow
              ? { ...tileStyle, gridColumn: "1 / -1", width: "100%", height: "auto", minHeight: 0, aspectRatio: "16 / 9", maxHeight: "none" }
              : landscapePresenterTileStyle}
          label={presenter.userId}
          stream={presenter.screenStream}
          showVideo
          isScreen
          isMuted={presenter.userId === localUserLabel ? isLocalMuted : "isMuted" in presenter && Boolean(presenter.isMuted)}
          isConnected={isCallConnected}
        />
      ) : null}

      {hideParticipants ? null : useScreenShareRail ? (
        <div className="call-grid__participant-rail">
          <div className="call-grid__participant-pin" data-participant-id={localUserLabel}>{localTile}</div>
          <div className="call-grid__remote-rail">{remoteTiles}</div>
        </div>
      ) : useMobilePresentationRow ? (
        <div className="call-grid__mobile-participant-row">
          {localTile}
          {remoteTiles}
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

      {!hideParticipants && !useScreenShareRail && !useMobilePresentationRow ? remoteTiles : null}
    </div>
  );

  return (
    <div className="call-grid-shell" ref={stageRef}>
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
