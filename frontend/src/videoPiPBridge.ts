import type {
  NativeVideoPictureInPictureState,
  PictureInPictureAction,
} from "./native/callPlugin";
import {
  sameVideoIdentity,
  type VideoIdentity,
  type VideoPlaybackAction,
  type VideoPlaybackSnapshot,
} from "./videoPlaybackSession";

export interface NativeVideoDimensions {
  width: number;
  height: number;
}

export type NativeVideoPiPUpdate = NativeVideoPictureInPictureState;

export interface VideoPiPRestoreTarget {
  identity: VideoIdentity;
  currentTime: number;
  duration: number;
  playing: boolean;
  revision: number;
}

const seekSeconds = 10;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOpaqueId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRevision(value: unknown): value is number {
  return isFiniteNonNegative(value) && Number.isSafeInteger(value);
}

function inactiveVideoState(revision: number): NativeVideoPiPUpdate {
  return {
    active: false,
    playing: false,
    chatId: "",
    messageId: "",
    fileId: "",
    positionSeconds: 0,
    durationSeconds: 0,
    width: 0,
    height: 0,
    revision: isRevision(revision) ? revision : 0,
  };
}

function validSnapshot(
  snapshot: VideoPlaybackSnapshot,
  dimensions: NativeVideoDimensions,
): boolean {
  return (
    isOpaqueId(snapshot.identity?.chatId) &&
    isOpaqueId(snapshot.identity?.messageId) &&
    isOpaqueId(snapshot.identity?.fileId) &&
    isFiniteNonNegative(snapshot.currentTime) &&
    isFiniteNonNegative(snapshot.duration) &&
    isRevision(snapshot.revision) &&
    isFiniteNonNegative(dimensions.width) &&
    isFiniteNonNegative(dimensions.height)
  );
}

export function toNativeVideoPictureInPictureState(
  snapshot: VideoPlaybackSnapshot | null,
  dimensions: NativeVideoDimensions = { width: 0, height: 0 },
  inactiveRevision = 0,
): NativeVideoPiPUpdate {
  if (!snapshot || !validSnapshot(snapshot, dimensions)) {
    return inactiveVideoState(inactiveRevision);
  }

  const duration = snapshot.duration;
  const position = duration > 0
    ? Math.min(snapshot.currentTime, duration)
    : snapshot.currentTime;
  return {
    active: true,
    playing:
      snapshot.playIntent &&
      (snapshot.status === "playing" || snapshot.status === "waiting"),
    chatId: snapshot.identity.chatId,
    messageId: snapshot.identity.messageId,
    fileId: snapshot.identity.fileId,
    positionSeconds: position,
    durationSeconds: duration,
    width: dimensions.width,
    height: dimensions.height,
    revision: snapshot.revision,
  };
}

function parseNativeVideoState(value: unknown): NativeVideoPictureInPictureState | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.active !== "boolean" ||
    typeof value.playing !== "boolean" ||
    !isOpaqueId(value.chatId) ||
    !isOpaqueId(value.messageId) ||
    !isOpaqueId(value.fileId) ||
    !isFiniteNonNegative(value.positionSeconds) ||
    !isFiniteNonNegative(value.durationSeconds) ||
    !isFiniteNonNegative(value.width) ||
    !isFiniteNonNegative(value.height) ||
    !isRevision(value.revision)
  ) {
    return null;
  }

  return {
    active: value.active,
    playing: value.playing,
    chatId: value.chatId,
    messageId: value.messageId,
    fileId: value.fileId,
    positionSeconds: value.positionSeconds,
    durationSeconds: value.durationSeconds,
    width: value.width,
    height: value.height,
    revision: value.revision,
  };
}

export function parseVideoPictureInPictureRestore(
  value: unknown,
  minimumRevision = 0,
): VideoPiPRestoreTarget | null {
  if (!isRecord(value) || value.owner !== "video" || !isRevision(minimumRevision)) {
    return null;
  }
  const acceptedRevision = value.acceptedRevision;
  if (!isRevision(acceptedRevision)) return null;
  const videoState = parseNativeVideoState(value.videoState);
  if (
    !videoState ||
    videoState.revision < minimumRevision ||
    videoState.revision < acceptedRevision
  ) {
    return null;
  }

  const duration = videoState.durationSeconds;
  return {
    identity: {
      chatId: videoState.chatId,
      messageId: videoState.messageId,
      fileId: videoState.fileId,
    },
    currentTime: duration > 0
      ? Math.min(videoState.positionSeconds, duration)
      : videoState.positionSeconds,
    duration,
    playing: videoState.playing,
    revision: videoState.revision,
  };
}

function isPictureInPictureAction(value: unknown): value is PictureInPictureAction {
  return (
    value === "play" ||
    value === "pause" ||
    value === "seek-backward" ||
    value === "seek-forward"
  );
}

export function applyPictureInPictureAction(
  value: unknown,
  snapshot: VideoPlaybackSnapshot | null,
  minimumRevision = 0,
): VideoPlaybackAction | null {
  if (!snapshot || !isRecord(value) || !isPictureInPictureAction(value.action)) {
    return null;
  }
  const videoState = parseNativeVideoState(value.videoState);
  if (
    !videoState ||
    !isRevision(minimumRevision) ||
    videoState.revision < minimumRevision ||
    !sameVideoIdentity(snapshot.identity, videoState)
  ) {
    return null;
  }

  switch (value.action) {
    case "play":
      return { type: "play" };
    case "pause":
      return { type: "pause" };
    case "seek-backward":
      return { type: "seek", currentTime: Math.max(0, snapshot.currentTime - seekSeconds) };
    case "seek-forward": {
      const nextTime = snapshot.currentTime + seekSeconds;
      return {
        type: "seek",
        currentTime: snapshot.duration > 0
          ? Math.min(nextTime, snapshot.duration)
          : nextTime,
      };
    }
  }
}
