import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { FamilyFile } from "../../../api/files";
import type { RemoteMedia } from "../../../realtime/call/types";
import CallParticipantGrid from "../../../components/CallParticipantGrid";
import { RealAvatar } from "../sidebar/RealAvatar";
import { SpeakingWaveBadge } from "./SpeakingWaveBadge";
import IconIntelligence from "../../../components/icons/IconIntelligence";
import { useCallRecording } from "./useCallRecording";
import { useLiveCaptions } from "./useLiveCaptions";
import { useTranscription } from "./useTranscription";
import { LiveCaptionsOverlay } from "./LiveCaptionsOverlay";
import { MeetingIntelligencePopover } from "./MeetingIntelligencePopover";
import { CallControlButton } from "./CallControlButton";
import { CallParticipantStage } from "./CallParticipantStage";

export function MobileActiveScreen({
  peerName,
  peerProfilePhoto,
  accessToken,
  callType,
  callPhase,
  isPeerSpeaking,
  isLocalSpeaking = false,
  isProximityNear,
  isMicMuted,
  isCameraEnabled,
  isScreenSharing,
  canShareScreen,
  cameraFacingMode,
  speakerMode,
  timer,
  hasRemoteVideo,
  localVideoStream,
  localScreenStream,
  remoteVideoStream,
  remoteMedia = [],
  localUserLabel = "You",
  speakingUserIds = [],
  mirrorLocalVideo,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onToggleFlip,
  onOpenSpeakerSheet,
  onEnd,
  onShrink,
  notice,
  roomId,
  currentUserId,
  socketRef,
}: {
  peerName: string;
  peerProfilePhoto?: FamilyFile | null;
  accessToken?: string | null;
  callType: "audio" | "video";
  callPhase: string;
  isPeerSpeaking: boolean;
  isLocalSpeaking?: boolean;
  isProximityNear: boolean;
  isMicMuted: boolean;
  isCameraEnabled: boolean;
  isScreenSharing: boolean;
  canShareScreen?: boolean;
  cameraFacingMode: "user" | "environment";
  speakerMode: "small" | "large";
  timer: string;
  hasRemoteVideo: boolean;
  localVideoStream: MediaStream | null;
  localScreenStream?: MediaStream | null;
  remoteVideoStream: MediaStream | null;
  remoteMedia?: RemoteMedia[];
  localUserLabel?: string;
  speakingUserIds?: string[];
  mirrorLocalVideo: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleFlip: () => void | Promise<void>;
  onOpenSpeakerSheet: () => void;
  onEnd: () => void;
  onShrink?: () => void;
  notice?: string | null;
  roomId?: string | null;
  currentUserId?: string | null;
  socketRef?: React.RefObject<Socket | null>;
}) {
  const [isIntelligenceOpen, setIsIntelligenceOpen] = useState(false);

  const transcription = useTranscription({
    accessToken: accessToken ?? null,
    roomId: roomId ?? null,
    currentUserId: currentUserId ?? null,
    socketRef,
    localAudioStream: localVideoStream,
    enabled: Boolean(roomId),
  });

  const recording = useCallRecording({
    accessToken: accessToken ?? null,
    roomId: roomId ?? null,
    socketRef,
    localStream: localVideoStream,
    localScreenStream,
    enabled: Boolean(roomId),
  });
  const liveCaptions = useLiveCaptions({
    accessToken: accessToken ?? null,
    roomId: roomId ?? null,
    localAudioStream: localVideoStream,
    displayName: localUserLabel,
    defaultLanguage: "en",
  });
  // Video elements for mobile
  const mobileRemoteRef = useRef<HTMLVideoElement>(null);
  const mobileLocalRef = useRef<HTMLVideoElement>(null);
  const mobileScreenRef = useRef<HTMLVideoElement>(null);

  const [areControlsVisible, setAreControlsVisible] = useState(true);
  const [isSelfViewFullscreen, setIsSelfViewFullscreen] = useState(false);
  const [selfViewSide, setSelfViewSide] = useState<"left" | "right">("right");

  // Lag mirroring behind the camera switch so scaleX doesn't flip while the old
  // front-camera frame is still visible — change it only during the black gap.
  const [previewFacingMode, setPreviewFacingMode] = useState(cameraFacingMode);
  const [isCameraFlipping, setIsCameraFlipping] = useState(false);
  const CALL_CONTROLS_HIDE_DELAY_MS = 15_000;

  const showControls = useCallback(() => setAreControlsVisible(true), []);
  const toggleControls = useCallback(() => setAreControlsVisible((visible) => !visible), []);
  const selfViewVerticalPosition = areControlsVisible ? "top" : "bottom";
  const compactPipClassName = `mobile-active-pip mobile-active-pip--${selfViewVerticalPosition} mobile-active-pip--${selfViewSide}`;

  const cycleSelfViewSide = useCallback(() => {
    setSelfViewSide((side) => (side === "right" ? "left" : "right"));
    showControls();
  }, [showControls]);

  useEffect(() => {
    if (!isCameraFlipping) {
      setPreviewFacingMode(cameraFacingMode);
    }
  }, [cameraFacingMode, isCameraFlipping]);

  // When returning to app from background (e.g. after sharing screen in another app),
  // immediately bring back controls so user sees them.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setAreControlsVisible(true);
      }
    };
    const handleFocus = () => {
      setAreControlsVisible(true);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const handleFlipCamera = useCallback(async () => {
    if (isCameraFlipping) return;
    const nextFacing = cameraFacingMode === "user" ? "environment" : "user";
    setIsCameraFlipping(true);
    // Let the blackout paint before facingMode/mirror state updates.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    try {
      await onToggleFlip();
    } finally {
      setPreviewFacingMode(nextFacing);
      requestAnimationFrame(() => setIsCameraFlipping(false));
    }
  }, [cameraFacingMode, isCameraFlipping, onToggleFlip]);

  const localVideoMirrorTransform =
    mirrorLocalVideo && previewFacingMode === "user" ? "scaleX(-1)" : "none";
  const localVideoSwitchStyle = isCameraFlipping
    ? { opacity: 0 as const, transform: localVideoMirrorTransform }
    : { transform: localVideoMirrorTransform };

  useEffect(() => {
    if (!areControlsVisible) return;
    const timerId = window.setTimeout(() => setAreControlsVisible(false), CALL_CONTROLS_HIDE_DELAY_MS);
    return () => window.clearTimeout(timerId);
  }, [areControlsVisible]);

  // Attach remote video stream
  useEffect(() => {
    const dst = mobileRemoteRef.current;
    if (!dst || !remoteVideoStream) return;

    const attachAndPlay = () => {
      if (dst.srcObject !== remoteVideoStream) {
        dst.srcObject = remoteVideoStream;
      }
      dst.muted = true;
      try {
        const playPromise = dst.play();
        if (playPromise && typeof playPromise.catch === "function") {
          void playPromise.catch(() => undefined);
        }
      } catch {}
    };

    attachAndPlay();

    const tracks = remoteVideoStream.getVideoTracks();
    const onTrackChange = () => attachAndPlay();
    for (const track of tracks) {
      track.addEventListener("unmute", onTrackChange);
    }
    dst.addEventListener("loadedmetadata", attachAndPlay);
    dst.addEventListener("canplay", attachAndPlay, { once: true });

    return () => {
      for (const track of tracks) {
        track.removeEventListener("unmute", onTrackChange);
      }
      dst.removeEventListener("loadedmetadata", attachAndPlay);
      dst.removeEventListener("canplay", attachAndPlay);
    };
  }, [remoteVideoStream, hasRemoteVideo]);

  // Attach local camera video stream
  useEffect(() => {
    const dst = mobileLocalRef.current;
    if (!dst) return;
    if (isCameraFlipping) {
      dst.srcObject = null;
      return;
    }
    if (dst.srcObject !== localVideoStream) {
      dst.srcObject = localVideoStream;
    }
    try {
      const playPromise = dst.play();
      if (playPromise && typeof playPromise.catch === "function") {
        void playPromise.catch(() => undefined);
      }
    } catch {}
  }, [localVideoStream, hasRemoteVideo, isCameraEnabled, callType, isCameraFlipping]);

  // Attach local screen share stream
  useEffect(() => {
    const dst = mobileScreenRef.current;
    if (!dst) return;
    if (!localScreenStream) {
      if (dst.srcObject) dst.srcObject = null;
      return;
    }

    const attachAndPlay = () => {
      if (dst.srcObject !== localScreenStream) {
        dst.srcObject = localScreenStream;
      }
      dst.muted = true;
      try {
        const playPromise = dst.play();
        if (playPromise && typeof playPromise.catch === "function") {
          void playPromise.catch(() => undefined);
        }
      } catch {}
    };

    attachAndPlay();

    const tracks = localScreenStream.getVideoTracks();
    const onTrackChange = () => attachAndPlay();
    for (const track of tracks) {
      track.addEventListener("unmute", onTrackChange);
    }
    dst.addEventListener("loadedmetadata", attachAndPlay);
    dst.addEventListener("canplay", attachAndPlay, { once: true });

    return () => {
      for (const track of tracks) {
        track.removeEventListener("unmute", onTrackChange);
      }
      dst.removeEventListener("loadedmetadata", attachAndPlay);
      dst.removeEventListener("canplay", attachAndPlay);
    };
  }, [localScreenStream, isScreenSharing]);

  const showRemoteVideo = Boolean(hasRemoteVideo || remoteVideoStream !== null);
  const isSharingLocalScreen = Boolean(isScreenSharing || localScreenStream);
  const hasRemoteScreenShare = remoteMedia.some(
    (media) => media.hasScreenShare && media.screenStream?.getVideoTracks().some((track) => track.readyState !== "ended"),
  );
  const showPresentationGrid = Boolean(localScreenStream) || hasRemoteScreenShare;
  const useSharedVideoGrid = showPresentationGrid || (callType === "video" && showRemoteVideo && Boolean(remoteVideoStream));
  const gridRemoteMedia = remoteMedia.length > 0
    ? remoteMedia
    : remoteVideoStream
      ? [{ userId: peerName, stream: remoteVideoStream, screenStream: null, hasVideo: true, hasAudio: true, hasScreenShare: false }]
      : [];
  const showLocalCamera = Boolean(isCameraEnabled && localVideoStream);
  const showAnyVideo = showRemoteVideo || isSharingLocalScreen || showPresentationGrid || (callType === "video" && isCameraEnabled);
  const showAvatar = !showAnyVideo;
  const showProximityBlank =
    isProximityNear && (callType === "audio" || (!isCameraEnabled && !showRemoteVideo && !isSharingLocalScreen));

  return (
    <div
      className={`mobile-active-screen${showAnyVideo ? " mobile-active-screen--video" : ""}`}
      onPointerDown={toggleControls}
    >
      {/* Top right shrink button */}
      <div className={`mobile-active-top-bar${areControlsVisible ? "" : " mobile-active-controls--hidden"}`}>
        <button
          type="button"
          className="mobile-active-shrink-btn"
          aria-label="Shrink call"
          title="Shrink call"
          onClick={(e) => {
            e.stopPropagation();
            onShrink?.();
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>

      {/* Screen sharing indicator banner with direct Stop button */}
      {isSharingLocalScreen && (
        <div
          className={`mobile-active-screenshare-bar${areControlsVisible ? "" : " mobile-active-controls--hidden"}`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="mobile-active-screenshare-dot" aria-hidden="true" />
          <span>Sharing screen</span>
          <button
            type="button"
            className="mobile-active-screenshare-stop-btn"
            aria-label="Stop screen share"
            onClick={(e) => {
              e.stopPropagation();
              onToggleScreenShare();
            }}
          >
            Stop
          </button>
        </div>
      )}

      {notice && (
        <div className="mobile-active-notice-banner" role="status" aria-live="polite">
          <span>{notice}</span>
        </div>
      )}

      {showProximityBlank && (
        <div className="mobile-active-proximity-blank" aria-hidden="true" />
      )}

      {/* Video stage */}
      {showAnyVideo && (
        <CallParticipantStage className="shared-call-stage mobile-active-video-stage" onPointerDown={toggleControls}>
          {useSharedVideoGrid ? (
            <CallParticipantGrid
              localStream={localVideoStream}
              localScreenStream={localScreenStream}
              remoteMedia={gridRemoteMedia}
              localUserLabel={localUserLabel}
              mirrorLocal={mirrorLocalVideo && previewFacingMode === "user"}
              callType={callType}
              isLocalSpeaking={isLocalSpeaking}
              isLocalMuted={isMicMuted}
              isPeerSpeaking={isPeerSpeaking}
              speakingUserIds={speakingUserIds}
              onFlipLocalCamera={() => void handleFlipCamera()}
              isFlippingCamera={isCameraFlipping}
            />
          ) : (
            <>
          {/* Case 1: Remote video is available */}
          {showRemoteVideo && remoteVideoStream && (
            <>
              <div className="mobile-active-remote-video-wrap">
                <video
                  ref={mobileRemoteRef}
                  className={isSelfViewFullscreen ? compactPipClassName : "mobile-active-fullscreen-video"}
                  autoPlay
                  playsInline
                  muted
                  onClick={isSelfViewFullscreen ? cycleSelfViewSide : undefined}
                />
                {!isSelfViewFullscreen && isPeerSpeaking && <SpeakingWaveBadge />}
                {isSelfViewFullscreen && isLocalSpeaking && <SpeakingWaveBadge />}
              </div>
              {/* Local Screen Share in PiP or Fullscreen */}
              {isSharingLocalScreen && localScreenStream && (
                isSelfViewFullscreen ? (
                  <div className="mobile-active-remote-video-wrap">
                    <video
                      ref={mobileScreenRef}
                      className="mobile-active-fullscreen-video mobile-active-fullscreen-video--contain"
                      autoPlay
                      playsInline
                      muted
                    />
                    {isPeerSpeaking && <SpeakingWaveBadge />}
                  </div>
                ) : (
                  <div className={compactPipClassName} onClick={cycleSelfViewSide}>
                    <video
                      ref={mobileScreenRef}
                      className="mobile-active-pip-video--contain"
                      autoPlay
                      playsInline
                      muted
                    />
                    <span className="mobile-active-pip-label">Your screen</span>
                  </div>
                )
              )}
              {/* Local Camera in PiP if no screen share or screen share is main */}
              {!isSharingLocalScreen && isCameraEnabled && (
                isSelfViewFullscreen ? (
                  <div className="mobile-active-remote-video-wrap">
                    <video
                      ref={mobileLocalRef}
                      className="mobile-active-fullscreen-video"
                      autoPlay
                      playsInline
                      muted
                      style={localVideoSwitchStyle}
                    />
                    {isPeerSpeaking && <SpeakingWaveBadge />}
                  </div>
                ) : (
                  <div className={compactPipClassName} onClick={cycleSelfViewSide}>
                    <video
                      ref={mobileLocalRef}
                      autoPlay
                      playsInline
                      muted
                      style={localVideoSwitchStyle}
                    />
                    {isLocalSpeaking && <SpeakingWaveBadge className="speaking-wave-badge--pip" />}
                    <CallControlButton
                      action="flip-camera"
                      state="idle"
                      iconSize={18}
                      className="mobile-active-pip-flip"
                      label="Flip camera"
                      disabled={isCameraFlipping}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleFlipCamera();
                      }}
                    />
                  </div>
                )
              )}
            </>
          )}

          {/* Case 2: No remote video, but local screen share is active */}
          {!showRemoteVideo && isSharingLocalScreen && (
            <>
              <div className="mobile-active-remote-video-wrap">
                <video
                  ref={mobileScreenRef}
                  className="mobile-active-fullscreen-video mobile-active-fullscreen-video--contain"
                  autoPlay
                  playsInline
                  muted
                />
              </div>
              {/* If local camera is also enabled, show camera in PiP */}
              {isCameraEnabled && localVideoStream && (
                <div className={compactPipClassName} onClick={cycleSelfViewSide}>
                  <video
                    ref={mobileLocalRef}
                    autoPlay
                    playsInline
                    muted
                    style={localVideoSwitchStyle}
                  />
                  {isLocalSpeaking && <SpeakingWaveBadge className="speaking-wave-badge--pip" />}
                  <CallControlButton
                    action="flip-camera"
                    state="idle"
                    iconSize={18}
                    className="mobile-active-pip-flip"
                    label="Flip camera"
                    disabled={isCameraFlipping}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleFlipCamera();
                    }}
                  />
                </div>
              )}
            </>
          )}

          {/* Case 3: No remote video, no screen share, but local camera is active */}
          {!showRemoteVideo && !isSharingLocalScreen && isCameraEnabled && (
            <div style={{ position: "absolute", inset: 0, zIndex: 0, background: "#000", pointerEvents: "auto" }}>
              <video
                ref={mobileLocalRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  ...localVideoSwitchStyle,
                }}
              />
              {isLocalSpeaking && <SpeakingWaveBadge />}
              <CallControlButton
                action="flip-camera"
                state="idle"
                iconSize={18}
                className="mobile-active-pip-flip"
                style={{ top: "max(calc(env(safe-area-inset-top, 0px) + 64px), 72px)", right: "16px", width: "40px", height: "40px" }}
                label="Flip camera"
                disabled={isCameraFlipping}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleFlipCamera();
                }}
              />
            </div>
          )}
            </>
          )}
        </CallParticipantStage>
      )}

      {/* Avatar view for audio-only calls without video/screen */}
      {showAvatar && (
        <>
          {(() => {
            const isAnimating = isPeerSpeaking || callPhase === "outgoing" || callPhase === "connecting";
            return (
              <>
                <div className="mobile-active-avatar-wrap">
                  <div className={`mobile-active-audio-ring${isAnimating ? "" : " silent"}`} />
                  <div className={`mobile-active-audio-ring${isAnimating ? "" : " silent"}`} />
                  <RealAvatar
                    accessToken={accessToken ?? null}
                    className="avatar mobile-active-avatar"
                    file={peerProfilePhoto}
                    label={peerName}
                  />
                </div>
                <div className="mobile-active-name">{peerName}</div>
                <div className="mobile-active-time">
                  {callPhase === "in-call" ? timer : callPhase === "outgoing" ? "Calling…" : "Connecting…"}
                </div>
                {callPhase === "in-call" && <div className={`mobile-active-speaking-status${isPeerSpeaking ? " is-speaking" : ""}`} role="status">{isPeerSpeaking ? "Speaking" : "Connected"}</div>}
                <div className="mobile-active-waveform">
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className={`mobile-active-wave-bar${isAnimating ? "" : " silent"}`} />
                  ))}
                </div>
              </>
            );
          })()}
        </>
      )}

      {/* Bottom control bar */}
      <div
        className={`mobile-active-controls shared-call-controls${areControlsVisible ? "" : " mobile-active-controls--hidden"}`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {/* Mic */}
        <div className="mobile-active-ctrl">
          <CallControlButton action="microphone" state={isMicMuted ? "muted" : "active"} className={`mobile-active-ctrl-btn${isMicMuted ? " muted" : " active"}`} label={isMicMuted ? "Unmute" : "Mute"} onClick={onToggleMic} />
          <span className="mobile-active-ctrl-lbl">{isMicMuted ? "Unmute" : "Mute"}</span>
        </div>

        {/* Speaker */}
        <div className="mobile-active-ctrl">
          <CallControlButton action="audio-output" toggle state={speakerMode === "large" ? "active" : "idle"} className={`mobile-active-ctrl-btn${speakerMode === "large" ? " active" : ""}`} label="Audio output" onClick={onOpenSpeakerSheet} />
          <span className="mobile-active-ctrl-lbl">{speakerMode === "large" ? "Speaker" : "Earpiece"}</span>
        </div>

        {/* Camera */}
        <div className="mobile-active-ctrl">
          <CallControlButton action="camera" state={isCameraEnabled ? "active" : "muted"} className={`mobile-active-ctrl-btn${isCameraEnabled ? " active" : " muted"}`} label={isCameraEnabled ? "Turn off camera" : "Turn on camera"} onClick={onToggleCamera} />
          <span className="mobile-active-ctrl-lbl">{isCameraEnabled ? "Camera" : "Camera off"}</span>
        </div>

        {/* Screen Demonstration / Share button */}
        <div className="mobile-active-ctrl">
          <CallControlButton action="screen-share" state={isSharingLocalScreen ? "active" : "idle"} className={`mobile-active-ctrl-btn${isSharingLocalScreen ? " active" : ""}`} label={isSharingLocalScreen ? "Stop sharing screen" : "Share screen"} onClick={onToggleScreenShare} />
          <span className="mobile-active-ctrl-lbl">
            {isSharingLocalScreen ? "Stop share" : "Share"}
          </span>
        </div>

        {/* Stovo Intelligence */}
        <div className="mobile-active-ctrl" style={{ position: "relative" }}>
          <button
            type="button"
            className={`mobile-active-ctrl-btn${isIntelligenceOpen || recording?.isRecordingActive || transcription?.transcriptState === "recording" ? " active" : ""}`}
            aria-label="Stovo Intelligence"
            onClick={() => setIsIntelligenceOpen((open) => !open)}
          >
            <IconIntelligence size={18} />
          </button>
          <span className="mobile-active-ctrl-lbl">AI</span>

          {transcription && recording && liveCaptions && (
            <MeetingIntelligencePopover
              isOpen={isIntelligenceOpen}
              onClose={() => setIsIntelligenceOpen(false)}
              notesState={transcription.transcriptState}
              onToggleNotes={() => {
                if (transcription.transcriptState === "idle" || transcription.transcriptState === "failed") {
                  void transcription.startTranscription();
                } else if (transcription.transcriptState === "recording") {
                  void transcription.stopTranscription();
                }
              }}
              isNotesAllowed={true}
              recordingState={recording.recordingState}
              recordingTimer={recording.recordingTimer}
              onToggleRecording={() => {
                if (recording.recordingState === "idle" || recording.recordingState === "completed" || recording.recordingState === "failed") {
                  void recording.startRecording();
                } else if (recording.recordingState === "recording") {
                  void recording.stopRecording();
                }
              }}
              isRecordingAllowed={true}
              isCaptionsEnabled={liveCaptions.isCaptionsEnabled}
              onToggleCaptions={liveCaptions.toggleCaptions}
              targetLanguage={liveCaptions.targetLanguage}
              onChangeTargetLanguage={liveCaptions.setTargetLanguage}
              isMobile={true}
            />
          )}
        </div>

        {/* End Call */}
        <div className="mobile-active-ctrl">
          <CallControlButton action="end-call" state="idle" className="mobile-active-ctrl-btn end" label="End call" onClick={onEnd} />
          <span className="mobile-active-ctrl-lbl">End</span>
        </div>
      </div>

      {/* Floating Subtitle Overlay for Live Captions */}
      {liveCaptions && (
        <LiveCaptionsOverlay
          isCaptionsEnabled={liveCaptions.isCaptionsEnabled}
          recentCaptions={liveCaptions.recentCaptions}
          currentInterimCaption={liveCaptions.currentInterimCaption}
          targetLanguage={liveCaptions.targetLanguage}
          speakerDisplayName={localUserLabel}
        />
      )}
    </div>
  );
}
