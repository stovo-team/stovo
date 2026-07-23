import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AudioPlaybackSession,
  type AudioPlaybackBackend,
  type AudioPlaybackSnapshot,
  type AudioSourceFactory,
} from "../audioPlaybackSession";
import { AudioNowPlaying } from "./AudioNowPlaying";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const identity = { chatId: "chat-1", messageId: "message-1", fileId: "file-1" };

function snapshot(
  overrides: Partial<AudioPlaybackSnapshot> = {},
): AudioPlaybackSnapshot {
  return {
    identity,
    title: "Voice note.m4a",
    position: 30,
    duration: 90,
    bufferedPosition: 60,
    status: "paused",
    playWhenReady: false,
    isPlaying: false,
    suppressionReason: null,
    canSeek: true,
    error: null,
    revision: 1,
    platform: "web",
    ...overrides,
  };
}

class FakeBackend implements AudioPlaybackBackend {
  private current = snapshot({ identity: null, title: "", duration: 0, position: 0 });
  private listeners = new Set<(value: AudioPlaybackSnapshot) => void>();
  connect = vi.fn(async () => undefined);
  load = vi.fn(async () => undefined);
  play = vi.fn(async () => undefined);
  pause = vi.fn(async () => undefined);
  seek = vi.fn(async () => undefined);
  clear = vi.fn(async () => undefined);
  setCallActive = vi.fn(async () => undefined);

  getSnapshot(): AudioPlaybackSnapshot {
    return this.current;
  }

  subscribe(listener: (value: AudioPlaybackSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(value: AudioPlaybackSnapshot): void {
    this.current = value;
    this.listeners.forEach((listener) => listener(value));
  }
}

const roots: Root[] = [];
let backend: FakeBackend;
let session: AudioPlaybackSession;
let onRestore: ReturnType<typeof vi.fn>;

function renderNowPlaying(
  props: Partial<React.ComponentProps<typeof AudioNowPlaying>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(
      <AudioNowPlaying session={session} onRestore={onRestore} {...props} />,
    );
  });
  return { container, root };
}

function emit(value: AudioPlaybackSnapshot): void {
  act(() => backend.emit(value));
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  backend = new FakeBackend();
  const sourceFactory: AudioSourceFactory = async () => ({ url: "blob:audio" });
  session = new AudioPlaybackSession(backend, sourceFactory);
  onRestore = vi.fn();
});

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    act(() => root?.unmount());
  }
  session.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("AudioNowPlaying", () => {
  it("is absent without an identity and renders one compact synchronized surface otherwise", () => {
    const { container } = renderNowPlaying();
    expect(container.querySelector(".audio-now-playing")).toBeNull();

    emit(snapshot({ revision: 2, status: "playing", isPlaying: true, playWhenReady: true }));
    const player = container.querySelector(".audio-now-playing")!;
    expect(player.querySelectorAll(".audio-now-playing-title")).toHaveLength(1);
    expect(player.querySelector(".audio-now-playing-title")?.textContent).toBe("Voice note.m4a");
    expect(player.querySelector(".audio-now-playing-status")?.textContent).toBe("Playing");
    expect(player.querySelector('button[aria-label="Pause audio"]')).not.toBeNull();
    expect(player.querySelector('button[aria-label="Return to audio message"]')).not.toBeNull();
    expect(player.querySelector('button[aria-label="Close audio player"]')).not.toBeNull();
    expect(player.querySelector('button[aria-label="Pause audio"]')?.parentElement).toBe(player);
    expect(player.querySelector('button[aria-label="Return to audio message"]')?.parentElement)
      .toBe(player);
    expect(player.querySelector('button[aria-label="Close audio player"]')?.parentElement)
      .toBe(player);
  });

  it("shows exact loading, buffering, paused, ended, and recoverable error states", () => {
    const { container } = renderNowPlaying();

    emit(snapshot({ revision: 2, status: "loading" }));
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Loading audio…");

    emit(snapshot({ revision: 3, status: "buffering", playWhenReady: true }));
    expect(container.querySelector(".audio-now-playing-status")?.textContent).toBe("Buffering…");
    expect(container.querySelector('button[aria-label="Pause audio"]')).not.toBeNull();

    emit(snapshot({ revision: 4, status: "paused" }));
    expect(container.querySelector(".audio-now-playing-status")?.textContent)
      .toBe("0:30 / 1:30");

    emit(snapshot({ revision: 5, status: "ended", position: 90 }));
    expect(container.querySelector(".audio-now-playing-status")?.textContent).toBe("Ended");
    expect(container.querySelector('button[aria-label="Replay audio"]')).not.toBeNull();

    emit(snapshot({ revision: 6, status: "error", error: "network" }));
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain("Audio couldn’t load. Check your connection and try again.");
    expect(container.querySelector('button[aria-label="Retry audio"]')).not.toBeNull();
  });

  it("restores exactly once without playing or seeking", async () => {
    const { container } = renderNowPlaying();
    emit(snapshot({ revision: 2 }));

    act(() => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Return to audio message"]')
        ?.click();
    });
    await settle();

    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledWith(identity);
    expect(backend.play).not.toHaveBeenCalled();
    expect(backend.seek).not.toHaveBeenCalled();
  });

  it("clears once, announces closure, and hands off focus after removal", async () => {
    const onFocusAfterClose = vi.fn();
    const { container } = renderNowPlaying({ onFocusAfterClose });
    emit(snapshot({ revision: 2 }));

    act(() => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Close audio player"]')
        ?.click();
    });
    await settle();

    expect(backend.clear).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".audio-now-playing")).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Audio player closed.");
    expect(onFocusAfterClose).toHaveBeenCalledTimes(1);
  });

  it("updates a single mounted surface in place when identity changes", () => {
    const { container } = renderNowPlaying();
    emit(snapshot({ revision: 2 }));
    const player = container.querySelector(".audio-now-playing");

    emit(snapshot({
      revision: 3,
      identity: { chatId: "chat-2", messageId: "message-2", fileId: "file-2" },
      title: "Second note.ogg",
    }));

    expect(container.querySelector(".audio-now-playing")).toBe(player);
    expect(container.querySelectorAll(".audio-now-playing")).toHaveLength(1);
    expect(container.querySelector(".audio-now-playing-title")?.textContent)
      .toBe("Second note.ogg");
  });
});
