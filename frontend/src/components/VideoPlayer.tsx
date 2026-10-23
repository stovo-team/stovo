import {
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { useStrings } from "../i18n/LanguageContext";

import { type FamilyFile } from "../api/files";
import { peekCachedObjectUrl } from "../mediaBlobCache";
import { shouldAutoDownloadMedia } from "../mediaDownloadPolicy";
import {
  sameVideoIdentity,
  videoPlaybackSession,
  type VideoIdentity,
  type VideoPlaybackRegistration,
} from "../videoPlaybackSession";
import { useVideoSource } from "./video-player/useVideoSource";
import { storagePreviewVideoStyle } from "./video-player/storagePreviewStyle";

export interface VideoPlayerProps {
  file: FamilyFile;
  accessToken: string;
  identity: VideoIdentity;
  disabledReason?: string;
  beforePlay?: () => void | Promise<void>; fullViewRequest?: number;
  previewExpanded?: boolean;
  /** Telegram-style muted inline autoplay. Defaults to true. */
  autoplay?: boolean;
}

function isFiniteTime(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function formatVideoTime(seconds: number): string {
  const wholeSeconds = isFiniteTime(seconds) ? Math.floor(seconds) : 0;
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = wholeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function stopPropagation(event: SyntheticEvent): void {
  event.stopPropagation();
}

const focusableSelector = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';

export function orientationStyle(width: number, height: number): CSSProperties {
  if (!(width > 0 && height > 0)) {
    return {
      aspectRatio: "16 / 9",
      width: "100%",
      maxWidth: "100%",
      height: "auto",
      maxHeight: "none",
    };
  }
  const isPortrait = height > width;
  // Portrait fills its bubble (CSS narrows portrait-only bubbles). Height comes from
  // aspect-ratio — never share landscape's height budget (that squashes verticals).
  if (isPortrait) {
    return {
      aspectRatio: `${width} / ${height}`,
      width: "100%",
      maxWidth: "100%",
      height: "auto",
      maxHeight: "none",
      ["--video-aspect-ratio" as string]: `${width} / ${height}`,
    };
  }
  return {
    aspectRatio: `${width} / ${height}`,
    width: "100%",
    maxWidth: "100%",
    height: "auto",
    maxHeight: "min(68dvh, 700px)",
    ["--video-aspect-ratio" as string]: `${width} / ${height}`,
  };
}

export function VideoPlayer({
  file,
  accessToken,
  identity,
  disabledReason,
  beforePlay, fullViewRequest = 0, autoplay = true, previewExpanded,
}: VideoPlayerProps) {
  const strings = useStrings();
  const copy = strings.videoPlayer;
  const rootRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const registrationRef = useRef<VideoPlaybackRegistration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [manualDownloadRequested, setManualDownloadRequested] = useState(false);
  const autoplayEnabled = autoplay;
  const canLoadAutomatically = shouldAutoDownloadMedia(file) || Boolean(peekCachedObjectUrl(file.id));
  const canLoad = canLoadAutomatically || manualDownloadRequested;

  const getOwnSnapshot = useCallback(
    () => videoPlaybackSession.getSnapshot(identity),
    [identity.chatId, identity.fileId, identity.messageId],
  );
  const ownSnapshot = useSyncExternalStore(
    videoPlaybackSession.subscribe.bind(videoPlaybackSession),
    getOwnSnapshot,
    getOwnSnapshot,
  );
  const activeSnapshot = useSyncExternalStore(
    videoPlaybackSession.subscribe.bind(videoPlaybackSession),
    videoPlaybackSession.getSnapshot.bind(videoPlaybackSession),
    () => null,
  );
  const isSessionActive = sameVideoIdentity(activeSnapshot?.identity, identity);
  const isPlaying = ownSnapshot?.status === "playing" || Boolean(ownSnapshot?.playIntent);
  const currentTime = ownSnapshot?.currentTime ?? 0;
  const duration = ownSnapshot?.duration ?? 0;
  const muted = ownSnapshot?.muted ?? autoplayEnabled;
  const error = localError ?? ownSnapshot?.error ?? null;

  const updateSession = useCallback(
    (update: Parameters<typeof videoPlaybackSession.update>[1]) => {
      const registration = registrationRef.current;
      return registration ? videoPlaybackSession.update(registration, update) : false;
    },
    [],
  );

  const reportFailure = useCallback((message: string, terminal = true) => {
    setIsLoading(false);
    setLocalError(message);
    if (terminal) {
      updateSession({ status: "error", playIntent: false, error: message });
    }
  }, [updateSession]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    const registration = videoPlaybackSession.attach(identity, element);
    registrationRef.current = registration;
    setLocalError(registration.snapshot.error);
    // Prefer muted for Telegram-style inline autoplay.
    if (autoplayEnabled) {
      videoPlaybackSession.performAction(registration, { type: "mute", muted: true });
    }
    return () => {
      videoPlaybackSession.detach(registration);
      if (registrationRef.current?.token === registration.token) registrationRef.current = null;
    };
  }, [autoplayEnabled, identity.chatId, identity.fileId, identity.messageId]);

  const startLoading = useCallback(() => {
    setLocalError(null);
    setIsLoading(true);
    setVideoSize({ width: 0, height: 0 });
    updateSession({ status: "loading", error: null });
  }, [updateSession]);
  const sourceUrl = useVideoSource(file, accessToken, identity, startLoading, reportFailure, canLoad);
  useEffect(() => {
    if (fullViewRequest > 0) setIsExpanded(true);
    if (!isExpanded) return;
    const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, [fullViewRequest, isExpanded]);

  useEffect(() => {
    const dialog = rootRef.current;
    if (!dialog) return;
    if (isExpanded && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        setIsExpanded(false);
      }
    } else if (!isExpanded && dialog.open) dialog.close();
  }, [isExpanded]);

  useEffect(() => {
    if (!isExpanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsExpanded(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isExpanded]);

  useEffect(() => {
    if (!disabledReason) return;
    const element = videoRef.current;
    if (element) {
      try {
        element.pause();
      } catch {
        // A detached media element may reject an imperative pause.
      }
    }
    const registration = registrationRef.current;
    if (registration) {
      videoPlaybackSession.performAction(registration, { type: "pause" });
    }
  }, [disabledReason]);

  const play = useCallback(async (opts?: { unmuted?: boolean; silent?: boolean }) => {
    const registration = registrationRef.current;
    const element = videoRef.current;
    if (!registration || !element || disabledReason || !sourceUrl) return;
    setLocalError(null);
    try {
      await beforePlay?.();
    } catch {
      if (!opts?.silent) reportFailure("Playback could not start");
      return;
    }
    if (opts?.unmuted) {
      videoPlaybackSession.performAction(registration, { type: "mute", muted: false });
    } else if (opts?.silent || autoplayEnabled) {
      // Browsers only allow inline autoplay when muted.
      videoPlaybackSession.performAction(registration, { type: "mute", muted: true });
      element.muted = true;
    }
    if (!videoPlaybackSession.performAction(registration, { type: "play" })) return;
    try {
      await element.play();
    } catch {
      if (!opts?.silent) reportFailure("Playback could not start");
      else updateSession({ status: "ready", playIntent: false });
    }
  }, [autoplayEnabled, beforePlay, disabledReason, reportFailure, sourceUrl, updateSession]);

  const pause = useCallback(() => {
    const registration = registrationRef.current;
    if (registration) videoPlaybackSession.performAction(registration, { type: "pause" });
  }, []);

  const playRef = useRef(play);
  const pauseRef = useRef(pause);
  playRef.current = play;
  pauseRef.current = pause;

  const handleMetadata = useCallback((element: HTMLVideoElement) => {
    const registration = registrationRef.current;
    if (!registration) return;
    const width = element.videoWidth || 0;
    const height = element.videoHeight || 0;
    if (width > 0 && height > 0) {
      setVideoSize({ width, height });
    }
    const snapshot = videoPlaybackSession.getSnapshot(identity);
    if (snapshot) {
      try {
        element.currentTime = snapshot.duration > 0
          ? Math.min(snapshot.currentTime, element.duration)
          : snapshot.currentTime;
      } catch {
        // The decoder may not expose a seekable range yet.
      }
      element.muted = snapshot.muted;
    } else if (autoplayEnabled) {
      element.muted = true;
    }
    updateSession({
      duration: element.duration,
      currentTime: element.currentTime,
      muted: element.muted,
      status: "ready",
      error: null,
    });
    setIsLoading(false);
    setLocalError(null);
    if (snapshot?.playIntent && !disabledReason) {
      void play({ silent: autoplayEnabled });
    }
  }, [autoplayEnabled, disabledReason, identity, play, updateSession]);

  // Telegram-style: muted inline autoplay only while the tile is on screen.
  useEffect(() => {
    if (!autoplayEnabled || disabledReason || !sourceUrl) return;
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") {
      void playRef.current({ silent: true });
      return;
    }

    let visible = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const nextVisible = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.35);
        if (nextVisible === visible) return;
        visible = nextVisible;
        if (nextVisible) void playRef.current({ silent: true });
        else pauseRef.current();
      },
      { threshold: [0, 0.35, 0.6, 1] },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [autoplayEnabled, disabledReason, sourceUrl]);

  const frameStyle = isExpanded ? expandedVideoStyle(videoSize.width, videoSize.height, viewport.width, viewport.height)
    : previewExpanded === undefined ? orientationStyle(videoSize.width, videoSize.height) : storagePreviewVideoStyle(videoSize.width, videoSize.height, window.innerWidth, window.innerHeight, previewExpanded);
  const videoNode = (
    <video
      ref={videoRef}
      src={sourceUrl ?? undefined}
      preload="metadata"
      playsInline
      controls={false}
      muted={muted}
      loop={autoplayEnabled}
      onLoadStart={() => {
        setIsLoading(true);
        updateSession({ status: "loading" });
      }}
      onLoadedMetadata={(event) => handleMetadata(event.currentTarget)}
      onDurationChange={(event) => updateSession({ duration: event.currentTarget.duration })}
      onTimeUpdate={(event) => updateSession({ currentTime: event.currentTarget.currentTime })}
      onWaiting={() => updateSession({ status: "waiting", playIntent: true })}
      onPlaying={() => {
        setIsLoading(false);
        setLocalError(null);
        updateSession({ status: "playing", playIntent: true, error: null });
      }}
      onPause={() => updateSession({ status: "paused", playIntent: false })}
      onEnded={() => updateSession({ status: "ended", playIntent: false })}
      onError={() => reportFailure("Video could not be decoded")}
    />
  );

  return (
    <>
      {isExpanded && createPortal(
        <div
          className="video-player-viewer-backdrop"
          role="presentation"
          onClick={() => setIsExpanded(false)}
        />,
        document.body,
      )}
      <dialog
        ref={rootRef}
        className={`video-player${isExpanded ? " is-expanded" : ""}${isSessionActive ? " is-session-active" : ""}${videoSize.height > videoSize.width ? " is-portrait" : " is-landscape"}`}
        role={isExpanded ? "dialog" : "presentation"}
        aria-modal={isExpanded ? "true" : undefined}
        aria-label={isExpanded ? "Video viewer" : undefined}
        data-session-active={isSessionActive ? "true" : "false"}
        data-video-chat-id={identity.chatId}
        data-video-message-id={identity.messageId}
        data-video-file-id={identity.fileId}
        style={frameStyle}
        onClick={stopPropagation}
        onPointerDown={stopPropagation}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = rootRef.current?.querySelectorAll<HTMLElement>(focusableSelector);
          const first = controls?.[0];
          const last = controls?.[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onCancel={(event) => {
          event.preventDefault();
          setIsExpanded(false);
        }}
      >
        {videoNode}

        {!canLoad && !disabledReason && (
          <button type="button" className="video-player-status" onClick={() => setManualDownloadRequested(true)}>{strings.sharedUi.downloadVideo}</button>
        )}
        {canLoad && isLoading && !error && !disabledReason && (
          <div className="video-player-status" role="status" aria-live="polite">{copy.loading}</div>
        )}
        {disabledReason && (
          <div className="video-player-status" role="status">{disabledReason}</div>
        )}
        {error && <div className="video-player-error" role="alert">{error}</div>}

        <div
          className="video-player-controls"
          aria-label={copy.controls}
          onClick={stopPropagation}
          onPointerDown={stopPropagation}
        >
            <button
              type="button"
              data-control="play-pause"
              aria-label={isPlaying ? copy.pause : copy.play}
              title={isPlaying ? copy.pause : copy.play}
              disabled={Boolean(disabledReason) || !sourceUrl}
              onClick={() => { if (isPlaying) pause(); else void play({ unmuted: true }); }}
            >
              {isPlaying
                ? <Pause size={20} aria-hidden="true" />
                : <Play size={20} aria-hidden="true" />}
            </button>
            <input
              type="range"
              data-control="seek"
              aria-label={copy.seek}
              min={0}
              max={duration > 0 ? duration : 0}
              step="any"
              value={Math.min(currentTime, duration > 0 ? duration : currentTime)}
              disabled={duration <= 0 || Boolean(disabledReason)}
              onChange={(event) => {
                const registration = registrationRef.current;
                if (registration) {
                  videoPlaybackSession.performAction(registration, {
                    type: "seek",
                    currentTime: Number(event.currentTarget.value),
                  });
                }
              }}
            />
            <output data-control="time" aria-label={copy.time}>
              {formatVideoTime(currentTime)} / {formatVideoTime(duration)}
            </output>
            <button
              type="button"
              data-control="mute"
              aria-label={muted ? "Unmute video" : "Mute video"}
              title={muted ? "Unmute video" : "Mute video"}
              disabled={Boolean(disabledReason)}
              onClick={() => {
                const registration = registrationRef.current;
                if (registration) {
                  videoPlaybackSession.performAction(registration, { type: "mute", muted: !muted });
                }
              }}
            >
              {muted
                ? <VolumeX size={20} aria-hidden="true" />
                : <Volume2 size={20} aria-hidden="true" />}
            </button>
            <button
              type="button"
              data-control="fullscreen"
              aria-label={isExpanded ? "Close video viewer" : "Open video viewer"}
              title={isExpanded ? "Close video viewer" : "Open video viewer"}
              onClick={() => {
                if (!isExpanded) {
                  setViewport({ width: window.innerWidth, height: window.innerHeight });
                }
                setIsExpanded((expanded) => !expanded);
              }}
            >
              {isExpanded
                ? <Minimize2 size={20} aria-hidden="true" />
                : <Maximize2 size={20} aria-hidden="true" />}
            </button>
        </div>
      </dialog>
    </>
  );
}

export function expandedVideoStyle(
  videoWidth: number,
  videoHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): CSSProperties {
  const padding = 24;
  const ratio = videoWidth > 0 && videoHeight > 0 ? videoWidth / videoHeight : 16 / 9;
  const availableWidth = Math.min(
    Math.max(0, viewportWidth - padding * 2),
    viewportWidth * 0.88,
  );
  const availableHeight = Math.min(
    Math.max(0, viewportHeight - padding * 2),
    viewportHeight * 0.82,
  );
  const width = Math.min(availableWidth, availableHeight * ratio);

  return {
    aspectRatio: `${videoWidth || 16} / ${videoHeight || 9}`,
    height: `${width / ratio}px`,
    width: `${width}px`,
  };
}
