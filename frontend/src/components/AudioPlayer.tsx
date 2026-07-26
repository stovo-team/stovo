import {
  AlertCircle,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
  type SyntheticEvent,
} from "react";

import {
  audioPlaybackSession,
  sameAudioIdentity,
  type AudioDescriptor,
  type AudioPlaybackErrorCode,
  type AudioPlaybackSession,
  type AudioPlaybackSnapshot,
  type AudioSourceFactory,
} from "../audioPlaybackSession";

export interface AudioPlayerProps {
  descriptor: AudioDescriptor;
  /** The capability belongs to the session owner; this view never retains it. */
  sourceFactory: AudioSourceFactory;
  disabledReason?: string;
  onBeforePlay?: () => void | Promise<void>;
  session?: AudioPlaybackSession;
}

function isFiniteTime(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function wholeTime(value: number): number {
  return isFiniteTime(value) ? Math.floor(value) : 0;
}

export function formatAudioTime(seconds: number): string {
  if (!isFiniteTime(seconds)) return "–:––";
  const wholeSeconds = wholeTime(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = wholeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatAudioTimeWords(seconds: number): string {
  const wholeSeconds = wholeTime(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = wholeSeconds % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  if (remainder || parts.length === 0) {
    parts.push(`${remainder} ${remainder === 1 ? "second" : "seconds"}`);
  }
  return parts.join(" ");
}

function clamp(value: number, duration: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), duration > 0 ? duration : 0);
}

function errorCopy(error: AudioPlaybackErrorCode | null): string {
  if (error === "unsupported") return "This audio format isn’t supported on this device.";
  if (error === "authorization") return "This audio message is no longer available.";
  if (error === "network") {
    return "Audio couldn’t load. Check your connection and try again.";
  }
  return "Audio couldn’t be played. Try again.";
}

function canRetry(error: AudioPlaybackErrorCode | null): boolean {
  return error !== "authorization" && error !== "unsupported";
}

function stopInteraction(event: SyntheticEvent): void {
  event.stopPropagation();
}

function stopActivationPropagation(event: KeyboardEvent<HTMLElement>): void {
  if (event.key === "Enter" || event.key === " ") event.stopPropagation();
}

function initialSnapshotFor(
  session: AudioPlaybackSession,
  descriptor: AudioDescriptor,
): AudioPlaybackSnapshot | null {
  const snapshot = session.getSnapshot();
  return sameAudioIdentity(snapshot.identity, descriptor.identity) ? snapshot : null;
}

export function AudioPlayer({
  descriptor,
  sourceFactory,
  disabledReason,
  onBeforePlay,
  session = audioPlaybackSession,
}: AudioPlayerProps) {
  const getOwnSnapshot = useCallback(
    () => initialSnapshotFor(session, descriptor),
    [descriptor.identity.chatId, descriptor.identity.fileId, descriptor.identity.messageId, session],
  );
  const snapshot = useSyncExternalStore(
    session.subscribe.bind(session),
    getOwnSnapshot,
    getOwnSnapshot,
  );
  const dragRevision = useRef<number | null>(null);
  const [previewPosition, setPreviewPosition] = useState<number | null>(null);

  useEffect(() => {
    if (previewPosition !== null && dragRevision.current !== snapshot?.revision) {
      setPreviewPosition(null);
      dragRevision.current = null;
    }
  }, [previewPosition, snapshot?.revision]);

  const isActive = snapshot !== null;
  const duration = isFiniteTime(snapshot?.duration ?? 0) ? snapshot?.duration ?? 0 : 0;
  const canonicalPosition = clamp(snapshot?.position ?? 0, duration);
  const position = previewPosition === null ? canonicalPosition : clamp(previewPosition, duration);
  const seekable = Boolean(snapshot?.canSeek && duration > 0);
  const isLoading = snapshot?.status === "loading";
  const isBuffering = snapshot?.status === "buffering";
  const isEnded = snapshot?.status === "ended";
  const isPauseAction = snapshot?.status === "playing" || isBuffering;
  const isCallDisabled = Boolean(disabledReason);
  const primaryLabel = isPauseAction
    ? "Pause audio"
    : isEnded
      ? "Replay audio"
      : "Play audio";
  const playbackDisabled = isCallDisabled || isLoading;
  const recoverableError = snapshot?.status === "error" && canRetry(snapshot.error);
  const statusCopy = isCallDisabled
    ? "Audio is paused while a call is active."
    : isLoading
      ? "Loading audio…"
      : isBuffering
        ? "Buffering…"
        : snapshot?.status === "suppressed" && snapshot.suppressionReason === "focus"
          ? "Playback paused by another app."
          : null;

  const beginPlayback = useCallback(async () => {
    if (playbackDisabled) return;
    try {
      await onBeforePlay?.();
      session.setSourceFactory(sourceFactory);
      const activeSnapshot = session.getSnapshot();
      const sameTrack = sameAudioIdentity(activeSnapshot.identity, descriptor.identity);
      const needsReload =
        !sameTrack ||
        activeSnapshot.status === "error" ||
        activeSnapshot.status === "idle" ||
        activeSnapshot.status === "authorization-required";
      if (needsReload) {
        const resumeAt =
          sameTrack &&
          (activeSnapshot.status === "error" ||
            activeSnapshot.status === "authorization-required")
            ? activeSnapshot.position
            : 0;
        await session.load(descriptor, resumeAt);
      } else if (activeSnapshot.status === "ended") {
        await session.seek(0);
      }
      await session.play();
    } catch {
      // The canonical session maps backend failures to its closed error vocabulary.
    }
  }, [descriptor, onBeforePlay, playbackDisabled, session, sourceFactory]);

  const togglePlayback = useCallback(() => {
    if (isPauseAction) return void session.pause();
    return void beginPlayback();
  }, [beginPlayback, isPauseAction, session]);

  const retry = useCallback(async () => {
    if (!recoverableError || isCallDisabled) return;
    try {
      await onBeforePlay?.();
      session.setSourceFactory(sourceFactory);
      await session.retry();
      await session.play();
    } catch {
      // Keep error presentation safe and generic.
    }
  }, [isCallDisabled, onBeforePlay, recoverableError, session, sourceFactory]);

  const commitSeek = useCallback((value: number) => {
    setPreviewPosition(null);
    dragRevision.current = null;
    if (seekable) void session.seek(clamp(value, duration));
  }, [duration, seekable, session]);

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <article
      className={`message-audio-attachment audio-player audio-player--compact${isActive ? " is-session-active" : ""}`}
      data-audio-chat-id={descriptor.identity.chatId}
      data-audio-message-id={descriptor.identity.messageId}
      data-audio-file-id={descriptor.identity.fileId}
      data-session-active={isActive ? "true" : "false"}
      onClick={stopInteraction}
      onPointerDown={stopInteraction}
      onContextMenu={stopInteraction}
      onKeyDown={stopActivationPropagation}
    >
      <button
        type="button"
        data-control="play-pause"
        className="audio-player-play-pause"
        aria-label={primaryLabel}
        title={primaryLabel}
        disabled={playbackDisabled}
        onClick={togglePlayback}
      >
        {isPauseAction ? (
          <Pause size={18} aria-hidden="true" />
        ) : isEnded ? (
          <RotateCcw size={18} aria-hidden="true" />
        ) : (
          <Play size={18} aria-hidden="true" />
        )}
      </button>
      <div className="audio-player-body">
        <div className="audio-player-wave" aria-hidden="true">
          <span className="audio-player-wave-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="audio-player-meta-row">
          <output data-control="time" className="audio-player-time" aria-label="Audio time">
            {isActive ? formatAudioTime(position) : formatAudioTime(duration || 0)}
            {isActive && duration > 0 ? ` / ${formatAudioTime(duration)}` : ""}
          </output>
          <span className="audio-player-title" title={descriptor.title}>
            {descriptor.title}
          </span>
        </div>
        <input
          type="range"
          data-control="seek"
          className="audio-player-seek"
          aria-label="Seek audio"
          aria-valuetext={`${formatAudioTimeWords(position)} elapsed of ${formatAudioTimeWords(duration)}`}
          min={0}
          max={duration || 1}
          step={1}
          value={position}
          disabled={!seekable || isCallDisabled}
          onPointerDown={(event: PointerEvent<HTMLInputElement>) => {
            stopInteraction(event);
            dragRevision.current = snapshot?.revision ?? null;
          }}
          onPointerUp={(event: PointerEvent<HTMLInputElement>) => {
            stopInteraction(event);
            commitSeek(Number(event.currentTarget.value));
          }}
          onInput={(event) => {
            setPreviewPosition(clamp(Number(event.currentTarget.value), duration));
          }}
          onChange={(event) => {
            if (dragRevision.current === null) commitSeek(Number(event.currentTarget.value));
          }}
        />
      </div>
      {statusCopy && <div className="audio-player-status" role="status">{statusCopy}</div>}
      {snapshot?.status === "error" && (
        <div className="audio-player-error" role="alert">
          <AlertCircle size={14} aria-hidden="true" />
          {errorCopy(snapshot.error)}
          {recoverableError && (
            <button
              type="button"
              className="audio-player-retry"
              aria-label="Retry audio"
              title="Retry audio"
              disabled={isCallDisabled}
              onClick={() => void retry()}
            >
              Retry
            </button>
          )}
        </div>
      )}
    </article>
  );
}
