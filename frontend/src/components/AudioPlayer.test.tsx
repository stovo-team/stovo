import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AudioPlaybackSession,
  type AudioDescriptor,
  type AudioPlaybackBackend,
  type AudioPlaybackSnapshot,
  type AudioPlaybackSource,
  type AudioSourceFactory,
} from "../audioPlaybackSession";
import { AudioPlayer, formatAudioTime } from "./AudioPlayer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const descriptor: AudioDescriptor = {
  identity: { chatId: "chat-1", messageId: "message-1", fileId: "file-1" },
  title: "Family note.mp3",
};

function snapshot(
  overrides: Partial<AudioPlaybackSnapshot> = {},
): AudioPlaybackSnapshot {
  return {
    identity: descriptor.identity,
    title: descriptor.title,
    position: 12,
    duration: 75,
    bufferedPosition: 40,
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
let sourceFactory: ReturnType<typeof vi.fn<AudioSourceFactory>>;
let session: AudioPlaybackSession;

function renderPlayer(
  props: Partial<React.ComponentProps<typeof AudioPlayer>> = {},
  parentHandlers: {
    onClick?: () => void;
    onPointerDown?: () => void;
    onContextMenu?: () => void;
    onKeyDown?: () => void;
  } = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(
      <div {...parentHandlers}>
        <AudioPlayer
          descriptor={descriptor}
          sourceFactory={sourceFactory}
          session={session}
          {...props}
        />
      </div>,
    );
  });
  return { container, root };
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function emit(value: AudioPlaybackSnapshot): void {
  act(() => backend.emit(value));
}

beforeEach(() => {
  backend = new FakeBackend();
  sourceFactory = vi.fn(async (): Promise<AudioPlaybackSource> => ({
    url: "blob:audio",
    objectUrl: true,
  }));
  session = new AudioPlaybackSession(backend, sourceFactory);
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

describe("AudioPlayer", () => {
  it("renders exact controls, time formats, active identity, and seek semantics", () => {
    const { container } = renderPlayer();
    const player = container.querySelector<HTMLElement>(".audio-player")!;
    const controls = container.querySelector(".audio-player-controls")!;

    expect(controls.querySelector('[data-control="play-pause"]')).not.toBeNull();
    expect(controls.querySelector('[data-control="seek"]')).not.toBeNull();
    expect(controls.querySelector('[data-control="time"]')).not.toBeNull();
    expect(controls.querySelector('[data-control="playing-indicator"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Play audio"]')?.getAttribute("title"))
      .toBe("Play audio");
    expect(player.getAttribute("data-session-active")).toBe("false");
    expect(container.querySelector("audio")).toBeNull();

    emit(snapshot({ revision: 2 }));
    const seek = container.querySelector<HTMLInputElement>('input[aria-label="Seek audio"]')!;
    expect(player.getAttribute("data-session-active")).toBe("true");
    expect(seek.min).toBe("0");
    expect(seek.max).toBe("75");
    expect(seek.step).toBe("1");
    expect(seek.value).toBe("12");
    expect(seek.getAttribute("aria-valuetext")).toBe(
      "12 seconds elapsed of 1 minute 15 seconds",
    );
    expect(container.querySelector('output[aria-label="Audio time"]')?.textContent)
      .toBe("0:12 / 1:15");

    expect(formatAudioTime(Number.NaN)).toBe("–:––");
    expect(formatAudioTime(7)).toBe("0:07");
    expect(formatAudioTime(3661)).toBe("1:01:01");
  });

  it("renders exact loading, buffering, interruption, call, error, retry, and replay states", () => {
    const { container, root } = renderPlayer();

    emit(snapshot({ revision: 2, status: "loading", duration: 0, canSeek: false }));
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Loading audio…");
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Seek audio"]')?.disabled)
      .toBe(true);
    // Loading must not permanently disable replay — eternal loading used to trap the button.
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Play audio"]')?.disabled)
      .toBe(false);

    emit(snapshot({
      revision: 3,
      status: "buffering",
      playWhenReady: true,
      isPlaying: false,
    }));
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Buffering…");
    expect(container.querySelector('button[aria-label="Pause audio"]')).not.toBeNull();
    expect(container.querySelector(".audio-player-eq.is-active")).not.toBeNull();
    expect(container.querySelector(".audio-player")?.getAttribute("data-playing")).toBe("true");

    emit(snapshot({
      revision: 4,
      status: "suppressed",
      suppressionReason: "focus",
    }));
    expect(container.querySelector('[role="status"]')?.textContent)
      .toBe("Playback paused by another app.");

    act(() => {
      root.render(
        <AudioPlayer
          descriptor={descriptor}
          sourceFactory={sourceFactory}
          session={session}
          disabledReason="call-active"
        />,
      );
    });
    expect(container.querySelector('[role="status"]')?.textContent)
      .toBe("Audio is paused while a call is active.");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Play audio"]')?.disabled)
      .toBe(true);

    act(() => {
      root.render(
        <AudioPlayer
          descriptor={descriptor}
          sourceFactory={sourceFactory}
          session={session}
        />,
      );
    });
    emit(snapshot({
      revision: 5,
      status: "error",
      error: "network",
    }));
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain("Audio couldn’t load. Check your connection and try again.");
    expect(container.querySelector('button[aria-label="Retry audio"]')).not.toBeNull();

    emit(snapshot({
      revision: 6,
      status: "error",
      error: "authorization",
    }));
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toBe("This audio message is no longer available.");
    expect(container.querySelector('button[aria-label="Retry audio"]')).toBeNull();

    emit(snapshot({ revision: 7, status: "ended", position: 75 }));
    expect(container.querySelector('button[aria-label="Replay audio"]')).not.toBeNull();
    expect(container.querySelector(".audio-player.is-ended")).not.toBeNull();
  });

  it("replays after natural end without staying stuck on loading", async () => {
    const { container } = renderPlayer();
    emit(snapshot({
      revision: 2,
      status: "ended",
      position: 75,
      duration: 75,
      platform: "web",
    }));

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Replay audio"]')?.click());
    await settle();

    expect(backend.load).not.toHaveBeenCalled();
    expect(backend.seek).toHaveBeenCalledWith(0);
    expect(backend.play).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().status).not.toBe("loading");
  });

  it("loads only on explicit play, runs arbitration first, and has no mount lifecycle effects", async () => {
    const onBeforePlay = vi.fn(async () => undefined);
    const { container, root } = renderPlayer({ onBeforePlay });

    expect(sourceFactory).not.toHaveBeenCalled();
    expect(backend.load).not.toHaveBeenCalled();
    expect(backend.play).not.toHaveBeenCalled();
    expect(backend.seek).not.toHaveBeenCalled();
    expect(backend.clear).not.toHaveBeenCalled();

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Play audio"]')?.click());
    await settle();
    expect(onBeforePlay).toHaveBeenCalledTimes(1);
    expect(sourceFactory).toHaveBeenCalledWith(descriptor);
    expect(backend.load).toHaveBeenCalledTimes(1);
    expect(backend.play).toHaveBeenCalledTimes(1);
    expect(onBeforePlay.mock.invocationCallOrder[0]).toBeLessThan(
      backend.load.mock.invocationCallOrder[0],
    );

    act(() => root.unmount());
    roots.splice(roots.indexOf(root), 1);
    expect(backend.pause).not.toHaveBeenCalled();
    expect(backend.clear).not.toHaveBeenCalled();
  });

  it("previews pointer seeks, commits once on release, and commits keyboard changes immediately", async () => {
    const { container } = renderPlayer();
    emit(snapshot({ revision: 2, duration: 100, position: 10 }));
    const seek = container.querySelector<HTMLInputElement>('input[aria-label="Seek audio"]')!;

    act(() => seek.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    act(() => {
      seek.value = "70";
      seek.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector('output[aria-label="Audio time"]')?.textContent)
      .toBe("1:10 / 1:40");
    expect(backend.seek).not.toHaveBeenCalled();

    act(() => seek.dispatchEvent(new Event("pointerup", { bubbles: true })));
    await settle();
    expect(backend.seek).toHaveBeenCalledTimes(1);
    expect(backend.seek).toHaveBeenLastCalledWith(70);

    act(() => {
      seek.value = "140";
      seek.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(backend.seek).toHaveBeenCalledTimes(2);
    expect(backend.seek).toHaveBeenLastCalledWith(100);
  });

  it("isolates message gestures while preserving native keyboard focus across icon swaps", async () => {
    const parentHandlers = {
      onClick: vi.fn(),
      onPointerDown: vi.fn(),
      onContextMenu: vi.fn(),
      onKeyDown: vi.fn(),
    };
    const { container } = renderPlayer({}, parentHandlers);
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Play audio"]')!;
    button.focus();

    act(() => button.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    act(() => button.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })));
    act(() => button.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      key: "Enter",
    })));
    act(() => button.click());
    await settle();

    expect(parentHandlers.onPointerDown).not.toHaveBeenCalled();
    expect(parentHandlers.onContextMenu).not.toHaveBeenCalled();
    expect(parentHandlers.onKeyDown).not.toHaveBeenCalled();
    expect(parentHandlers.onClick).not.toHaveBeenCalled();

    emit(snapshot({
      revision: 2,
      status: "playing",
      isPlaying: true,
      playWhenReady: true,
    }));
    expect(container.querySelector('button[aria-label="Pause audio"]')).toBe(button);
    expect(document.activeElement).toBe(button);
  });

  it("keeps progress non-live and does not recreate an alert for unrelated revisions", () => {
    const { container } = renderPlayer();
    emit(snapshot({ revision: 2, status: "error", error: "decode" }));
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Audio couldn’t be played. Try again.");
    expect(container.querySelector('button[aria-label="Retry audio"]')).not.toBeNull();

    emit(snapshot({
      revision: 3,
      status: "error",
      error: "decode",
      position: 13,
    }));
    expect(container.querySelector('[role="alert"]')).toBe(alert);
    expect(container.querySelector('output[aria-label="Audio time"]')?.hasAttribute("aria-live"))
      .toBe(false);
  });
});
