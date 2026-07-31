import {
  AlertCircle,
  Pause,
  Play,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
} from "react";

import {
  getCachedAudioDuration,
  readAudioDurationFromUrl,
  setCachedAudioDuration,
} from "../audioDurationCache";
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
  /** Resolves a playable URL (typically a cached blob:) for metadata duration probe. */
  resolveDurationUrl?: () => Promise<string | null>;
  /** Recorder-generated filenames add no useful context to a voice message. */
  hideTitle?: boolean;
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

function PlayingWave({ active }: { active: boolean }) {
  return (
    <span
      className={`audio-player-eq${active ? " is-active" : ""}`}
      data-control="playing-indicator"
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

function positionFromClientX(
  clientX: number,
  element: HTMLElement,
  duration: number,
): number {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || duration <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return clamp(ratio * duration, duration);
}

export function AudioPlayer({
  descriptor,
  sourceFactory,
  disabledReason,
  onBeforePlay,
  session = audioPlaybackSession,
  resolveDurationUrl,
  hideTitle = false,
}: AudioPlayerProps) {
  const getOwnSnapshot = useCallback(
    () => initialSnapshotFor(session, descriptor),
    [descriptor.identity.chatId, descriptor.identity.fileId, descriptor.identity.messageId, session],
  );
  const subscribe = useCallback(
    (onStoreChange: () => void) => session.subscribe(onStoreChange),
    [session],
  );
  const snapshot = useSyncExternalStore(subscribe, getOwnSnapshot, getOwnSnapshot);
  const dragRevision = useRef<number | null>(null);
  const playInFlight = useRef(false);
  const waveRef = useRef<HTMLDivElement | null>(null);
  const [previewPosition, setPreviewPosition] = useState<number | null>(null);
  // Optimistic chrome so the control reacts on tap even if the native bridge
  // briefly lags (or used to drop playing snapshots entirely).
  const [playIntent, setPlayIntent] = useState(false);
  const [knownDuration, setKnownDuration] = useState(
    () => getCachedAudioDuration(descriptor.identity.fileId) ?? 0,
  );

  useEffect(() => {
    if (previewPosition !== null && dragRevision.current !== snapshot?.revision) {
      setPreviewPosition(null);
      dragRevision.current = null;
    }
  }, [previewPosition, snapshot?.revision]);

  // Finished audio returns to the same idle state as an unplayed attachment.
  // Keeping an ended native session alive exposed a replay/reset control and
  // could leave the Android service attached to a completed decoder.
  useEffect(() => {
    if (snapshot?.status !== "ended") return;
    void session.clear("reset");
  }, [session, snapshot?.revision, snapshot?.status]);

  useEffect(() => {
    const status = snapshot?.status;
    if (
      status === "playing" ||
      status === "buffering" ||
      status === "paused" ||
      status === "ended" ||
      status === "error" ||
      status === "suppressed" ||
      status === "idle" ||
      snapshot === null
    ) {
      setPlayIntent(false);
    }
  }, [snapshot, snapshot?.status]);

  useEffect(() => {
    const sessionDuration = snapshot?.duration ?? 0;
    if (isFiniteTime(sessionDuration) && sessionDuration > 0) {
      setCachedAudioDuration(descriptor.identity.fileId, sessionDuration);
      setKnownDuration(sessionDuration);
    }
  }, [descriptor.identity.fileId, snapshot?.duration]);

  useEffect(() => {
    const fileId = descriptor.identity.fileId;
    const cached = getCachedAudioDuration(fileId);
    if (cached !== null) {
      setKnownDuration(cached);
      return;
    }
    if (!resolveDurationUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        const url = await resolveDurationUrl();
        if (cancelled || !url) return;
        const probed = await readAudioDurationFromUrl(url);
        if (cancelled || probed === null) return;
        setCachedAudioDuration(fileId, probed);
        setKnownDuration(probed);
      } catch {
        // Duration probe is best-effort; playback can still reveal length later.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [descriptor.identity.fileId, resolveDurationUrl]);

  const isActive = snapshot !== null;
  const sessionDuration = isFiniteTime(snapshot?.duration ?? 0) ? snapshot?.duration ?? 0 : 0;
  const duration =
    sessionDuration > 0
      ? sessionDuration
      : isFiniteTime(knownDuration) && knownDuration > 0
        ? knownDuration
        : 0;
  const canonicalPosition = clamp(snapshot?.position ?? 0, duration);
  const position = previewPosition === null ? canonicalPosition : clamp(previewPosition, duration);
  const seekable = Boolean(snapshot?.canSeek && duration > 0);
  const isLoading = snapshot?.status === "loading" || (playIntent && snapshot?.status !== "playing" && snapshot?.status !== "buffering");
  const isBuffering = snapshot?.status === "buffering";
  const sessionPlaying =
    snapshot?.status === "playing" || snapshot?.status === "buffering";
  const isPlaying = sessionPlaying || playIntent;
  // Icon follows optimistic intent; only a live playing/buffering session pauses on tap
  // so a second tap can recover a stuck load instead of calling pause().
  const isPauseAction = isPlaying;
  const isCallDisabled = Boolean(disabledReason);
  const primaryLabel = sessionPlaying || playIntent
    ? "Pause audio"
    : "Play audio";
  // Keep the control clickable while loading so a stuck load cannot trap replay.
  // prepareCurrent still gates concurrent work; only calls disable the button.
  const playbackDisabled = isCallDisabled;
  const recoverableError = snapshot?.status === "error" && canRetry(snapshot.error);
  // Loading/buffering stay on the play button — avoid a permanent status strip.
  const statusCopy = isCallDisabled
    ? "Audio is paused while a call is active."
    : snapshot?.status === "suppressed" && snapshot.suppressionReason === "focus"
      ? "Playback paused by another app."
      : null;

  const beginPlayback = useCallback(async () => {
    if (playbackDisabled || playInFlight.current) return;
    playInFlight.current = true;
    setPlayIntent(true);
    try {
      await onBeforePlay?.();
      session.setSourceFactory(sourceFactory);
      const activeSnapshot = session.getSnapshot();
      const sameTrack = sameAudioIdentity(activeSnapshot.identity, descriptor.identity);
      // Natural end is handled inside session.play() (platform-specific reload
      // vs rewind). Reloading here too caused eternal loading after Android
      // service restart when revision watermarks rejected the new snapshots.
      // Force a fresh load when still stuck on loading so a second tap recovers.
      const needsReload =
        !sameTrack ||
        activeSnapshot.status === "error" ||
        activeSnapshot.status === "idle" ||
        activeSnapshot.status === "loading" ||
        activeSnapshot.status === "authorization-required" ||
        activeSnapshot.status === "ended";
      if (needsReload) {
        const resumeAt =
          sameTrack &&
          (activeSnapshot.status === "error" ||
            activeSnapshot.status === "authorization-required" ||
            activeSnapshot.status === "loading")
            ? activeSnapshot.position
            : 0;
        await session.load(descriptor, resumeAt);
      }
      await session.play();
    } catch {
      // The canonical session maps backend failures to its closed error vocabulary.
      setPlayIntent(false);
    } finally {
      playInFlight.current = false;
    }
  }, [descriptor, onBeforePlay, playbackDisabled, session, sourceFactory]);

  const togglePlayback = useCallback(() => {
    if (playbackDisabled) return;
    // Only pause when the session is actually playing/buffering. Optimistic
    // playIntent alone must not steal the second tap from a stuck load recovery.
    if (snapshot?.status === "playing" || snapshot?.status === "buffering") {
      setPlayIntent(false);
      return void session.pause();
    }
    return void beginPlayback();
  }, [beginPlayback, playbackDisabled, session, snapshot?.status]);

  const retry = useCallback(async () => {
    if (!recoverableError || isCallDisabled || playInFlight.current) return;
    playInFlight.current = true;
    setPlayIntent(true);
    try {
      await onBeforePlay?.();
      session.setSourceFactory(sourceFactory);
      await session.retry();
      await session.play();
    } catch {
      // Keep error presentation safe and generic.
      setPlayIntent(false);
    } finally {
      playInFlight.current = false;
    }
  }, [isCallDisabled, onBeforePlay, recoverableError, session, sourceFactory]);

  const commitSeek = useCallback((value: number) => {
    setPreviewPosition(null);
    dragRevision.current = null;
    if (seekable) void session.seek(clamp(value, duration));
  }, [duration, seekable, session]);

  const onWavePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    stopInteraction(event);
    if (!seekable || isCallDisabled) return;
    const target = event.currentTarget;
    try {
      target.setPointerCapture?.(event.pointerId);
    } catch {
      // jsdom and some browsers may not implement pointer capture.
    }
    dragRevision.current = snapshot?.revision ?? null;
    const next = positionFromClientX(event.clientX, target, duration);
    setPreviewPosition(next);
  }, [duration, isCallDisabled, seekable, snapshot?.revision]);

  const onWavePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRevision.current === null || !seekable) return;
    setPreviewPosition(positionFromClientX(event.clientX, event.currentTarget, duration));
  }, [duration, seekable]);

  const onWavePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    stopInteraction(event);
    if (dragRevision.current === null) return;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Capture may already be released.
    }
    commitSeek(positionFromClientX(event.clientX, event.currentTarget, duration));
  }, [commitSeek, duration]);

  const onWaveKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    stopActivationPropagation(event);
    if (!seekable || isCallDisabled) return;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      commitSeek(position + step);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      commitSeek(position - step);
    } else if (event.key === "Home") {
      event.preventDefault();
      commitSeek(0);
    } else if (event.key === "End") {
      event.preventDefault();
      commitSeek(duration);
    }
  }, [commitSeek, duration, isCallDisabled, position, seekable]);

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <article
      className={`message-audio-attachment audio-player audio-player--compact${isActive ? " is-session-active" : ""}${isPlaying ? " is-playing" : ""}`}
      data-audio-chat-id={descriptor.identity.chatId}
      data-audio-message-id={descriptor.identity.messageId}
      data-audio-file-id={descriptor.identity.fileId}
      data-session-active={isActive ? "true" : "false"}
      data-playing={isPlaying ? "true" : "false"}
      onClick={stopInteraction}
      onPointerDown={stopInteraction}
      onKeyDown={stopActivationPropagation}
    >
      <div className="audio-player-controls">
        <button
          type="button"
          data-control="play-pause"
          className={`audio-player-play-pause${isPlaying ? " is-playing" : ""}${isLoading ? " is-loading" : ""}`}
          aria-label={primaryLabel}
          title={primaryLabel}
          disabled={playbackDisabled}
          onClick={togglePlayback}
        >
          <span className="audio-player-play-pulse" aria-hidden="true" />
          {isPauseAction ? (
            <Pause size={14} aria-hidden="true" />
          ) : (
            <Play size={14} aria-hidden="true" />
          )}
        </button>
        <div className="audio-player-body">
          <div className="audio-player-wave-row">
            <PlayingWave active={isPlaying} />
            <div
              ref={waveRef}
              className="audio-player-wave"
              data-control="seek"
              role="slider"
              tabIndex={seekable && !isCallDisabled ? 0 : -1}
              aria-label="Seek audio"
              aria-valuemin={0}
              aria-valuemax={Math.max(1, Math.floor(duration))}
              aria-valuenow={Math.floor(position)}
              aria-valuetext={`${formatAudioTimeWords(position)} elapsed of ${formatAudioTimeWords(duration)}`}
              aria-disabled={!seekable || isCallDisabled}
              onPointerDown={onWavePointerDown}
              onPointerMove={onWavePointerMove}
              onPointerUp={onWavePointerUp}
              onPointerCancel={onWavePointerUp}
              onKeyDown={onWaveKeyDown}
            >
              <span className="audio-player-wave-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="audio-player-meta-row">
            <output data-control="time" className="audio-player-time" aria-label="Audio time">
              {isActive ? formatAudioTime(position) : formatAudioTime(duration || 0)}
              {isActive && duration > 0 ? ` / ${formatAudioTime(duration)}` : ""}
            </output>
            {!hideTitle && (
              <span className="audio-player-title" title={descriptor.title}>
                {descriptor.title}
              </span>
            )}
          </div>
        </div>
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
