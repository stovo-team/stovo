import { AlertCircle, Pause, Play, RotateCcw, X } from "lucide-react";
import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  audioPlaybackSession,
  type AudioIdentity,
  type AudioPlaybackErrorCode,
  type AudioPlaybackSession,
} from "../audioPlaybackSession";
import { formatAudioTime } from "./AudioPlayer";

export interface AudioNowPlayingProps {
  session?: AudioPlaybackSession;
  onRestore?: (identity: AudioIdentity) => void;
  onFocusAfterClose?: () => void;
}

function isFiniteTime(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
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

export function AudioNowPlaying({
  session = audioPlaybackSession,
  onRestore,
  onFocusAfterClose,
}: AudioNowPlayingProps) {
  const snapshot = useSyncExternalStore(
    session.subscribe.bind(session),
    session.getSnapshot.bind(session),
    session.getSnapshot.bind(session),
  );
  const closing = useRef(false);
  const [closeAnnouncement, setCloseAnnouncement] = useState(false);
  const duration = isFiniteTime(snapshot.duration) ? snapshot.duration : 0;
  const position = isFiniteTime(snapshot.position) ? Math.min(snapshot.position, duration) : 0;
  const isLoading = snapshot.status === "loading";
  const isBuffering = snapshot.status === "buffering";
  const isPauseAction = snapshot.status === "playing" || isBuffering;
  const isEnded = snapshot.status === "ended";
  const primaryLabel = isPauseAction
    ? "Pause audio"
    : isEnded
      ? "Replay audio"
      : "Play audio";
  const retryable = snapshot.status === "error" && canRetry(snapshot.error);
  const status = isLoading
    ? "Loading audio…"
    : isBuffering
      ? "Buffering…"
      : snapshot.status === "playing"
        ? "Playing"
        : isEnded
          ? "Ended"
          : `${formatAudioTime(position)} / ${formatAudioTime(duration)}`;

  const play = useCallback(async () => {
    if (!snapshot.identity || isLoading) return;
    if (isPauseAction) {
      await session.pause();
      return;
    }
    if (isEnded) await session.seek(0);
    await session.play();
  }, [isEnded, isLoading, isPauseAction, session, snapshot.identity]);

  const retry = useCallback(async () => {
    if (!retryable) return;
    await session.retry();
    await session.play();
  }, [retryable, session]);

  const close = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    setCloseAnnouncement(true);
    await session.clear("close");
    onFocusAfterClose?.();
  }, [onFocusAfterClose, session]);

  if (!snapshot.identity) {
    return closeAnnouncement ? <div role="status">Audio player closed.</div> : null;
  }

  const identity = snapshot.identity;
  return (
    <section
      className="audio-now-playing"
      data-audio-chat-id={identity.chatId}
      data-audio-message-id={identity.messageId}
      data-audio-file-id={identity.fileId}
    >
      <button
        type="button"
        className="audio-now-playing-play"
        aria-label={primaryLabel}
        title={primaryLabel}
        disabled={isLoading}
        onClick={() => void play()}
      >
        {isPauseAction ? <Pause size={20} aria-hidden="true" /> : isEnded ? <RotateCcw size={20} aria-hidden="true" /> : <Play size={20} aria-hidden="true" />}
      </button>
      <button
        type="button"
        className="audio-now-playing-context"
        aria-label="Return to audio message"
        title="Return to audio message"
        onClick={() => onRestore?.({ ...identity })}
      >
        <span className="audio-now-playing-title" title={snapshot.title}>{snapshot.title}</span>
        <span className="audio-now-playing-status">{status}</span>
      </button>
      <button
        type="button"
        className="audio-now-playing-close"
        aria-label="Close audio player"
        title="Close audio player"
        onClick={() => void close()}
      >
        <X size={20} aria-hidden="true" />
      </button>
      <div
        className="audio-now-playing-progress"
        aria-hidden="true"
        style={{ "--audio-progress": duration > 0 ? `${(position / duration) * 100}%` : "0%" } as React.CSSProperties}
      />
      {isLoading && <div role="status">Loading audio…</div>}
      {snapshot.status === "error" && (
        <div role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          {errorCopy(snapshot.error)}
        </div>
      )}
      {retryable && (
        <button type="button" aria-label="Retry audio" title="Retry audio" onClick={() => void retry()}>
          Retry audio
        </button>
      )}
    </section>
  );
}
