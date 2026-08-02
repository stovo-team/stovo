import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FamilyFile } from "../api/files";
import { clearMediaBlobCache, seedMediaBlobCache } from "../mediaBlobCache";
import { videoPlaybackSession, type VideoIdentity } from "../videoPlaybackSession";
import { formatVideoTime, orientationStyle, VideoPlayer, type VideoPlayerProps } from "./VideoPlayer";

const { downloadFileBlobMock, createStreamingMediaUrlMock } = vi.hoisted(() => ({
  downloadFileBlobMock: vi.fn(),
  createStreamingMediaUrlMock: vi.fn(),
}));

vi.mock("../api/files", async () => {
  const actual = await vi.importActual<typeof import("../api/files")>("../api/files");
  return {
    ...actual,
    downloadFileBlob: downloadFileBlobMock,
    createStreamingMediaUrl: createStreamingMediaUrlMock,
  };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
let fullscreenElement: Element | null = null;
let objectUrlIndex = 0;
let createObjectURLMock: ReturnType<typeof vi.fn>;
let revokeObjectURLMock: ReturnType<typeof vi.fn>;

function familyFile(overrides: Partial<FamilyFile> = {}): FamilyFile {
  return {
    id: "file-1",
    familyId: "family-1",
    uploadedBy: "user-1",
    chatId: "chat-1",
    chatTitle: "Family",
    chatType: "family",
    accessScope: "chat",
    storageProvider: "local",
    originalName: "clip.mp4",
    mimeType: "video/mp4",
    sizeBytes: 1024,
    checksum: null,
    createdAt: "2026-07-22T00:00:00Z",
    deletedAt: null,
    isFavorite: false,
    ...overrides,
  };
}

function identity(overrides: Partial<VideoIdentity> = {}): VideoIdentity {
  return { chatId: "chat-1", messageId: "message-1", fileId: "file-1", ...overrides };
}

function playerProps(overrides: Partial<VideoPlayerProps> = {}): VideoPlayerProps {
  return {
    file: familyFile(),
    accessToken: "access-token",
    identity: identity(),
    autoplay: false,
    ...overrides,
  };
}

function renderPlayer(
  props = playerProps(),
  parentHandlers: { onClick?: () => void; onPointerDown?: () => void } = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<div {...parentHandlers}><VideoPlayer {...props} /></div>));
  return { root, container };
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function media(container: HTMLElement): HTMLVideoElement {
  const element = container.querySelector("video");
  if (!element) throw new Error("Expected one video element");
  return element;
}

function setMediaTiming(element: HTMLVideoElement, duration: number, currentTime: number): void {
  Object.defineProperty(element, "duration", { configurable: true, value: duration });
  Object.defineProperty(element, "currentTime", {
    configurable: true,
    writable: true,
    value: currentTime,
  });
}

beforeEach(() => {
  clearMediaBlobCache();
  createStreamingMediaUrlMock.mockReset().mockRejectedValue(new Error("stream unavailable"));
  downloadFileBlobMock.mockReset().mockImplementation(async (_token: string, fileId: string) => {
    const blob = new Blob(["video"], { type: "video/mp4" });
    seedMediaBlobCache(fileId, blob);
    return blob;
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("probably");
  objectUrlIndex = 0;
  createObjectURLMock = vi.fn(() => `blob:video-${++objectUrlIndex}`);
  revokeObjectURLMock = vi.fn();
  const NativeURL = globalThis.URL;
  vi.stubGlobal(
    "URL",
    Object.assign(class extends NativeURL {}, {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    }),
  );
  fullscreenElement = null;
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreenElement,
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: vi.fn(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    }),
  });
  videoPlaybackSession.reset();
});

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    act(() => root?.unmount());
  }
  document.body.replaceChildren();
  videoPlaybackSession.reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("VideoPlayer", () => {
  it("renders one media element and controls in the accessible contract order", async () => {
    const { container } = renderPlayer();
    await settle();
    const root = container.querySelector<HTMLElement>(".video-player");
    const controls = root?.querySelector(".video-player-controls");

    expect(root?.querySelectorAll("video")).toHaveLength(1);
    expect([...controls!.children].map((element) => element.getAttribute("data-control"))).toEqual([
      "play-pause",
      "seek",
      "time",
      "mute",
      "fullscreen",
    ]);
    expect(controls?.querySelector('button[aria-label="Play video"] svg')?.getAttribute("aria-hidden"))
      .toBe("true");
    expect(controls?.querySelector('input[aria-label="Seek video"]')).not.toBeNull();
    expect(controls?.querySelector('button[aria-label="Mute video"]')).not.toBeNull();
    expect(controls?.querySelector('button[aria-label="Enter fullscreen"]')).not.toBeNull();
  });

  it("announces loading and converts source, download, decode, and play failures to UI", async () => {
    let resolveDownload!: (blob: Blob) => void;
    downloadFileBlobMock.mockImplementationOnce(
      () => new Promise<Blob>((resolve) => { resolveDownload = resolve; }),
    );
    const { container } = renderPlayer();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Loading video");
    await settle();
    expect(resolveDownload).toEqual(expect.any(Function));
    await act(async () => {
      const blob = new Blob(["video"], { type: "video/mp4" });
      seedMediaBlobCache("file-1", blob);
      resolveDownload(blob);
    });
    await settle();
    const element = media(container);
    expect(element.src).toContain("blob:video-1");
    setMediaTiming(element, 60, 0);
    act(() => element.dispatchEvent(new Event("loadedmetadata")));
    expect(container.querySelector('[role="status"]')).toBeNull();

    act(() => element.dispatchEvent(new Event("error")));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be decoded");

    const playMock = vi.spyOn(element, "play").mockRejectedValueOnce(new Error("denied"));
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Play video"]')?.click());
    await settle();
    expect(playMock).toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Playback could not start");

    downloadFileBlobMock.mockRejectedValueOnce(new Error("network"));
    const second = renderPlayer(playerProps({ identity: identity({ messageId: "message-2", fileId: "file-missing" }), file: familyFile({ id: "file-missing" }) }));
    await settle();
    expect(second.container.querySelector('[role="alert"]')?.textContent).toContain("Video download failed");

    const invalid = renderPlayer(playerProps({ accessToken: "" }));
    expect(invalid.container.querySelector('[role="alert"]')?.textContent).toContain("Video source is unavailable");
    const unsupported = renderPlayer(playerProps({ file: familyFile({ mimeType: "application/pdf" }) }));
    expect(unsupported.container.querySelector('[role="alert"]')?.textContent).toContain("Unsupported video format");
  });

  it("activates, seeks, pauses, and mirrors mute through the shared session", async () => {
    const props = playerProps();
    const { container } = renderPlayer(props);
    await settle();
    const element = media(container);
    setMediaTiming(element, 125, 0);
    act(() => element.dispatchEvent(new Event("loadedmetadata")));

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Play video"]')?.click());
    await settle();
    act(() => element.dispatchEvent(new Event("playing")));
    expect(videoPlaybackSession.getSnapshot()?.identity).toEqual(props.identity);
    expect(container.querySelector('.video-player')?.getAttribute("data-session-active")).toBe("true");
    expect(container.querySelector('button[aria-label="Pause video"]')).not.toBeNull();

    const seek = container.querySelector<HTMLInputElement>('input[aria-label="Seek video"]')!;
    act(() => {
      seek.value = "200";
      seek.dispatchEvent(new Event("input", { bubbles: true }));
      seek.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(element.currentTime).toBe(125);

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Mute video"]')?.click());
    expect(element.muted).toBe(true);
    expect(container.querySelector('button[aria-label="Unmute video"]')).not.toBeNull();

    act(() => element.dispatchEvent(new Event("pause")));
    expect(videoPlaybackSession.getSnapshot(props.identity)?.playIntent).toBe(false);
    expect(formatVideoTime(Number.NaN)).toBe("0:00");
    expect(formatVideoTime(0)).toBe("0:00");
    expect(formatVideoTime(3661)).toBe("1:01:01");
  });

  it("awaits beforePlay before activating or playing initial and replayed video", async () => {
    let releaseBeforePlay!: () => void;
    const beforePlay = vi.fn(() => new Promise<void>((resolve) => { releaseBeforePlay = resolve; }));
    const { container } = renderPlayer(playerProps({ beforePlay }));
    await settle();
    const element = media(container);
    setMediaTiming(element, 60, 0);
    act(() => element.dispatchEvent(new Event("loadedmetadata")));
    const playMock = vi.spyOn(element, "play").mockResolvedValue(undefined);
    const playButton = container.querySelector<HTMLButtonElement>('button[aria-label="Play video"]')!;

    act(() => playButton.click());
    await settle();
    expect(beforePlay).toHaveBeenCalledTimes(1);
    expect(playMock).not.toHaveBeenCalled();
    expect(videoPlaybackSession.getSnapshot()).toBeNull();

    await act(async () => releaseBeforePlay());
    expect(playMock).toHaveBeenCalledTimes(1);
    act(() => element.dispatchEvent(new Event("playing")));
    act(() => element.dispatchEvent(new Event("ended")));

    act(() => playButton.click());
    await settle();
    expect(beforePlay).toHaveBeenCalledTimes(2);
    expect(playMock).toHaveBeenCalledTimes(1);
    await act(async () => releaseBeforePlay());
    expect(playMock).toHaveBeenCalledTimes(2);
  });

  it("shows the safe playback error when beforePlay rejects without playing video", async () => {
    const beforePlay = vi.fn().mockRejectedValue(new Error("audio pause failed"));
    const { container } = renderPlayer(playerProps({ beforePlay }));
    await settle();
    const element = media(container);
    setMediaTiming(element, 60, 0);
    act(() => element.dispatchEvent(new Event("loadedmetadata")));
    const playMock = vi.spyOn(element, "play").mockResolvedValue(undefined);

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Play video"]')?.click());
    await settle();

    expect(beforePlay).toHaveBeenCalledTimes(1);
    expect(playMock).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Playback could not start");
    expect(videoPlaybackSession.getSnapshot()).toBeNull();
  });

  it("uses the existing root and video node for fullscreen entry and exit", async () => {
    const { container } = renderPlayer();
    await settle();
    const root = container.querySelector<HTMLElement>(".video-player")!;
    const element = media(container);
    setMediaTiming(element, 120, 42);
    Object.defineProperty(root, "requestFullscreen", {
      configurable: true,
      value: vi.fn(async () => {
        fullscreenElement = root;
        document.dispatchEvent(new Event("fullscreenchange"));
      }),
    });

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Enter fullscreen"]')?.click());
    await settle();
    expect(root.requestFullscreen).toHaveBeenCalled();
    expect(container.querySelector("video")).toBe(element);
    expect(element.currentTime).toBe(42);
    expect(container.querySelector('button[aria-label="Exit fullscreen"]')).not.toBeNull();

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Exit fullscreen"]')?.click());
    await settle();
    expect(document.exitFullscreen).toHaveBeenCalled();
    expect(container.querySelector("video")).toBe(element);

    vi.mocked(root.requestFullscreen).mockRejectedValueOnce(new Error("denied"));
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Enter fullscreen"]')?.click());
    await settle();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Fullscreen request was denied",
    );
    expect(container.querySelector("video")).toBe(element);
  });

  it("isolates pointer and click gestures while retaining native controls", async () => {
    const onClick = vi.fn();
    const onPointerDown = vi.fn();
    const { container } = renderPlayer(playerProps(), { onClick, onPointerDown });
    await settle();
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Play video"]')!;
    const pointerEvent = new Event("pointerdown", { bubbles: true, cancelable: true });
    act(() => button.dispatchEvent(pointerEvent));
    act(() => button.click());
    await settle();

    expect(onPointerDown).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    expect(button.type).toBe("button");
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Seek video"]')?.type).toBe("range");
  });

  it("keeps the active source when a superseded download resolves late", async () => {
    let resolveFirst!: (blob: Blob) => void;
    downloadFileBlobMock
      .mockImplementationOnce(
        () => new Promise<Blob>((resolve) => { resolveFirst = resolve; }),
      )
      .mockImplementationOnce(async (_token: string, fileId: string) => {
        const blob = new Blob(["second"], { type: "video/mp4" });
        seedMediaBlobCache(fileId, blob);
        return blob;
      });
    const initial = playerProps();
    const { root, container } = renderPlayer(initial);
    await settle();
    expect(resolveFirst).toEqual(expect.any(Function));

    const replacement = playerProps({
      file: familyFile({ id: "file-2", originalName: "replacement.mp4" }),
      identity: identity({ fileId: "file-2" }),
    });
    act(() => root.render(<VideoPlayer {...replacement} />));
    await settle();
    expect(media(container).src).toContain("blob:video-");

    const activeSrc = media(container).src;
    await act(async () => {
      const blob = new Blob(["first"], { type: "video/mp4" });
      seedMediaBlobCache("file-1", blob);
      resolveFirst(blob);
    });
    await settle();
    // Superseded download for file-1 must not replace the active file-2 source.
    expect(media(container).src).toBe(activeSrc);

    act(() => root.unmount());
    roots.splice(roots.indexOf(root), 1);
  });

  it("sizes portrait videos to the landscape bubble width without a landscape height cap", async () => {
    expect(orientationStyle(720, 1280)).toMatchObject({
      aspectRatio: "720 / 1280",
      width: "100%",
      maxWidth: "100%",
      maxHeight: "none",
      height: "auto",
    });
    expect(orientationStyle(1920, 1080)).toMatchObject({
      aspectRatio: "1920 / 1080",
      width: "100%",
      maxHeight: "min(56vh, 420px)",
    });

    const { container } = renderPlayer();
    await settle();
    const element = media(container);
    setMediaTiming(element, 30, 0);
    Object.defineProperty(element, "videoWidth", { configurable: true, value: 720 });
    Object.defineProperty(element, "videoHeight", { configurable: true, value: 1280 });
    act(() => element.dispatchEvent(new Event("loadedmetadata")));

    const portraitRoot = container.querySelector<HTMLElement>(".video-player")!;
    expect(portraitRoot.classList.contains("is-portrait")).toBe(true);
    expect(portraitRoot.classList.contains("is-landscape")).toBe(false);
    expect(portraitRoot.style.width).toBe("100%");
    expect(portraitRoot.style.maxHeight).toBe("none");
    expect(portraitRoot.style.getPropertyValue("--video-aspect-ratio").trim()).toBe("720 / 1280");

    Object.defineProperty(element, "videoWidth", { configurable: true, value: 1920 });
    Object.defineProperty(element, "videoHeight", { configurable: true, value: 1080 });
    act(() => element.dispatchEvent(new Event("loadedmetadata")));

    const landscapeRoot = container.querySelector<HTMLElement>(".video-player")!;
    expect(landscapeRoot.classList.contains("is-landscape")).toBe(true);
    expect(landscapeRoot.classList.contains("is-portrait")).toBe(false);
    expect(landscapeRoot.style.width).toBe("100%");
    expect(landscapeRoot.style.getPropertyValue("--video-aspect-ratio").trim()).toBe("1920 / 1080");
  });

  it("autoplays muted when visible and pauses when scrolled away", async () => {
    type ObserverCallback = IntersectionObserverCallback;
    const observers: Array<{ callback: ObserverCallback; disconnect: ReturnType<typeof vi.fn> }> = [];
    class FakeIntersectionObserver {
      readonly callback: ObserverCallback;
      readonly disconnect = vi.fn();
      constructor(callback: ObserverCallback) {
        this.callback = callback;
        observers.push({ callback, disconnect: this.disconnect });
      }
      observe() {
        // Initial delivery: not visible yet.
        this.callback(
          [{ isIntersecting: false, intersectionRatio: 0 } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      unobserve() {}
      takeRecords() { return []; }
    }
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);

    const { container } = renderPlayer(playerProps({ autoplay: true }));
    await settle();
    const element = media(container);
    setMediaTiming(element, 12, 0);
    Object.defineProperty(element, "videoWidth", { configurable: true, value: 1280 });
    Object.defineProperty(element, "videoHeight", { configurable: true, value: 720 });
    act(() => element.dispatchEvent(new Event("loadedmetadata")));
    await settle();

    expect(observers.length).toBeGreaterThan(0);
    expect(element.play).not.toHaveBeenCalled();

    act(() => {
      observers[0]?.callback(
        [{ isIntersecting: true, intersectionRatio: 0.8 } as IntersectionObserverEntry],
        observers[0] as unknown as IntersectionObserver,
      );
    });
    await settle();
    expect(element.muted).toBe(true);
    expect(element.play).toHaveBeenCalled();

    const playCalls = (element.play as ReturnType<typeof vi.fn>).mock.calls.length;
    act(() => {
      observers[0]?.callback(
        [{ isIntersecting: false, intersectionRatio: 0 } as IntersectionObserverEntry],
        observers[0] as unknown as IntersectionObserver,
      );
    });
    await settle();
    expect(element.pause).toHaveBeenCalled();
    expect((element.play as ReturnType<typeof vi.fn>).mock.calls.length).toBe(playCalls);
  });

  it("pauses and exposes a call-priority reason when disabled", async () => {
    const { container } = renderPlayer(playerProps({ disabledReason: "Active calls have priority" }));
    await settle();
    const element = media(container);
    expect(element.pause).toHaveBeenCalled();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Active calls have priority");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Play video"]')?.disabled).toBe(true);
  });

  it("plays audio only in the expanded lightbox, not the inline tile", async () => {
    const { container } = renderPlayer(playerProps({ autoplay: true }));
    await settle();
    const inline = media(container);
    setMediaTiming(inline, 12, 0);
    Object.defineProperty(inline, "videoWidth", { configurable: true, value: 1280 });
    Object.defineProperty(inline, "videoHeight", { configurable: true, value: 720 });
    act(() => inline.dispatchEvent(new Event("loadedmetadata")));
    await settle();

    const playMock = inline.play as ReturnType<typeof vi.fn>;
    const pauseMock = inline.pause as ReturnType<typeof vi.fn>;
    playMock.mockClear();
    pauseMock.mockClear();

    act(() => container.querySelector<HTMLElement>(".video-player")?.click());
    await settle();

    const videos = document.querySelectorAll("video");
    expect(videos).toHaveLength(2);
    const expanded = videos[1] as HTMLVideoElement;
    const expandedPlayMock = vi.spyOn(expanded, "play").mockResolvedValue(undefined);
    act(() => expanded.dispatchEvent(new Event("loadedmetadata")));
    await settle();

    expect(pauseMock).toHaveBeenCalled();
    expect(inline.muted).toBe(true);
    expect(expanded.muted).toBe(false);
    expect(expandedPlayMock).toHaveBeenCalled();

    act(() => document.querySelector<HTMLButtonElement>('button[aria-label="Close video"]')?.click());
    await settle();
    expect(expanded.pause).toHaveBeenCalled();
    expect(document.querySelector(".video-player-lightbox")).toBeNull();
  });
});
