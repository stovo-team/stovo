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

function nativeState(overrides: Partial<AudioPlaybackSnapshot> = {}): AudioPlaybackSnapshot {
  return {
    identity: descriptor.identity,
    title: "",
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
    const received: AudioPlaybackSnapshot[] = [];
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
});
