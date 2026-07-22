import { describe, expect, it } from "vitest";

import type {
  NativeVideoPictureInPictureState,
  PictureInPictureActionEvent,
  PictureInPictureState,
} from "./native/callPlugin";
import {
  applyPictureInPictureAction,
  parseVideoPictureInPictureRestore,
  toNativeVideoPictureInPictureState,
} from "./videoPiPBridge";
import type { VideoPlaybackSnapshot } from "./videoPlaybackSession";

const identity = {
  chatId: "chat/%/семья",
  messageId: "message/百分比%",
  fileId: "file/opaque%2Fid",
};

const snapshot: VideoPlaybackSnapshot = {
  identity,
  currentTime: 12.5,
  duration: 40,
  muted: true,
  playIntent: true,
  status: "playing",
  error: null,
  revision: 17,
};

const nativeVideo: NativeVideoPictureInPictureState = {
  active: true,
  playing: true,
  ...identity,
  positionSeconds: 12.5,
  durationSeconds: 40,
  width: 1280,
  height: 720,
  revision: 17,
};

function pictureInPictureState(
  overrides: Partial<PictureInPictureState> = {},
): PictureInPictureState {
  return {
    active: false,
    supported: true,
    eligible: true,
    owner: "video",
    requestedOwner: "video",
    activeOwner: "video",
    callActive: false,
    video: false,
    acceptedRevision: 17,
    videoState: nativeVideo,
    reason: "exited",
    ...overrides,
  };
}

describe("toNativeVideoPictureInPictureState", () => {
  it("serializes only exact identity, finite playback, dimensions, and revision", () => {
    const update = toNativeVideoPictureInPictureState(snapshot, {
      width: 1280,
      height: 720,
    });

    expect(update).toEqual(nativeVideo);
    expect(Object.keys(update).sort()).toEqual([
      "active",
      "chatId",
      "durationSeconds",
      "fileId",
      "height",
      "messageId",
      "playing",
      "positionSeconds",
      "revision",
      "width",
    ]);
    expect(update).not.toHaveProperty("muted");
    expect(update).not.toHaveProperty("src");
    expect(update).not.toHaveProperty("accessToken");
    expect(update).not.toHaveProperty("originalName");
  });

  it("emits an explicit inactive state for no or invalid active snapshot", () => {
    expect(toNativeVideoPictureInPictureState(null, undefined, 23)).toEqual({
      active: false,
      playing: false,
      chatId: "",
      messageId: "",
      fileId: "",
      positionSeconds: 0,
      durationSeconds: 0,
      width: 0,
      height: 0,
      revision: 23,
    });

    for (const invalid of [
      { ...snapshot, identity: { ...identity, chatId: "" } },
      { ...snapshot, currentTime: Number.NaN },
      { ...snapshot, currentTime: Number.POSITIVE_INFINITY },
      { ...snapshot, currentTime: -1 },
      { ...snapshot, revision: -1 },
      { ...snapshot, revision: Number.NaN },
    ]) {
      expect(
        toNativeVideoPictureInPictureState(invalid, { width: 640, height: 360 }, 24),
      ).toMatchObject({ active: false, playing: false, revision: 24 });
    }
  });
});

describe("parseVideoPictureInPictureRestore", () => {
  it("preserves opaque slash, percent, and Unicode identifiers exactly", () => {
    expect(parseVideoPictureInPictureRestore(pictureInPictureState(), 17)).toEqual({
      identity,
      currentTime: 12.5,
      duration: 40,
      playing: true,
      revision: 17,
    });
  });

  it.each([
    ["owner none", pictureInPictureState({ owner: "none" })],
    ["owner call", pictureInPictureState({ owner: "call" })],
    ["missing video", pictureInPictureState({ videoState: null })],
    ["missing identity", pictureInPictureState({ videoState: { ...nativeVideo, fileId: "" } })],
    ["stale revision", pictureInPictureState({ videoState: { ...nativeVideo, revision: 16 } })],
    ["non-finite position", pictureInPictureState({
      videoState: { ...nativeVideo, positionSeconds: Number.NaN },
    })],
    ["malformed payload", { owner: "video", videoState: "not-an-object" }],
  ])("ignores %s", (_label, state) => {
    expect(parseVideoPictureInPictureRestore(state, 17)).toBeNull();
  });
});

describe("applyPictureInPictureAction", () => {
  it.each([
    ["play", { type: "play" }],
    ["pause", { type: "pause" }],
    ["seek-backward", { type: "seek", currentTime: 2.5 }],
    ["seek-forward", { type: "seek", currentTime: 22.5 }],
  ] as const)("maps %s to the current session action", (action, expected) => {
    const event: PictureInPictureActionEvent = { action, videoState: nativeVideo };
    expect(applyPictureInPictureAction(event, snapshot, 17)).toEqual(expected);
  });

  it("bounds ten-second seeks and ignores stale, mismatched, or unknown actions", () => {
    const nearStart = { ...snapshot, currentTime: 4 };
    const nearEnd = { ...snapshot, currentTime: 37 };

    expect(
      applyPictureInPictureAction(
        { action: "seek-backward", videoState: nativeVideo },
        nearStart,
        17,
      ),
    ).toEqual({ type: "seek", currentTime: 0 });
    expect(
      applyPictureInPictureAction(
        { action: "seek-forward", videoState: nativeVideo },
        nearEnd,
        17,
      ),
    ).toEqual({ type: "seek", currentTime: 40 });
    expect(
      applyPictureInPictureAction(
        { action: "pause", videoState: { ...nativeVideo, revision: 16 } },
        snapshot,
        17,
      ),
    ).toBeNull();
    expect(
      applyPictureInPictureAction(
        { action: "pause", videoState: { ...nativeVideo, fileId: "other" } },
        snapshot,
        17,
      ),
    ).toBeNull();
    expect(
      applyPictureInPictureAction(
        { action: "delete-message", videoState: nativeVideo } as unknown,
        snapshot,
        17,
      ),
    ).toBeNull();
  });
});
