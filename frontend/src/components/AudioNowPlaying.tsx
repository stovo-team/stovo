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
import { useStrings } from "../i18n/LanguageContext";

export interface AudioNowPlayingProps {
  session?: AudioPlaybackSession;
  onRestore?: (identity: AudioIdentity) => void;
  onFocusAfterClose?: () => void;
}

function isFiniteTime(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function errorCopy(error: AudioPlaybackErrorCode | null, copy: ReturnType<typeof useStrings>["audioPlayer"]): string {
  if (error === "unsupported") return copy.formatUnsupported;
  if (error === "authorization") return copy.noLongerAvailable;
  if (error === "network") {
    return copy.networkError;
  }
  return copy.couldNotPlayRetry;
}

function canRetry(error: AudioPlaybackErrorCode | null): boolean {
  return error !== "authorization" && error !== "unsupported";
}

export function AudioNowPlaying({
  session = audioPlaybackSession,
  onRestore,
  onFocusAfterClose,
}: AudioNowPlayingProps) {
  const copy = useStrings().audioPlayer;
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
    ? copy.pauseAudio
    : isEnded
      ? copy.replayAudio
      : copy.playAudio;
  const retryable = snapshot.status === "error" && canRetry(snapshot.error);
  const status = isLoading
    ? copy.loading
    : isBuffering
      ? copy.buffering
      : snapshot.status === "playing"
        ? copy.playing
        : isEnded
          ? copy.ended
          : `${formatAudioTime(position)} / ${formatAudioTime(duration)}`;

  const play = useCallback(async () => {
    if (!snapshot.identity || isLoading) return;
    if (isPauseAction) {
      await session.pause();
      return;
    }
    await session.play();
  }, [isLoading, isPauseAction, session, snapshot.identity]);

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
    return closeAnnouncement ? <div role="status">{copy.closeAnnouncement}</div> : null;
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
        aria-label={copy.returnToMessage}
        title={copy.returnToMessage}
        onClick={() => onRestore?.({ ...identity })}
      >
        <span className="audio-now-playing-title" title={snapshot.title}>{snapshot.title}</span>
        <span className="audio-now-playing-status">{status}</span>
      </button>
      <button
        type="button"
        className="audio-now-playing-close"
        aria-label={copy.closePlayer}
        title={copy.closePlayer}
        onClick={() => void close()}
      >
        <X size={20} aria-hidden="true" />
      </button>
      <div
        className="audio-now-playing-progress"
        aria-hidden="true"
        style={{ "--audio-progress": duration > 0 ? `${(position / duration) * 100}%` : "0%" } as React.CSSProperties}
      />
      {isLoading && <div role="status">{copy.loading}</div>}
      {snapshot.status === "error" && (
        <div role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          {errorCopy(snapshot.error, copy)}
        </div>
      )}
      {retryable && (
        <button type="button" aria-label={copy.retryAudio} title={copy.retryAudio} onClick={() => void retry()}>
          {copy.retryAudio}
        </button>
      )}
    </section>
  );
}
