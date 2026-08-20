import { useCallback, useEffect, useRef, useState } from "react";
import type { FamilyFile } from "../../../api/files";
import { RealAvatar } from "../sidebar/RealAvatar";

export function MobileActiveScreen({
  peerName,
  peerProfilePhoto,
  accessToken,
  callType,
  callPhase,
  isPeerSpeaking,
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
  remoteVideoStream,
  mirrorLocalVideo,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onToggleFlip,
  onOpenSpeakerSheet,
  onEnd,
}: {
  peerName: string;
  peerProfilePhoto?: FamilyFile | null;
  accessToken?: string | null;
  callType: "audio" | "video";
  callPhase: string;
  isPeerSpeaking: boolean;
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
  remoteVideoStream: MediaStream | null;
  mirrorLocalVideo: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleFlip: () => void | Promise<void>;
  onOpenSpeakerSheet: () => void;
  onEnd: () => void;
  onShrink?: () => void;
  notice?: string | null;
}) {
  // Local video elements for mobile — srcObject is set directly from the stream props
  // so the UI reacts as soon as the stream is available without timing fragility.
  const mobileRemoteRef = useRef<HTMLVideoElement>(null);
  const mobileLocalRef = useRef<HTMLVideoElement>(null);
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
    setSelfViewSide((side) => side === "right" ? "left" : "right");
    showControls();
  }, [showControls]);

  useEffect(() => {
    if (!isCameraFlipping) {
      setPreviewFacingMode(cameraFacingMode);
    }
  }, [cameraFacingMode, isCameraFlipping]);

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

  useEffect(() => {
    const dst = mobileRemoteRef.current;
    if (!dst || !remoteVideoStream) return;

    const attachAndPlay = () => {
      if (dst.srcObject !== remoteVideoStream) {
        dst.srcObject = remoteVideoStream;
      }
      dst.muted = true;
      void dst.play().catch(() => undefined);
    };

    attachAndPlay();

    // Android WebView may reject the first play() until metadata is ready or the
    // track unmutes — listen for those events and retry.
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

  useEffect(() => {
    const dst = mobileLocalRef.current;
    if (!dst) return;
    if (isCameraFlipping) {
      dst.srcObject = null;
      return;
    }
    if (!localVideoStream) return;
    dst.srcObject = localVideoStream;
    void dst.play().catch(() => undefined);
  }, [localVideoStream, hasRemoteVideo, isCameraEnabled, callType, isCameraFlipping]);

  const initial = peerName ? peerName.charAt(0).toUpperCase() : "?";
  const showRemoteVideo = hasRemoteVideo || remoteVideoStream !== null;
  const showAvatar = !showRemoteVideo && (callType === "audio" || !isCameraEnabled);
  const showVideo = callType === "video" && isCameraEnabled;
  const showProximityBlank =
    isProximityNear &&
    (callType === "audio" || !isCameraEnabled || !showRemoteVideo);
  return (
    <div
      className={`mobile-active-screen${(showVideo || showRemoteVideo || (callType === "video" && isCameraEnabled)) ? " mobile-active-screen--video" : ""}`}
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

      {notice && (
        <div className="mobile-active-notice-banner" role="status" aria-live="polite">
          <span>{notice}</span>
        </div>
      )}

      {showProximityBlank && (
        <div className="mobile-active-proximity-blank" aria-hidden="true" />
      )}
      {/* Case 1: Local camera only (no remote video yet) — show self-view fullscreen */}
      {callType === "video" && isCameraEnabled && !showRemoteVideo && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: '#000' }}>
          <video
            ref={mobileLocalRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              ...localVideoSwitchStyle,
            }}
          />
        </div>
      )}

      {/* Case 2: Remote video active — show remote fullscreen, local as PiP */}
      {showRemoteVideo && remoteVideoStream && (
        <div className="mobile-active-video-stage">
          <video
            ref={mobileRemoteRef}
            className={isSelfViewFullscreen ? compactPipClassName : "mobile-active-fullscreen-video"}
            autoPlay
            playsInline
            muted
            onClick={isSelfViewFullscreen ? cycleSelfViewSide : undefined}
          />
          {isCameraEnabled && (
            isSelfViewFullscreen ? (
              <video
                ref={mobileLocalRef}
                className="mobile-active-fullscreen-video"
                autoPlay
                playsInline
                muted
                style={localVideoSwitchStyle}
              />
            ) : (
              <div className={compactPipClassName} onClick={cycleSelfViewSide}>
                <video
                  ref={mobileLocalRef}
                  autoPlay
                  playsInline
                  muted
                  style={localVideoSwitchStyle}
                />
                <button
                  type="button"
                  className="mobile-active-pip-flip"
                  aria-label="Flip camera"
                  disabled={isCameraFlipping}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleFlipCamera();
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15"/></svg>
                </button>
              </div>
            )
          )}
        </div>
      )}
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
                <div className="mobile-active-waveform">
                  {[0,1,2,3,4,5,6].map((i) => (
                    <div key={i} className={`mobile-active-wave-bar${isAnimating ? "" : " silent"}`} />
                  ))}
                </div>
              </>
            );
          })()}
        </>
      )}
      <div
        className={`mobile-active-controls${areControlsVisible ? "" : " mobile-active-controls--hidden"}`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {/* Mic */}
        <div className="mobile-active-ctrl">
          <button
            type="button"
            className={`mobile-active-ctrl-btn${isMicMuted ? " muted" : ""}`}
            aria-label={isMicMuted ? "Unmute" : "Mute"}
            onClick={onToggleMic}
          >
            <svg viewBox="0 0 24 24">{isMicMuted
              ? <><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8"/></>
              : <><path d="M12 1a3 3 0 013 3v8a3 3 0 01-6 0V4a3 3 0 013-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></>
            }</svg>
          </button>
          <span className="mobile-active-ctrl-lbl">{isMicMuted ? "Unmute" : "Mute"}</span>
        </div>
        {/* Speaker */}
        <div className="mobile-active-ctrl">
          <button
            type="button"
            className={`mobile-active-ctrl-btn${speakerMode === "large" ? " active" : ""}`}
            aria-label="Audio output"
            onClick={onOpenSpeakerSheet}
          >
            <svg viewBox="0 0 24 24">
              {speakerMode === "large"
                ? <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/></>
                : <><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></>
              }
            </svg>
          </button>
          <span className="mobile-active-ctrl-lbl">{speakerMode === "large" ? "Speaker" : "Earpiece"}</span>
        </div>
        {/* Camera */}
        <div className="mobile-active-ctrl">
          <button
            type="button"
            className={`mobile-active-ctrl-btn${!isCameraEnabled ? " muted" : ""}`}
            aria-label={isCameraEnabled ? "Turn off camera" : "Turn on camera"}
            onClick={onToggleCamera}
          >
            <svg viewBox="0 0 24 24">
              {isCameraEnabled
                ? <><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></>
                : <><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3m3-3h6l2 3h2a2 2 0 012 2v9.34m-7.72-2.06A4 4 0 1111.17 9"/></>
              }
            </svg>
          </button>
          <span className="mobile-active-ctrl-lbl">{isCameraEnabled ? "Camera" : "Camera off"}</span>
        </div>
        {/* Screen Demonstration / Share button */}
        <div className="mobile-active-ctrl">
          <button
            type="button"
            className={`mobile-active-ctrl-btn${isScreenSharing ? " active" : ""}`}
            aria-label={isScreenSharing ? "Stop sharing screen" : "Share screen"}
            onClick={onToggleScreenShare}
          >
            <svg viewBox="0 0 24 24">
              {isScreenSharing ? (
                <>
                  <path d="M13.414 12l3.293 3.293-1.414 1.414L12 13.414l-3.293 3.293-1.414-1.414L10.586 12 7.293 8.707l1.414-1.414L12 10.586l3.293-3.293 1.414 1.414L13.414 12z" />
                  <path d="M21 3H3a2 2 0 00-2 2v10a2 2 0 002 2h7v2H8v2h8v-2h-2v-2h7a2 2 0 002-2V5a2 2 0 00-2-2zm0 12H3V5h18v10z" />
                </>
              ) : (
                <>
                  <path d="M21 3H3a2 2 0 00-2 2v10a2 2 0 002 2h7v2H8v2h8v-2h-2v-2h7a2 2 0 002-2V5a2 2 0 00-2-2zm0 12H3V5h18v10z" />
                  <path d="M12 7v4M10 9h4" />
                </>
              )}
            </svg>
          </button>
          <span className="mobile-active-ctrl-lbl">
            {isScreenSharing ? "Stop share" : "Share"}
          </span>
        </div>
        {/* Flip camera — only during video */}
        {/* End */}
        <div className="mobile-active-ctrl">
          <button type="button" className="mobile-active-ctrl-btn end" aria-label="End call" onClick={onEnd}>
            <svg viewBox="0 0 24 24" style={{ transform: "rotate(135deg)" }}><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
          </button>
          <span className="mobile-active-ctrl-lbl">End</span>
        </div>
      </div>
    </div>
  );
}
