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
  type SyntheticEvent,
} from "react";

import { downloadFileBlob, type FamilyFile } from "../api/files";
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
    !accessToken.trim() ||
    !file.id?.trim() ||
    !identity.chatId?.trim() ||
    !identity.messageId?.trim() ||
    !identity.fileId?.trim() ||
    identity.fileId !== file.id
  ) {
    return "source";
  }
  return /^video\/[^\s/]+$/i.test(file.mimeType.trim()) ? null : "format";
}

function stopPropagation(event: SyntheticEvent): void {
  event.stopPropagation();
}

export function VideoPlayer({
  file,
  accessToken,
  identity,
  disabledReason,
}: VideoPlayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const registrationRef = useRef<VideoPlaybackRegistration | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
  const muted = ownSnapshot?.muted ?? false;
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
    return () => {
      videoPlaybackSession.detach(registration);
      if (registrationRef.current?.token === registration.token) registrationRef.current = null;
    };
  }, [identity.chatId, identity.fileId, identity.messageId]);

  useEffect(() => {
    let cancelled = false;
    let ownedUrl: string | null = null;
    setSourceUrl(null);
    setLocalError(null);
    setIsLoading(true);

    const invalid = validVideoSource(file, accessToken, identity);
    if (invalid) {
      reportFailure(
        invalid === "format" ? "Unsupported video format" : "Video source is unavailable",
      );
      return () => { cancelled = true; };
    }

    updateSession({ status: "loading", error: null });
    void downloadFileBlob(accessToken, file.id)
      .then((blob) => {
        if (cancelled) return;
        if (blob.size === 0) {
          reportFailure("Video source is empty");
          return;
        }
        if (blob.type && !/^video\/[^\s/]+$/i.test(blob.type)) {
          reportFailure("Unsupported video format");
          return;
        }
        ownedUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(ownedUrl);
          ownedUrl = null;
          return;
        }
        setSourceUrl(ownedUrl);
      })
      .catch(() => {
        if (!cancelled) reportFailure("Video download failed");
      });

    return () => {
      cancelled = true;
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
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

  const play = useCallback(async () => {
    const registration = registrationRef.current;
    const element = videoRef.current;
    if (!registration || !element || disabledReason || !sourceUrl) return;
    setLocalError(null);
    if (!videoPlaybackSession.performAction(registration, { type: "play" })) return;
    try {
      await element.play();
    } catch {
      reportFailure("Playback could not start");
    }
  }, [disabledReason, reportFailure, sourceUrl]);

  const pause = useCallback(() => {
    const registration = registrationRef.current;
    if (registration) videoPlaybackSession.performAction(registration, { type: "pause" });
  }, []);

  const handleMetadata = useCallback(() => {
    const element = videoRef.current;
    const registration = registrationRef.current;
    if (!element || !registration) return;
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
    if (snapshot?.playIntent && !disabledReason) void play();
  }, [disabledReason, identity, play, updateSession]);

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

  return (
    <div
      ref={rootRef}
      className={`video-player${isSessionActive ? " is-session-active" : ""}`}
      data-session-active={isSessionActive ? "true" : "false"}
      data-video-chat-id={identity.chatId}
      data-video-message-id={identity.messageId}
      data-video-file-id={identity.fileId}
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
    >
      <video
        ref={videoRef}
        src={sourceUrl ?? undefined}
        preload="metadata"
        playsInline
        controls={false}
        muted={muted}
        onLoadStart={() => {
          setIsLoading(true);
          updateSession({ status: "loading" });
        }}
        onLoadedMetadata={handleMetadata}
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

      {isLoading && !error && !disabledReason && (
        <div className="video-player-status" role="status" aria-live="polite">Loading video…</div>
      )}
      {disabledReason && (
        <div className="video-player-status" role="status">{disabledReason}</div>
      )}
      {error && <div className="video-player-error" role="alert">{error}</div>}

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
          onClick={() => { if (isPlaying) pause(); else void play(); }}
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
    </div>
  );
}
