import {
  AlertCircle,
  Captions,
  CaptionsOff,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
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
  audioPlaybackSession,
  sameAudioIdentity,
  type AudioDescriptor,
  type AudioPlaybackErrorCode,
  type AudioPlaybackSession,
  type AudioPlaybackSnapshot,
  type AudioSourceFactory,
} from "../audioPlaybackSession";
import { useAudioDuration } from "./audio-player/useAudioDuration";
import { useAudioTranscript } from "./audio-player/useAudioTranscript";
import type { AppStrings } from "../config/strings";
import { useStrings } from "../i18n/LanguageContext";

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
  accessToken?: string | null;
  strings?: AppStrings;
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

function errorCopy(error: AudioPlaybackErrorCode | null, strings: AppStrings): string {
  if (error === "unsupported") return strings.audioPlayer.formatUnsupported;
  if (error === "authorization") return strings.audioPlayer.noLongerAvailable;
  if (error === "network") {
    return strings.audioPlayer.networkError;
  }
  return strings.audioPlayer.couldNotPlayRetry;
}

function canRetry(error: AudioPlaybackErrorCode | null): boolean {
  return error !== "authorization";
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
  accessToken,
  strings: propStrings,
}: AudioPlayerProps) {
  const contextStrings = useStrings();
  const strings = propStrings ?? contextStrings;
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
  const [startDiagnostic, setStartDiagnostic] = useState<string | null>(null);
  const { transcript, isTranscribing, transcriptError, isTranscriptExpanded, setIsTranscriptExpanded, transcribe: handleTranscribe } = useAudioTranscript(accessToken, descriptor.identity.fileId);

  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (previewPosition !== null && !isDraggingRef.current && dragRevision.current !== (snapshot?.revision ?? null)) {
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

  // Native Media3 can remain in a loading state without surfacing a WebView
  // exception. Do not leave that indistinguishable from a successful start.
  useEffect(() => {
    setStartDiagnostic(null);
    if (
      !playIntent ||
      snapshot?.platform !== "android" ||
      (snapshot.status !== "loading" && snapshot.status !== "buffering")
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      const error = snapshot.error ?? "none";
      setStartDiagnostic(
        `Android playback did not start (state: ${snapshot.status}, position: ${Math.floor(snapshot.position)}s, duration: ${Math.floor(snapshot.duration)}s, error: ${error}).`,
      );
    }, 6_000);
    return () => window.clearTimeout(timer);
  }, [playIntent, snapshot?.duration, snapshot?.error, snapshot?.platform, snapshot?.position, snapshot?.status]);

  const knownDuration = useAudioDuration(descriptor.identity.fileId, snapshot?.duration, resolveDurationUrl);

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
  const isCallDisabled = Boolean(disabledReason);
  const seekable = Boolean(duration > 0 && !isCallDisabled);
  const isLoading = snapshot?.status === "loading" || (playIntent && snapshot?.status !== "playing" && snapshot?.status !== "buffering");
  const isBuffering = snapshot?.status === "buffering";
  const sessionPlaying =
    snapshot?.status === "playing" || snapshot?.status === "buffering";
  const isPlaying = sessionPlaying || playIntent;
  // Icon follows optimistic intent; only a live playing/buffering session pauses on tap
  // so a second tap can recover a stuck load instead of calling pause().
  const isPauseAction = isPlaying;
  const primaryLabel = sessionPlaying || playIntent
    ? strings.audioPlayer.pauseAudio
    : strings.audioPlayer.playAudio;
  // Keep the control clickable while loading so a stuck load cannot trap replay.
  // prepareCurrent still gates concurrent work; only calls disable the button.
  const playbackDisabled = isCallDisabled;
  const recoverableError = snapshot?.status === "error" && canRetry(snapshot.error);
  // Loading/buffering stay on the play button — avoid a permanent status strip.
  const statusCopy = isCallDisabled
    ? strings.audioPlayer.callActiveStatus
    : snapshot?.status === "suppressed" && snapshot.suppressionReason === "focus"
      ? strings.audioPlayer.suppressedStatus
      : null;

  const beginPlayback = useCallback(async (startPosition?: number) => {
    if (playbackDisabled || playInFlight.current) return;
    playInFlight.current = true;
    setPlayIntent(true);
    try {
      await onBeforePlay?.();
      session.setSourceFactory(sourceFactory);
      const activeSnapshot = session.getSnapshot();
      const sameTrack = sameAudioIdentity(activeSnapshot.identity, descriptor.identity);
      const hasSpecificStart = typeof startPosition === "number" && isFiniteTime(startPosition) && startPosition >= 0;
      const needsReload =
        !sameTrack ||
        hasSpecificStart ||
        activeSnapshot.status === "error" ||
        activeSnapshot.status === "idle" ||
        activeSnapshot.status === "loading" ||
        activeSnapshot.status === "authorization-required" ||
        activeSnapshot.status === "ended";
      if (needsReload) {
        const resumeAt =
          hasSpecificStart
            ? startPosition
            : sameTrack &&
              (activeSnapshot.status === "error" ||
                activeSnapshot.status === "authorization-required" ||
                activeSnapshot.status === "loading")
              ? activeSnapshot.position
              : 0;
        await session.load(descriptor, resumeAt);
      }
      if (session.getSnapshot().status === "error") {
        setPlayIntent(false);
        return;
      }
      await session.play();
    } catch (err) {
      // The canonical session maps backend failures to its closed error vocabulary.
      setPlayIntent(false);
      setStartDiagnostic(err instanceof Error ? err.message : strings.audioPlayer.couldNotPlay);
    } finally {
      playInFlight.current = false;
    }
  }, [descriptor, onBeforePlay, playbackDisabled, session, sourceFactory, strings.audioPlayer.couldNotPlay]);

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
      if (session.getSnapshot().status === "error") {
        setPlayIntent(false);
        return;
      }
      await session.play();
    } catch (err) {
      // Keep error presentation safe and generic.
      setPlayIntent(false);
      setStartDiagnostic(err instanceof Error ? err.message : strings.audioPlayer.couldNotPlay);
    } finally {
      playInFlight.current = false;
    }
  }, [isCallDisabled, onBeforePlay, recoverableError, session, sourceFactory, strings.audioPlayer.couldNotPlay]);

  const commitSeek = useCallback((value: number) => {
    setPreviewPosition(null);
    dragRevision.current = null;
    if (!seekable) return;
    const clamped = clamp(value, duration);
    if (!isActive || snapshot?.status === "idle" || snapshot?.status === "ended" || snapshot?.status === "error") {
      void beginPlayback(clamped);
    } else {
      void session.seek(clamped);
    }
  }, [beginPlayback, duration, isActive, seekable, session, snapshot?.status]);

  const onWavePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    stopInteraction(event);
    if (!seekable || isCallDisabled) return;
    const target = event.currentTarget;
    try {
      target.setPointerCapture?.(event.pointerId);
    } catch {
      // jsdom and some browsers may not implement pointer capture.
    }
    isDraggingRef.current = true;
    dragRevision.current = snapshot?.revision ?? 0;
    const next = positionFromClientX(event.clientX, target, duration);
    setPreviewPosition(next);
  }, [duration, isCallDisabled, seekable, snapshot?.revision]);

  const onWavePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !seekable) return;
    setPreviewPosition(positionFromClientX(event.clientX, event.currentTarget, duration));
  }, [duration, seekable]);

  const onWavePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    stopInteraction(event);
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
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
      onContextMenu={stopInteraction}
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
              data-idle={!isActive ? "true" : "false"}
              role="slider"
              tabIndex={seekable && !isCallDisabled ? 0 : -1}
              aria-label={strings.audioPlayer.seekAudio}
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
            <output data-control="time" className="audio-player-time" aria-label={strings.audioPlayer.audioTime}>
              {formatAudioTime(position)}
              {duration > 0 ? ` / ${formatAudioTime(duration)}` : ""}
            </output>
            {!hideTitle && (
              <span className="audio-player-title" title={descriptor.title}>
                {descriptor.title}
              </span>
            )}
            {accessToken && (
              <button
                type="button"
                className={`audio-player-transcribe-btn${isTranscribing ? " is-loading" : ""}${transcript ? " has-transcript" : ""}${isTranscriptExpanded ? " is-expanded" : ""}`}
                aria-label={
                  transcript
                    ? (isTranscriptExpanded ? strings.audioPlayer.hideTranscript : strings.audioPlayer.showTranscript)
                    : strings.audioPlayer.transcribe
                }
                title={
                  transcript
                    ? (isTranscriptExpanded ? strings.audioPlayer.hideTranscript : strings.audioPlayer.showTranscript)
                    : strings.audioPlayer.transcribe
                }
                disabled={isTranscribing}
                onClick={(e) => {
                  stopInteraction(e);
                  if (transcript) {
                    setIsTranscriptExpanded((prev) => !prev);
                  } else {
                    void handleTranscribe();
                  }
                }}
              >
                {isTranscribing ? (
                  <Loader2 size={12} className="audio-player-spin" aria-hidden="true" />
                ) : transcript && isTranscriptExpanded ? (
                  <CaptionsOff size={13} aria-hidden="true" />
                ) : (
                  <Captions size={13} aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
      {statusCopy && <div className="audio-player-status" role="status">{statusCopy}</div>}
      {isTranscribing && (
        <div className="audio-player-transcript-loading" role="status">
          <Loader2 size={13} className="audio-player-spin" aria-hidden="true" />
          <span>{strings.audioPlayer.transcribingWithAi}</span>
        </div>
      )}
      {transcriptError && (
        <div className="audio-player-transcript-error" role="alert">
          <AlertCircle size={13} aria-hidden="true" />
          <span>{transcriptError}</span>
          <button
            type="button"
            className="audio-player-transcript-retry"
            onClick={(e) => {
              stopInteraction(e);
              void handleTranscribe();
            }}
          >
            {strings.audioPlayer.retry}
          </button>
        </div>
      )}
      {transcript && (
        <div className={`audio-player-transcript${isTranscriptExpanded ? " is-expanded" : " is-collapsed"}`}>
          <div
            className="audio-player-transcript-header"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              stopInteraction(e);
              setIsTranscriptExpanded((prev) => !prev);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                stopActivationPropagation(e);
                setIsTranscriptExpanded((prev) => !prev);
              }
            }}
            aria-expanded={isTranscriptExpanded}
          >
            <div className="audio-player-transcript-header-left">
              <FileText size={12} aria-hidden="true" />
              <span className="audio-player-transcript-label">{strings.audioPlayer.transcript}</span>
            </div>
            <button
              type="button"
              className="audio-player-transcript-toggle"
              aria-label={isTranscriptExpanded ? strings.audioPlayer.collapseTranscript : strings.audioPlayer.expandTranscript}
              title={isTranscriptExpanded ? strings.audioPlayer.collapseTranscript : strings.audioPlayer.expandTranscript}
              onClick={(e) => {
                stopInteraction(e);
                setIsTranscriptExpanded((prev) => !prev);
              }}
            >
              {isTranscriptExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
          {isTranscriptExpanded && (
            <div className="audio-player-transcript-content" data-control="transcript-text">
              {transcript}
            </div>
          )}
        </div>
      )}
      {snapshot?.status === "error" && (
        <div className="audio-player-error" role="alert">
          <AlertCircle size={14} aria-hidden="true" />
          {errorCopy(snapshot.error, strings)}
          {recoverableError && (
            <button
              type="button"
              className="audio-player-retry"
              aria-label={strings.audioPlayer.retryAudio}
              title={strings.audioPlayer.retryAudio}
              disabled={isCallDisabled}
              onClick={() => void retry()}
            >
              {strings.audioPlayer.retry}
            </button>
          )}
        </div>
      )}
      {startDiagnostic && (
        <div className="audio-player-error" role="alert" data-control="start-diagnostic">
          <AlertCircle size={14} aria-hidden="true" />
          {startDiagnostic}
        </div>
      )}
    </article>
  );
}
