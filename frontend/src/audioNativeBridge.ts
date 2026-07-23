import type {
  AudioIdentity,
  AudioPlaybackErrorCode,
  AudioPlaybackStatus,
  AudioSuppressionReason,
} from "./audioPlaybackSession";

export type NativeAudioPlaybackIdentity = AudioIdentity;
export type NativeAudioPlaybackErrorCode = AudioPlaybackErrorCode;

export interface NativeAudioPlaybackState {
  identity: NativeAudioPlaybackIdentity | null;
  position: number;
  duration: number;
  bufferedPosition: number;
  status: AudioPlaybackStatus;
  playWhenReady: boolean;
  isPlaying: boolean;
  suppressionReason: AudioSuppressionReason;
  canSeek: boolean;
  error: NativeAudioPlaybackErrorCode | null;
  revision: number;
  platform: "android";
}

const stateKeys = new Set([
  "identity",
  "position",
  "duration",
  "bufferedPosition",
  "status",
  "playWhenReady",
  "isPlaying",
  "suppressionReason",
  "canSeek",
  "error",
  "revision",
  "platform",
]);

const statuses = new Set<AudioPlaybackStatus>([
  "idle",
  "loading",
  "ready",
  "playing",
  "paused",
  "buffering",
  "suppressed",
  "ended",
  "error",
  "authorization-required",
]);

const suppressionReasons = new Set<Exclude<AudioSuppressionReason, null>>([
  "call",
  "video",
  "focus",
]);

const errors = new Set<AudioPlaybackErrorCode>([
  "unavailable",
  "network",
  "unsupported",
  "decode",
  "playback-denied",
  "authorization",
  "unknown",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOpaqueId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isSafeRevision(value: unknown): value is number {
  return isFiniteNonNegative(value) && Number.isSafeInteger(value);
}

function parseIdentity(value: unknown): NativeAudioPlaybackIdentity | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value);
  if (
    keys.length !== 3 ||
    !keys.every((key) => key === "chatId" || key === "messageId" || key === "fileId") ||
    !isOpaqueId(value.chatId) ||
    !isOpaqueId(value.messageId) ||
    !isOpaqueId(value.fileId)
  ) {
    return undefined;
  }
  return {
    chatId: value.chatId,
    messageId: value.messageId,
    fileId: value.fileId,
  };
}

function hasClosedSchema(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return keys.length === stateKeys.size && keys.every((key) => stateKeys.has(key));
}

export function parseNativeAudioPlaybackState(
  value: unknown,
  minimumRevision = -1,
): NativeAudioPlaybackState | null {
  if (
    !isRecord(value) ||
    !hasClosedSchema(value) ||
    !Number.isSafeInteger(minimumRevision)
  ) {
    return null;
  }

  const identity = parseIdentity(value.identity);
  if (identity === undefined) return null;
  if (
    !isFiniteNonNegative(value.position) ||
    !isFiniteNonNegative(value.duration) ||
    !isFiniteNonNegative(value.bufferedPosition) ||
    !statuses.has(value.status as AudioPlaybackStatus) ||
    typeof value.playWhenReady !== "boolean" ||
    typeof value.isPlaying !== "boolean" ||
    !(
      value.suppressionReason === null ||
      suppressionReasons.has(value.suppressionReason as Exclude<AudioSuppressionReason, null>)
    ) ||
    typeof value.canSeek !== "boolean" ||
    !(value.error === null || errors.has(value.error as AudioPlaybackErrorCode)) ||
    !isSafeRevision(value.revision) ||
    value.revision <= minimumRevision ||
    value.platform !== "android"
  ) {
    return null;
  }

  const status = value.status as AudioPlaybackStatus;
  const suppressionReason = value.suppressionReason as AudioSuppressionReason;
  const error = value.error as AudioPlaybackErrorCode | null;
  if (
    (value.duration > 0 &&
      (value.position > value.duration || value.bufferedPosition > value.duration)) ||
    (value.isPlaying &&
      (status !== "playing" || !value.playWhenReady || suppressionReason !== null)) ||
    (status === "playing" && (!value.isPlaying || !value.playWhenReady)) ||
    (status === "suppressed" && suppressionReason === null) ||
    (suppressionReason !== null && status !== "suppressed") ||
    (status === "error" && error === null) ||
    (status !== "error" && error !== null)
  ) {
    return null;
  }

  if (
    identity === null &&
    (status !== "idle" ||
      value.position !== 0 ||
      value.duration !== 0 ||
      value.bufferedPosition !== 0 ||
      value.playWhenReady ||
      value.isPlaying ||
      suppressionReason !== null ||
      value.canSeek ||
      error !== null)
  ) {
    return null;
  }
  if (identity === null && status !== "idle") return null;

  const copiedIdentity = identity ? Object.freeze({ ...identity }) : null;
  return Object.freeze({
    identity: copiedIdentity,
    position: value.position,
    duration: value.duration,
    bufferedPosition: value.bufferedPosition,
    status,
    playWhenReady: value.playWhenReady,
    isPlaying: value.isPlaying,
    suppressionReason,
    canSeek: value.canSeek,
    error,
    revision: value.revision,
    platform: "android",
  });
}
