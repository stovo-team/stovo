import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearCachedAudioDuration,
  getCachedAudioDuration,
  readAudioDurationFromUrl,
  setCachedAudioDuration,
} from "./audioDurationCache";

afterEach(() => {
  clearCachedAudioDuration();
});

describe("audioDurationCache", () => {
  it("stores and returns positive finite durations by file id", () => {
    expect(getCachedAudioDuration("file-1")).toBeNull();
    setCachedAudioDuration("file-1", 12.5);
    expect(getCachedAudioDuration("file-1")).toBe(12.5);
    setCachedAudioDuration("file-1", 0);
    expect(getCachedAudioDuration("file-1")).toBe(12.5);
    setCachedAudioDuration("", 9);
    expect(getCachedAudioDuration("")).toBeNull();
  });

  it("reads duration from an HTMLAudioElement metadata event", async () => {
    const listeners = new Map<string, EventListener>();
    const element = {
      preload: "",
      duration: 42,
      src: "",
      addEventListener: (type: string, listener: EventListener) => {
        listeners.set(type, listener);
      },
      removeAttribute: vi.fn(),
      load: vi.fn(),
    };
    function AudioMock(this: typeof element) {
      Object.assign(this, element);
      return this;
    }
    vi.stubGlobal("Audio", AudioMock as unknown as typeof Audio);

    const pending = readAudioDurationFromUrl("blob:audio-1");
    listeners.get("loadedmetadata")?.(new Event("loadedmetadata"));
    await expect(pending).resolves.toBe(42);

    vi.unstubAllGlobals();
  });

  it("prefers the playable seekable range over an inflated container duration", async () => {
    const listeners = new Map<string, EventListener>();
    const element = {
      preload: "",
      duration: 13_200,
      seekable: { length: 1, end: () => 220 },
      src: "",
      addEventListener: (type: string, listener: EventListener) => {
        listeners.set(type, listener);
      },
      removeAttribute: vi.fn(),
      load: vi.fn(),
    };
    function AudioMock(this: typeof element) {
      Object.assign(this, element);
      return this;
    }
    vi.stubGlobal("Audio", AudioMock as unknown as typeof Audio);

    const pending = readAudioDurationFromUrl("blob:audio-1");
    listeners.get("loadedmetadata")?.(new Event("loadedmetadata"));
    await expect(pending).resolves.toBe(220);

    vi.unstubAllGlobals();
  });
});
