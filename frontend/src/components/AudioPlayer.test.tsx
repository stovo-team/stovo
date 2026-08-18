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
import { clearCachedAudioDuration, setCachedAudioDuration } from "../audioDurationCache";
import { AudioPlayer, formatAudioTime } from "./AudioPlayer";

const mockGetFileTranscript = vi.fn();
const mockTranscribeFile = vi.fn();

vi.mock("../api/files", () => ({
  getFileTranscript: (...args: unknown[]) => mockGetFileTranscript(...args),
  transcribeFile: (...args: unknown[]) => mockTranscribeFile(...args),
}));

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
  mockGetFileTranscript.mockReset().mockResolvedValue(null);
  mockTranscribeFile.mockReset().mockResolvedValue({ fileId: "file-1", text: "Transcribed voice message text" });
});

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    act(() => root?.unmount());
  }
  session.destroy();
  clearCachedAudioDuration();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("AudioPlayer", () => {
  it("shows elapsed and total duration before the session is attached", () => {
    setCachedAudioDuration(descriptor.identity.fileId, 125);
    const { container } = renderPlayer();
    const seek = container.querySelector<HTMLElement>('[data-control="seek"]');

    expect(seek?.getAttribute("data-idle")).toBe("true");
    expect(seek?.querySelector<HTMLElement>(".audio-player-wave-fill")?.style.width)
      .toBe("0%");
    expect(container.querySelector('output[aria-label="Audio time"]')?.textContent)
      .toBe("0:00 / 2:05");
    expect(container.querySelector(".audio-player")?.getAttribute("data-session-active"))
      .toBe("false");
  });

  it("loads metadata duration before playback begins", async () => {
    const listeners = new Map<string, EventListener>();
    const element = {
      preload: "",
      duration: 91,
      src: "",
      addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
      removeAttribute: vi.fn(),
      load: vi.fn(),
    };
    function AudioMock(this: typeof element) {
      Object.assign(this, element);
      return this;
    }
    vi.stubGlobal("Audio", AudioMock as unknown as typeof Audio);
    const resolveDurationUrl = vi.fn(async () => "blob:audio-metadata");

    const { container } = renderPlayer({ resolveDurationUrl });
    await settle();
    listeners.get("loadedmetadata")?.(new Event("loadedmetadata"));
    await settle();

    expect(resolveDurationUrl).toHaveBeenCalledTimes(1);
    expect(sourceFactory).not.toHaveBeenCalled();
    expect(container.querySelector('output[aria-label="Audio time"]')?.textContent)
      .toBe("0:00 / 1:31");
    vi.unstubAllGlobals();
  });

  it("omits the title for recorder-originated audio", () => {
    const { container } = renderPlayer({ hideTitle: true });

    expect(container.querySelector(".audio-player-title")).toBeNull();
    expect(container.querySelector('output[aria-label="Audio time"]')).not.toBeNull();
  });

  it("keeps the title for uploaded audio files", () => {
    const { container } = renderPlayer();

    expect(container.querySelector(".audio-player-title")?.textContent).toBe("Family note.mp3");
  });

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
    expect(container.querySelector('input[aria-label="Seek audio"]')).toBeNull();

    emit(snapshot({ revision: 2 }));
    const seek = container.querySelector<HTMLElement>('[data-control="seek"]')!;
    expect(player.getAttribute("data-session-active")).toBe("true");
    expect(seek.getAttribute("role")).toBe("slider");
    expect(seek.getAttribute("aria-valuemin")).toBe("0");
    expect(seek.getAttribute("aria-valuemax")).toBe("75");
    expect(seek.getAttribute("aria-valuenow")).toBe("12");
    expect(seek.getAttribute("aria-valuetext")).toBe(
      "12 seconds elapsed of 1 minute 15 seconds",
    );
    expect(container.querySelector('output[aria-label="Audio time"]')?.textContent)
      .toBe("0:12 / 1:15");

    expect(formatAudioTime(Number.NaN)).toBe("–:––");
    expect(formatAudioTime(7)).toBe("0:07");
    expect(formatAudioTime(3661)).toBe("1:01:01");
  });

  it("renders exact loading, buffering, interruption, call, and error states", () => {
    const { container, root } = renderPlayer();

    emit(snapshot({ revision: 2, status: "loading", duration: 0, canSeek: false }));
    // Loading is indicated on the play button — no permanent status strip.
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector(".audio-player-play-pause.is-loading")).not.toBeNull();
    expect(container.querySelector<HTMLElement>('[data-control="seek"]')?.getAttribute("aria-disabled"))
      .toBe("true");
    // Loading must not permanently disable replay — eternal loading used to trap the button.
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Play audio"]')?.disabled)
      .toBe(false);

    emit(snapshot({
      revision: 3,
      status: "buffering",
      playWhenReady: true,
      isPlaying: false,
    }));
    expect(container.querySelector('[role="status"]')).toBeNull();
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

  });

  it("resets to an unplayed audio control when playback ends", async () => {
    const { container } = renderPlayer();

    emit(snapshot({ revision: 2, status: "ended", position: 75, duration: 75 }));
    await settle();

    expect(backend.clear).toHaveBeenCalledTimes(1);
    expect(container.querySelector('button[aria-label="Replay audio"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Play audio"]')).not.toBeNull();
    expect(container.querySelector(".audio-player")?.getAttribute("data-session-active"))
      .toBe("false");
  });

  it("shows pause chrome optimistically on tap and reloads when stuck loading", async () => {
    const { container } = renderPlayer();

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Play audio"]')?.click());
    expect(container.querySelector('button[aria-label="Pause audio"]')).not.toBeNull();
    expect(container.querySelector(".audio-player-eq.is-active")).not.toBeNull();
    await settle();

    emit(snapshot({ revision: 2, status: "loading", duration: 0, canSeek: false, position: 0 }));
    expect(container.querySelector('button[aria-label="Pause audio"]')).not.toBeNull();

    backend.load.mockClear();
    backend.play.mockClear();

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Pause audio"]')?.click());
    await settle();

    // Second tap while stuck on loading recovers via reload, not pause.
    expect(backend.pause).not.toHaveBeenCalled();
    expect(backend.load).toHaveBeenCalled();
    expect(backend.play).toHaveBeenCalled();
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
    const seek = container.querySelector<HTMLElement>('[data-control="seek"]')!;
    Object.defineProperty(seek, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100, top: 0, height: 18, right: 100, bottom: 18, x: 0, y: 0, toJSON: () => ({}) }),
    });

    act(() => {
      seek.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 70,
        pointerId: 1,
      }));
    });
    expect(container.querySelector('output[aria-label="Audio time"]')?.textContent)
      .toBe("1:10 / 1:40");
    expect(backend.seek).not.toHaveBeenCalled();

    act(() => {
      seek.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        clientX: 70,
        pointerId: 1,
      }));
    });
    await settle();
    expect(backend.seek).toHaveBeenCalledTimes(1);
    expect(backend.seek).toHaveBeenLastCalledWith(70);

    act(() => {
      seek.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        key: "End",
      }));
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

  it("renders transcribe button when accessToken is provided and handles transcription", async () => {
    const { container } = renderPlayer({ accessToken: "token-123" });
    const transcribeBtn = container.querySelector<HTMLButtonElement>(".audio-player-transcribe-btn");
    expect(transcribeBtn).not.toBeNull();
    expect(transcribeBtn?.textContent).toContain("Transcribe");

    // Click transcribe button
    act(() => transcribeBtn?.click());
    await settle();

    expect(mockTranscribeFile).toHaveBeenCalledWith("token-123", "file-1");

    // Transcript box is shown with transcribed text
    const transcriptBox = container.querySelector(".audio-player-transcript");
    expect(transcriptBox).not.toBeNull();
    expect(container.querySelector('[data-control="transcript-text"]')?.textContent)
      .toBe("Transcribed voice message text");

    // Button text updates to "Hide Text"
    expect(container.querySelector(".audio-player-transcribe-btn")?.textContent).toContain("Hide Text");

    // Toggle dropdown shrink
    const toggleBtn = container.querySelector<HTMLButtonElement>(".audio-player-transcript-toggle");
    expect(toggleBtn).not.toBeNull();
    act(() => toggleBtn?.click());
    await settle();

    // Transcript content is collapsed
    expect(container.querySelector('[data-control="transcript-text"]')).toBeNull();
    expect(container.querySelector(".audio-player-transcribe-btn")?.textContent).toContain("Show Text");

    // Toggle dropdown expand again
    act(() => toggleBtn?.click());
    await settle();
    expect(container.querySelector('[data-control="transcript-text"]')?.textContent)
      .toBe("Transcribed voice message text");
  });

  it("handles transcription errors and allows retry", async () => {
    mockTranscribeFile.mockRejectedValueOnce(new Error("Groq API rate limited"));
    const { container } = renderPlayer({ accessToken: "token-123" });
    const transcribeBtn = container.querySelector<HTMLButtonElement>(".audio-player-transcribe-btn");

    act(() => transcribeBtn?.click());
    await settle();

    const errorEl = container.querySelector(".audio-player-transcript-error");
    expect(errorEl).not.toBeNull();
    expect(errorEl?.textContent).toContain("Groq API rate limited");

    // Retry
    mockTranscribeFile.mockResolvedValueOnce({ fileId: "file-1", text: "Recovered transcription text" });
    const retryBtn = container.querySelector<HTMLButtonElement>(".audio-player-transcript-retry");
    expect(retryBtn).not.toBeNull();
    act(() => retryBtn?.click());
    await settle();

    expect(container.querySelector('[data-control="transcript-text"]')?.textContent)
      .toBe("Recovered transcription text");
  });

  it("loads cached transcript on mount if available", async () => {
    mockGetFileTranscript.mockResolvedValueOnce({ fileId: "file-1", text: "Pre-existing transcript" });
    const { container } = renderPlayer({ accessToken: "token-123" });
    await settle();

    expect(container.querySelector('[data-control="transcript-text"]')?.textContent)
      .toBe("Pre-existing transcript");
  });
});

