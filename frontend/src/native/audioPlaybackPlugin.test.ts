import { beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ native: true, name: "android" }));
const callOrder = vi.hoisted(() => [] as string[]);
const nativePlugin = vi.hoisted(() => ({
  getState: vi.fn(),
  load: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seek: vi.fn(),
  clear: vi.fn(),
  setCallActive: vi.fn(),
  addListener: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => platform.native,
    getPlatform: () => platform.name,
  },
  registerPlugin: () => nativePlugin,
}));

import type {
  AudioDescriptor,
  AudioPlaybackSnapshot,
  AudioPlaybackSource,
} from "../audioPlaybackSession";
import type { NativeAudioPlaybackState } from "../audioNativeBridge";
import {
  NativeAudioPlaybackBackend,
  addAudioPlaybackStateListener,
  getNativeAudioPlaybackState,
} from "./audioPlaybackPlugin";

const descriptor: AudioDescriptor = {
  identity: {
    chatId: "chat/%/ÑÐµÐ¼ÑŒÑ",
    messageId: "message/ç™¾åˆ†æ¯”%",
    fileId: "file/opaque%2Fid",
  },
  title: "Private filename.mp3",
};

const source: AudioPlaybackSource = {
  url: "https://stovo-local.stovo.ru/api/media/file%2Fopaque%252Fid",
  token: "playback-secret",
};

function nativeState(
  overrides: Partial<NativeAudioPlaybackState> = {},
): NativeAudioPlaybackState {
  return {
    identity: descriptor.identity,
    position: 12,
    duration: 40,
    bufferedPosition: 30,
    status: "paused",
    playWhenReady: false,
    isPlaying: false,
    suppressionReason: null,
    canSeek: true,
    error: null,
    revision: 7,
    platform: "android",
    ...overrides,
  };
}

describe("native audio playback plugin", () => {
  beforeEach(() => {
    platform.native = true;
    platform.name = "android";
    callOrder.length = 0;
    vi.clearAllMocks();
    nativePlugin.getState.mockImplementation(async () => {
      callOrder.push("getState");
      return nativeState();
    });
    nativePlugin.addListener.mockImplementation(
      async (_name: string, _listener: (value: unknown) => void) => {
        callOrder.push("listener");
        return { remove: vi.fn().mockResolvedValue(undefined) };
      },
    );
    for (const command of ["load", "play", "pause", "seek", "clear", "setCallActive"] as const) {
      nativePlugin[command].mockResolvedValue(undefined);
    }
  });

  it("registers the listener before getState and reconnects without issuing load or play", async () => {
    const backend = new NativeAudioPlaybackBackend();
    const snapshots: AudioPlaybackSnapshot[] = [];
    backend.subscribe((snapshot) => snapshots.push(snapshot));

    await backend.connect();
    await backend.connect();

    expect(callOrder).toEqual(["listener", "getState"]);
    expect(nativePlugin.addListener).toHaveBeenCalledTimes(1);
    expect(nativePlugin.getState).toHaveBeenCalledTimes(1);
    expect(nativePlugin.load).not.toHaveBeenCalled();
    expect(nativePlugin.play).not.toHaveBeenCalled();
    expect(backend.getSnapshot()).toMatchObject({ revision: 7, platform: "android" });
    expect(snapshots.at(-1)).toMatchObject({ revision: 7 });
  });

  it("sends exact command payloads while keeping credentials out of snapshots", async () => {
    const backend = new NativeAudioPlaybackBackend();
    await backend.load(descriptor, source, 12);
    await backend.play();
    await backend.pause();
    await backend.seek(100);
    await backend.setCallActive(true);

    expect(nativePlugin.load).toHaveBeenCalledWith({
      chatId: descriptor.identity.chatId,
      messageId: descriptor.identity.messageId,
      fileId: descriptor.identity.fileId,
      sourceUrl: source.url,
      token: source.token,
      startPosition: 12,
    });
    expect(nativePlugin.play).toHaveBeenCalledWith();
    expect(nativePlugin.pause).toHaveBeenCalledWith();
    expect(nativePlugin.seek).toHaveBeenCalledWith({ position: 40 });
    expect(nativePlugin.setCallActive).toHaveBeenCalledWith({ active: true });
    expect(JSON.stringify(backend.getSnapshot())).not.toMatch(
      /playback-secret|sourceUrl|https:|Private filename/,
    );
  });

  it("accepts only newer validated listener state and removes its handle idempotently", async () => {
    let listener: ((value: unknown) => void) | undefined;
    const remove = vi.fn().mockResolvedValue(undefined);
    nativePlugin.addListener.mockImplementation(
      async (_name: string, onState: (value: unknown) => void) => {
        listener = onState;
        return { remove };
      },
    );
    const received: NativeAudioPlaybackState[] = [];
    const cleanup = await addAudioPlaybackStateListener((snapshot) => received.push(snapshot), 7);

    listener?.(nativeState({ revision: 7 }));
    listener?.(nativeState({ revision: 8, position: 13 }));
    listener?.({ ...nativeState({ revision: 9 }), token: "forbidden" });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ revision: 8, position: 13 });

    cleanup();
    cleanup();
    await Promise.resolve();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("returns an unavailable backend on web without plugin commands or an audio decoder", async () => {
    platform.native = false;
    const AudioSpy = vi.fn(() => {
      throw new Error("web decoder must not be created");
    });
    vi.stubGlobal("Audio", AudioSpy);
    const backend = new NativeAudioPlaybackBackend();

    await backend.connect();
    await backend.load(descriptor, source, 0);
    await backend.play();

    expect(backend.getSnapshot()).toMatchObject({
      platform: "unavailable",
      status: "error",
      error: "unavailable",
    });
    expect(nativePlugin.addListener).not.toHaveBeenCalled();
    expect(nativePlugin.getState).not.toHaveBeenCalled();
    expect(nativePlugin.load).not.toHaveBeenCalled();
    expect(AudioSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("normalizes command, getState, and listener failures without raw errors", async () => {
    nativePlugin.getState.mockRejectedValue(new Error("native stack trace"));
    nativePlugin.addListener.mockRejectedValue(new Error("listener stack trace"));
    nativePlugin.load.mockRejectedValue(new Error("token=secret"));
    const backend = new NativeAudioPlaybackBackend();

    await backend.connect();
    await backend.load(descriptor, source, 0);

    expect(await getNativeAudioPlaybackState()).toBeNull();
    expect(backend.getSnapshot()).toMatchObject({
      platform: "android",
      status: "error",
      error: "unavailable",
    });
    expect(JSON.stringify(backend.getSnapshot())).not.toMatch(/stack trace|token=secret/);
  });

  it("clears and releases the listener exactly once, then can reconnect for a new load", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    nativePlugin.addListener.mockResolvedValue({ remove });
    const backend = new NativeAudioPlaybackBackend();
    await backend.connect();

    await backend.clear();
    await backend.clear();
    expect(nativePlugin.clear).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledTimes(1);

    await backend.load(descriptor, source, 0);
    expect(nativePlugin.addListener).toHaveBeenCalledTimes(2);
    expect(nativePlugin.load).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed, incomplete, and lower-revision listener payloads without changing accepted state", async () => {
    let listener: ((value: unknown) => void) | undefined;
    nativePlugin.addListener.mockImplementation(
      async (_name: string, onState: (value: unknown) => void) => {
        listener = onState;
        return { remove: vi.fn().mockResolvedValue(undefined) };
      },
    );
    const backend = new NativeAudioPlaybackBackend();
    const snapshots: AudioPlaybackSnapshot[] = [];
    backend.subscribe((snapshot) => snapshots.push(snapshot));
    await backend.connect();
    const accepted = backend.getSnapshot();

    listener?.({ ...nativeState({ revision: 8 }), identity: { chatId: "", messageId: "m", fileId: "f" } });
    listener?.({ ...nativeState({ revision: 8 }), position: Number.NaN });
    listener?.({ ...nativeState({ revision: 8 }), status: "teleport" });
    listener?.(nativeState({ revision: 6, position: 99 }));
    listener?.(null);
    listener?.("not-an-object");

    expect(backend.getSnapshot()).toMatchObject({
      revision: accepted.revision,
      position: accepted.position,
    });
    expect(snapshots.every((snapshot) => snapshot.revision >= accepted.revision)).toBe(true);
    expect(JSON.stringify(backend.getSnapshot())).not.toMatch(
      /playback-secret|Private filename|https:\/\/stovo-local/,
    );
  });

  it("resets the revision watermark on load so a restarted service can replay", async () => {
    let listener: ((value: unknown) => void) | undefined;
    nativePlugin.addListener.mockImplementation(
      async (_name: string, onState: (value: unknown) => void) => {
        listener = onState;
        return { remove: vi.fn().mockResolvedValue(undefined) };
      },
    );
    const backend = new NativeAudioPlaybackBackend();
    await backend.connect();
    listener?.(
      nativeState({
        revision: 40,
        status: "ended",
        position: 12,
        duration: 12,
        bufferedPosition: 12,
        playWhenReady: false,
        isPlaying: false,
      }),
    );
    expect(backend.getSnapshot()).toMatchObject({ status: "ended", revision: 40 });

    await backend.load(descriptor, source, 0);
    listener?.(
      nativeState({
        revision: 1,
        status: "ready",
        position: 0,
        duration: 12,
        bufferedPosition: 0,
        canSeek: true,
      }),
    );

    expect(backend.getSnapshot()).toMatchObject({
      status: "ready",
      revision: 1,
      position: 0,
    });
  });

  it("does not stop playback when only the Activity bridge listener disconnects", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    nativePlugin.addListener.mockResolvedValue({ remove });
    nativePlugin.getState.mockResolvedValue(
      nativeState({ revision: 11, status: "playing", isPlaying: true, playWhenReady: true }),
    );
    const backend = new NativeAudioPlaybackBackend();
    await backend.connect();
    expect(backend.getSnapshot()).toMatchObject({
      revision: 11,
      status: "playing",
      isPlaying: true,
    });

    const cleanup = await addAudioPlaybackStateListener(vi.fn(), 11);
    cleanup();
    cleanup();

    expect(nativePlugin.clear).not.toHaveBeenCalled();
    expect(nativePlugin.pause).not.toHaveBeenCalled();
    expect(backend.getSnapshot()).toMatchObject({
      revision: 11,
      status: "playing",
      isPlaying: true,
      identity: descriptor.identity,
    });
  });
});
