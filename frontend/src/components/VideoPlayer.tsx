import {
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
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

import { downloadFileBlob, type FamilyFile, createStreamingMediaUrl } from "../api/files";
import { peekCachedObjectUrl } from "../mediaBlobCache";
import {
  sameVideoIdentity,
  videoPlaybackSession,
  type VideoIdentity,
  type VideoPlaybackRegistration,
} from "../videoPlaybackSession";

export interface VideoPlayerProps {
  file: FamilyFile;
  accessToken: string;
  identity: VideoIdentity;
  disabledReason?: string;
  beforePlay?: () => void | Promise<void>;
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

function validVideoSource(
  file: FamilyFile,
  accessToken: string,
  identity: VideoIdentity,
): "source" | "format" | null {
  if (
    !file.id?.trim() ||
    !identity.chatId?.trim() ||
    !identity.messageId?.trim() ||
    !identity.fileId?.trim() ||
    identity.fileId !== file.id
  ) {
    return "source";
  }
  if (!accessToken.trim() && !peekCachedObjectUrl(file.id)) {
    return "source";
  }
  return /^video\/[^\s/]+$/i.test(file.mimeType.trim()) ? null : "format";
}

function stopPropagation(event: SyntheticEvent): void {
  event.stopPropagation();
}

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
    maxHeight: "min(56vh, 420px)",
    ["--video-aspect-ratio" as string]: `${width} / ${height}`,
  };
}

export function VideoPlayer({
  file,
  accessToken,
  identity,
  disabledReason,
  beforePlay,
  autoplay = true,
}: VideoPlayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const expandedVideoRef = useRef<HTMLVideoElement>(null);
  const isExpandingRef = useRef(false);
  const registrationRef = useRef<VideoPlaybackRegistration | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const autoplayEnabled = autoplay;

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
  const remaining = Math.max(0, duration - currentTime);

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

  useEffect(() => {
    let cancelled = false;
    setSourceUrl(null);
    setLocalError(null);
    setIsLoading(true);
    setVideoSize({ width: 0, height: 0 });

    const invalid = validVideoSource(file, accessToken, identity);
    if (invalid) {
      reportFailure(
        invalid === "format" ? "Unsupported video format" : "Video source is unavailable",
      );
      return () => { cancelled = true; };
    }

    updateSession({ status: "loading", error: null });

    const cached = peekCachedObjectUrl(file.id);
    if (cached) {
      setSourceUrl(cached);
      return () => {
        cancelled = true;
      };
    }

    void createStreamingMediaUrl(accessToken, file.id)
      .then((url) => {
        if (cancelled) return;
        setSourceUrl(url);
        void downloadFileBlob(accessToken, file.id).catch(() => undefined);
      })
      .catch(() => {
        if (cancelled) return;
        void downloadFileBlob(accessToken, file.id)
          .then((blob) => {
            if (cancelled) return;
            if (blob.size === 0) {
              reportFailure("Video source is empty");
              return;
            }
            const url = peekCachedObjectUrl(file.id);
            if (!url) {
              reportFailure("Video source is unavailable");
              return;
            }
            setSourceUrl(url);
          })
          .catch(() => {
            if (!cancelled) reportFailure("Video download failed");
          });
      });

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    file.id,
    file.mimeType,
    identity.chatId,
    identity.fileId,
    identity.messageId,
    reportFailure,
    updateSession,
  ]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === rootRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

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
    if (snapshot?.playIntent && !disabledReason && !expanded && !isExpandingRef.current) {
      void play({ silent: autoplayEnabled });
    }
  }, [autoplayEnabled, disabledReason, expanded, identity, play, updateSession]);

  // Only the lightbox video may output audio — keep the inline tile paused while expanded.
  useEffect(() => {
    if (!expanded) return;
    const inline = videoRef.current;
    if (!inline) return;
    try {
      inline.pause();
    } catch {
      // A detached media element may reject an imperative pause.
    }
    inline.muted = true;
  }, [expanded, isPlaying]);

  // Telegram-style: muted inline autoplay only while the tile is on screen.
  useEffect(() => {
    if (!autoplayEnabled || disabledReason || expanded || !sourceUrl) return;
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
        if (nextVisible && !isExpandingRef.current) void playRef.current({ silent: true });
        else pauseRef.current();
      },
      { threshold: [0, 0.35, 0.6, 1] },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [autoplayEnabled, disabledReason, expanded, sourceUrl]);

  const openExpanded = useCallback(() => {
    isExpandingRef.current = true;
    const inline = videoRef.current;
    const registration = registrationRef.current;
    if (inline) {
      try {
        inline.pause();
      } catch {
        // A detached media element may reject an imperative pause.
      }
      inline.muted = true;
    }
    if (registration) {
      videoPlaybackSession.performAction(registration, { type: "pause" });
      videoPlaybackSession.update(registration, {
        muted: false,
        playIntent: true,
        status: "ready",
        error: null,
      });
    }
    setExpanded(true);
  }, []);

  const closeExpanded = useCallback(() => {
    const expanded = expandedVideoRef.current;
    if (expanded) {
      try {
        expanded.pause();
      } catch {
        // A detached media element may reject an imperative pause.
      }
    }
    isExpandingRef.current = false;
    setExpanded(false);
    const registration = registrationRef.current;
    const inline = videoRef.current;
    if (registration) {
      videoPlaybackSession.performAction(registration, { type: "pause" });
      if (autoplayEnabled) {
        videoPlaybackSession.performAction(registration, { type: "mute", muted: true });
      }
    }
    if (inline && autoplayEnabled) {
      inline.muted = true;
    }
  }, [autoplayEnabled]);

  const toggleFullscreen = useCallback(async () => {
    const root = rootRef.current;
    if (!root) return;
    try {
      if (document.fullscreenElement === root) {
        await document.exitFullscreen();
      } else if (typeof root.requestFullscreen === "function") {
        await root.requestFullscreen();
      } else {
        reportFailure("Fullscreen is unavailable", false);
      }
    } catch {
      reportFailure("Fullscreen request was denied", false);
    }
  }, [reportFailure]);

  const frameStyle = orientationStyle(videoSize.width, videoSize.height);
  const compact = autoplayEnabled && !expanded;

  const videoNode = (
    <video
      ref={videoRef}
      src={sourceUrl ?? undefined}
      preload="metadata"
      playsInline
      controls={false}
      muted={expanded || muted}
      loop={compact && autoplayEnabled}
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
      <div
        ref={rootRef}
        className={`video-player${isSessionActive ? " is-session-active" : ""}${compact ? " is-compact" : ""}${videoSize.height > videoSize.width ? " is-portrait" : " is-landscape"}`}
        data-session-active={isSessionActive ? "true" : "false"}
        data-video-chat-id={identity.chatId}
        data-video-message-id={identity.messageId}
        data-video-file-id={identity.fileId}
        style={frameStyle}
        onClick={(event) => {
          stopPropagation(event);
          if (compact && sourceUrl && !disabledReason && !error) openExpanded();
        }}
        onPointerDown={stopPropagation}
      >
        {videoNode}

        {isLoading && !error && !disabledReason && (
          <div className="video-player-status" role="status" aria-live="polite">Loading video…</div>
        )}
        {disabledReason && (
          <div className="video-player-status" role="status">{disabledReason}</div>
        )}
        {error && <div className="video-player-error" role="alert">{error}</div>}

        {compact ? (
          <div className="video-player-compact-chrome" aria-hidden={Boolean(error || disabledReason)}>
            {!isPlaying && !isLoading && !error && (
              <button
                type="button"
                className="video-player-play-overlay"
                aria-label="Play video"
                title="Play video"
                disabled={Boolean(disabledReason) || !sourceUrl}
                onClick={(event) => {
                  stopPropagation(event);
                  openExpanded();
                }}
              >
                <Play size={28} aria-hidden="true" />
              </button>
            )}
            <output className="video-player-compact-time" aria-label="Video time">
              {duration > 0 ? formatVideoTime(remaining || duration) : formatVideoTime(0)}
            </output>
          </div>
        ) : (
          <div
            className="video-player-controls"
            aria-label="Video controls"
            onClick={stopPropagation}
            onPointerDown={stopPropagation}
          >
            <button
              type="button"
              data-control="play-pause"
              aria-label={isPlaying ? "Pause video" : "Play video"}
              title={isPlaying ? "Pause video" : "Play video"}
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
              aria-label="Seek video"
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
            <output data-control="time" aria-label="Video time">
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
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              onClick={() => void toggleFullscreen()}
            >
              {isFullscreen
                ? <Minimize2 size={20} aria-hidden="true" />
                : <Maximize2 size={20} aria-hidden="true" />}
            </button>
          </div>
        )}
      </div>

      {expanded && typeof document !== "undefined"
        ? createPortal(
          <div
            className="video-player-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Video player"
            onClick={closeExpanded}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeExpanded();
            }}
          >
            <div
              className={`video-player video-player-expanded${videoSize.height > videoSize.width ? " is-portrait" : " is-landscape"}`}
              style={orientationStyle(videoSize.width, videoSize.height)}
              onClick={stopPropagation}
            >
              <video
                ref={expandedVideoRef}
                className="video-player-media"
                src={sourceUrl ?? undefined}
                preload="auto"
                playsInline
                controls={false}
                muted={false}
                onLoadedMetadata={(event) => {
                  const el = event.currentTarget;
                  try {
                    el.currentTime = currentTime;
                  } catch {
                    // Seek may fail before ranges are ready.
                  }
                  el.muted = false;
                  void el.play().catch(() => undefined);
                }}
                onTimeUpdate={(event) => {
                  const registration = registrationRef.current;
                  if (registration) {
                    videoPlaybackSession.performAction(registration, {
                      type: "seek",
                      currentTime: event.currentTarget.currentTime,
                    });
                  }
                }}
                onPlaying={() => {
                  setIsLoading(false);
                  setLocalError(null);
                  updateSession({ status: "playing", playIntent: true, error: null });
                }}
                onPause={() => updateSession({ status: "paused", playIntent: false })}
              />
              <button
                type="button"
                className="video-player-lightbox-close"
                aria-label="Close video"
                title="Close video"
                onClick={closeExpanded}
              >
                <X size={20} aria-hidden="true" />
              </button>
              <div className="video-player-controls" aria-label="Video controls">
                <button
                  type="button"
                  data-control="play-pause"
                  aria-label={isPlaying ? "Pause video" : "Play video"}
                  onClick={() => {
                    const el = expandedVideoRef.current;
                    if (!el) return;
                    if (el.paused) void el.play();
                    else el.pause();
                  }}
                >
                  {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <input
                  type="range"
                  data-control="seek"
                  aria-label="Seek video"
                  min={0}
                  max={duration > 0 ? duration : 0}
                  step="any"
                  value={Math.min(currentTime, duration > 0 ? duration : currentTime)}
                  onChange={(event) => {
                    const next = Number(event.currentTarget.value);
                    const el = expandedVideoRef.current;
                    if (el) el.currentTime = next;
                    const registration = registrationRef.current;
                    if (registration) {
                      videoPlaybackSession.performAction(registration, {
                        type: "seek",
                        currentTime: next,
                      });
                    }
                  }}
                />
                <output data-control="time" aria-label="Video time">
                  {formatVideoTime(currentTime)} / {formatVideoTime(duration)}
                </output>
                <button
                  type="button"
                  data-control="mute"
                  aria-label={muted ? "Unmute video" : "Mute video"}
                  onClick={() => {
                    const registration = registrationRef.current;
                    const nextMuted = !muted;
                    if (registration) {
                      videoPlaybackSession.performAction(registration, {
                        type: "mute",
                        muted: nextMuted,
                      });
                    }
                    if (expandedVideoRef.current) {
                      expandedVideoRef.current.muted = nextMuted;
                    }
                  }}
                >
                  {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </>
  );
}
