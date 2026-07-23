import { describe, expect, it } from "vitest";

import {
  parseNativeAudioPlaybackState,
  type NativeAudioPlaybackState,
} from "./audioNativeBridge";

const identity = {
  chatId: "chat/%/ÑÐµÐ¼ÑŒÑ",
  messageId: "message/ç™¾åˆ†æ¯”%",
  fileId: "file/opaque%2Fid",
};

function nativeState(
  overrides: Partial<NativeAudioPlaybackState> = {},
): NativeAudioPlaybackState {
  return {
    identity,
    position: 12.5,
    duration: 40,
    bufferedPosition: 30,
    status: "playing",
    playWhenReady: true,
    isPlaying: true,
    suppressionReason: null,
    canSeek: true,
    error: null,
    revision: 17,
    platform: "android",
    ...overrides,
  };
}

describe("parseNativeAudioPlaybackState", () => {
  it("accepts and immutably copies one complete credential-free opaque state", () => {
    const source = nativeState();
    const parsed = parseNativeAudioPlaybackState(source, 16);

    expect(parsed).toEqual(source);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.identity)).toBe(true);
    source.identity!.fileId = "mutated";
    expect(parsed?.identity?.fileId).toBe("file/opaque%2Fid");
    expect(Object.keys(parsed!).sort()).toEqual([
      "bufferedPosition",
      "canSeek",
      "duration",
      "error",
      "identity",
      "isPlaying",
      "platform",
      "playWhenReady",
      "position",
      "revision",
      "status",
      "suppressionReason",
    ]);
  });

  it.each([
    ["null", null],
    ["array", []],
    ["partial", { identity }],
    ["empty chat", nativeState({ identity: { ...identity, chatId: "" } })],
    ["empty message", nativeState({ identity: { ...identity, messageId: " " } })],
    ["unknown status", { ...nativeState(), status: "streaming" }],
    ["unknown suppression", { ...nativeState(), suppressionReason: "mystery" }],
    ["unknown error", { ...nativeState(), error: "stack-trace" }],
    ["wrong platform", { ...nativeState(), platform: "web" }],
    ["NaN position", nativeState({ position: Number.NaN })],
    ["infinite duration", nativeState({ duration: Number.POSITIVE_INFINITY })],
    ["negative buffered", nativeState({ bufferedPosition: -1 })],
    ["position past duration", nativeState({ position: 41 })],
    ["buffer past duration", nativeState({ bufferedPosition: 41 })],
    ["fractional revision", nativeState({ revision: 2.5 })],
    ["playing without actual playback", nativeState({ isPlaying: false })],
  ])("rejects %s", (_label, value) => {
    expect(parseNativeAudioPlaybackState(value)).toBeNull();
  });

  it("rejects lower/equal revisions and accepts a strictly newer one", () => {
    expect(parseNativeAudioPlaybackState(nativeState({ revision: 16 }), 16)).toBeNull();
    expect(parseNativeAudioPlaybackState(nativeState({ revision: 15 }), 16)).toBeNull();
    expect(parseNativeAudioPlaybackState(nativeState({ revision: 17 }), 16)?.revision).toBe(17);
  });

  it.each(["token", "accessToken", "sourceUrl", "url", "intent", "extras", "rawError"])(
    "rejects the forbidden or unknown %s key instead of stripping it",
    (key) => {
      expect(
        parseNativeAudioPlaybackState({
          ...nativeState(),
          [key]: "secret-or-untrusted",
        }),
      ).toBeNull();
    },
  );

  it("accepts a closed idle state without identity and rejects identity-free active state", () => {
    expect(
      parseNativeAudioPlaybackState(
        nativeState({
          identity: null,
          position: 0,
          duration: 0,
          bufferedPosition: 0,
          status: "idle",
          playWhenReady: false,
          isPlaying: false,
          canSeek: false,
          revision: 18,
        }),
      ),
    ).toMatchObject({ identity: null, status: "idle", revision: 18 });
    expect(
      parseNativeAudioPlaybackState(nativeState({ identity: null, revision: 18 })),
    ).toBeNull();
  });
});
