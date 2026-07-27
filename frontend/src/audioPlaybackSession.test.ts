import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AudioPlaybackSession,
  WebAudioPlaybackBackend,
  sameAudioIdentity,
  type AudioDescriptor,
  type AudioPlaybackBackend,
  type AudioPlaybackSnapshot,
  type AudioPlaybackSource,
  type AudioSourceFactory,
} from "./audioPlaybackSession";

const firstDescriptor: AudioDescriptor = {
  identity: { chatId: "chat|one", messageId: "message/two", fileId: "file%2Fthree" },
  title: "Family recording.mp3",
};

function backendSnapshot(
  update: Partial<AudioPlaybackSnapshot> = {},
): AudioPlaybackSnapshot {
  return {
    identity: firstDescriptor.identity,
    title: firstDescriptor.title,
    position: 0,
    duration: 0,
    bufferedPosition: 0,
    status: "ready",
    playWhenReady: false,
    isPlaying: false,
    suppressionReason: null,
    canSeek: false,
    error: null,
    revision: 1,
    platform: "web",
    ...update,
  };
}

class FakeBackend implements AudioPlaybackBackend {
  snapshot = backendSnapshot({ identity: null, title: "", status: "idle", revision: 0 });
  listeners = new Set<(snapshot: AudioPlaybackSnapshot) => void>();
  calls: string[] = [];

  connect = vi.fn(async () => {
    this.calls.push("connect");
  });

  getSnapshot = vi.fn(() => this.snapshot);

  subscribe(listener: (snapshot: AudioPlaybackSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  load = vi.fn(
    async (descriptor: AudioDescriptor, _source: AudioPlaybackSource, position: number) => {
      this.calls.push(`load:${descriptor.identity.fileId}:${position}`);
      this.emit(
        backendSnapshot({
          identity: descriptor.identity,
          title: descriptor.title,
          position,
          status: "ready",
          revision: this.snapshot.revision + 1,
        }),
      );
    },
  );

  play = vi.fn(async () => {
    this.calls.push("play");
  });

  pause = vi.fn(async () => {
    this.calls.push("pause");
  });

  seek = vi.fn(async (position: number) => {
    this.calls.push(`seek:${position}`);
  });

  clear = vi.fn(async () => {
    this.calls.push("clear");
  });

  setCallActive = vi.fn(async (active: boolean) => {
    this.calls.push(`call:${active}`);
  });

  emit(snapshot: AudioPlaybackSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

describe("AudioPlaybackSession", () => {
  let backend: FakeBackend;
  let sourceFactory: ReturnType<typeof vi.fn<AudioSourceFactory>>;
  let session: AudioPlaybackSession;

  beforeEach(() => {
    backend = new FakeBackend();
    sourceFactory = vi.fn(async (descriptor: AudioDescriptor) => ({
      url: `blob:${descriptor.identity.fileId}`,
      objectUrl: true,
    }));
    session = new AudioPlaybackSession(backend, sourceFactory);
  });

  it("compares structured opaque identities field by field", () => {
    const cases = [
      [{ chatId: "a|b", messageId: "c", fileId: "d" }, { chatId: "a", messageId: "b|c", fileId: "d" }],
      [{ chatId: "ÑÐ°Ñ/å®¶", messageId: "%2F", fileId: "x|y" }, { chatId: "ÑÐ°Ñ/å®¶", messageId: "/", fileId: "x|y" }],
    ] as const;

    expect(sameAudioIdentity(firstDescriptor.identity, { ...firstDescriptor.identity })).toBe(true);
    cases.forEach(([left, right]) => expect(sameAudioIdentity(left, right)).toBe(false));
    expect(sameAudioIdentity(null, null)).toBe(false);
  });

  it("silences and clears the former owner before loading or playing a replacement", async () => {
    await session.load(firstDescriptor);
    await session.play();
    backend.calls.length = 0;

    const second: AudioDescriptor = {
      identity: { chatId: "chat|one", messageId: "message/two", fileId: "next" },
      title: "Next.ogg",
    };
    await session.load(second);

    expect(backend.calls).toEqual(["pause", "clear", "load:next:0"]);
    expect(backend.play).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().identity).toEqual(second.identity);
  });

  it("normalizes timing, separates intent from playback, and rejects stale revisions", async () => {
    await session.load(firstDescriptor);
    backend.emit(
      backendSnapshot({
        position: 900,
        duration: 120,
        bufferedPosition: Number.POSITIVE_INFINITY,
        playWhenReady: true,
        isPlaying: false,
        status: "buffering",
        revision: 20,
      }),
    );

    const accepted = session.getSnapshot();
    expect(accepted).toMatchObject({
      position: 120,
      duration: 120,
      bufferedPosition: 0,
      playWhenReady: true,
      isPlaying: false,
      status: "buffering",
    });
    expect(Object.isFrozen(accepted)).toBe(true);
    expect(Object.isFrozen(accepted.identity)).toBe(true);

    backend.emit(backendSnapshot({ position: 1, duration: 5, revision: 20 }));
    backend.emit(backendSnapshot({ position: 2, duration: 5, revision: 19 }));
    expect(session.getSnapshot()).toEqual(accepted);

    await session.seek(Number.POSITIVE_INFINITY);
    await session.seek(-50);
    expect(backend.seek).toHaveBeenLastCalledWith(0);
  });

  it("survives view detach/navigation and reconnects to newer native state without reloading", async () => {
    await session.load(firstDescriptor);
    backend.load.mockClear();
    backend.play.mockClear();
    backend.snapshot = backendSnapshot({ position: 33, duration: 80, revision: 50, platform: "android" });

    await session.connect();
    await session.connect();

    expect(session.getSnapshot()).toMatchObject({ position: 33, duration: 80, platform: "android" });
    expect(backend.connect).toHaveBeenCalledTimes(1);
    expect(backend.load).not.toHaveBeenCalled();
    expect(backend.play).not.toHaveBeenCalled();
  });

  it("uses only the current in-memory source factory when the app configures authenticated playback", async () => {
    const configuredFactory = vi.fn<AudioSourceFactory>(async (descriptor) => ({
      url: `https://media.example/${descriptor.identity.fileId}`,
      token: "live-only-token"
    }));

    session.setSourceFactory(configuredFactory);
    await session.load(firstDescriptor);

    expect(configuredFactory).toHaveBeenCalledWith(firstDescriptor);
    expect(backend.load).toHaveBeenLastCalledWith(
      firstDescriptor,
      { url: "https://media.example/file%2Fthree", token: "live-only-token" },
      0
    );
    expect(JSON.stringify(session.getSnapshot())).not.toContain("live-only-token");
  });

  it("retains position through video and call suppression without auto-resuming", async () => {
    await session.load(firstDescriptor);
    backend.emit(backendSnapshot({ position: 41, duration: 90, isPlaying: true, playWhenReady: true, status: "playing", revision: 12 }));

    await session.pauseForVideo();
    expect(session.getSnapshot()).toMatchObject({
      position: 41,
      suppressionReason: "video",
      playWhenReady: false,
      isPlaying: false,
    });

    await session.setCallActive(true);
    await session.setCallActive(false);
    expect(backend.setCallActive).toHaveBeenNthCalledWith(1, true);
    expect(backend.setCallActive).toHaveBeenNthCalledWith(2, false);
    expect(backend.play).not.toHaveBeenCalled();
    expect(session.getSnapshot().suppressionReason).toBeNull();
  });

  it("keeps end and retry context but clears every terminal/account path", async () => {
    await session.load(firstDescriptor);
    backend.emit(backendSnapshot({ position: 90, duration: 90, status: "ended", revision: 10 }));
    expect(session.getSnapshot()).toMatchObject({ identity: firstDescriptor.identity, status: "ended" });

    backend.emit(
      backendSnapshot({
        position: 52,
        duration: 90,
        status: "error",
        error: "network",
        revision: 11,
      }),
    );
    await session.retry();
    expect(sourceFactory).toHaveBeenLastCalledWith(firstDescriptor);
    expect(backend.load).toHaveBeenLastCalledWith(
      firstDescriptor,
      expect.any(Object),
      52,
    );

    for (const reason of ["close", "logout", "user-switch", "authorization"] as const) {
      await session.clear(reason);
      expect(session.getSnapshot()).toMatchObject({ identity: null, status: "idle" });
      await session.load(firstDescriptor);
    }
    expect(backend.clear).toHaveBeenCalledTimes(4);
  });

  it("rewinds Android playback after a natural end without tearing down the session", async () => {
    await session.load(firstDescriptor);
    backend.emit(
      backendSnapshot({
        position: 90,
        duration: 90,
        status: "ended",
        revision: 20,
        platform: "android",
      }),
    );
    expect(session.getSnapshot()).toMatchObject({
      identity: firstDescriptor.identity,
      status: "ended",
    });

    backend.load.mockClear();
    backend.play.mockClear();
    backend.seek.mockClear();
    sourceFactory.mockClear();
    await session.play();

    expect(sourceFactory).not.toHaveBeenCalled();
    expect(backend.load).not.toHaveBeenCalled();
    expect(backend.seek).toHaveBeenCalledWith(0);
    expect(backend.play).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().status).not.toBe("ended");
  });

  it("accepts restarted low revisions after explicit reload so replay leaves loading", async () => {
    await session.load(firstDescriptor);
    backend.emit(
      backendSnapshot({
        position: 90,
        duration: 90,
        status: "ended",
        revision: 100,
        platform: "android",
      }),
    );
    expect(session.getSnapshot().status).toBe("ended");

    // Simulate Android service restart after clear: revisions reset while JS still holds 100.
    backend.load.mockImplementationOnce(
      async (descriptor: AudioDescriptor, _source: AudioPlaybackSource, position: number) => {
        backend.emit(
          backendSnapshot({
            identity: descriptor.identity,
            title: descriptor.title,
            position,
            duration: 90,
            status: "ready",
            canSeek: true,
            revision: 1,
            platform: "android",
          }),
        );
      },
    );
    backend.play.mockImplementationOnce(async () => {
      backend.emit(
        backendSnapshot({
          identity: firstDescriptor.identity,
          title: firstDescriptor.title,
          position: 0,
          duration: 90,
          status: "playing",
          playWhenReady: true,
          isPlaying: true,
          canSeek: true,
          revision: 2,
          platform: "android",
        }),
      );
    });

    await session.load(firstDescriptor, 0);
    await session.play();

    expect(session.getSnapshot()).toMatchObject({
      status: "playing",
      isPlaying: true,
      position: 0,
      revision: expect.any(Number),
    });
    expect(session.getSnapshot().status).not.toBe("loading");
  });

  it("rewinds web playback after natural end without a full reload", async () => {
    await session.load(firstDescriptor);
    backend.emit(
      backendSnapshot({
        position: 40,
        duration: 40,
        status: "ended",
        revision: 9,
        platform: "web",
      }),
    );
    backend.load.mockClear();
    sourceFactory.mockClear();
    backend.seek.mockClear();
    backend.play.mockClear();

    await session.play();

    expect(sourceFactory).not.toHaveBeenCalled();
    expect(backend.load).not.toHaveBeenCalled();
    expect(backend.seek).toHaveBeenCalledWith(0);
    expect(backend.play).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toMatchObject({
      position: 0,
      playWhenReady: true,
      status: "buffering",
    });
  });

  it("rehydrates only credential-free metadata in a paused authorization-required state", () => {
    session.restore({
      identity: firstDescriptor.identity,
      title: firstDescriptor.title,
      position: 21,
      duration: 100,
    });

    expect(session.getSnapshot()).toMatchObject({
      identity: firstDescriptor.identity,
      position: 21,
      duration: 100,
      status: "authorization-required",
      playWhenReady: false,
      isPlaying: false,
    });
    expect(backend.load).not.toHaveBeenCalled();
    expect(backend.play).not.toHaveBeenCalled();
    expect(JSON.stringify(session.getSnapshot())).not.toMatch(/blob:|token|url/i);
  });
});

describe("Phase 27 ordinary-media ownership handoffs", () => {
  let backend: FakeBackend;
  let session: AudioPlaybackSession;

  beforeEach(() => {
    backend = new FakeBackend();
    session = new AudioPlaybackSession(
      backend,
      async (descriptor: AudioDescriptor) => ({
        url: `blob:${descriptor.identity.fileId}`,
        objectUrl: true,
      }),
    );
  });

  it("becomes the sole ordinary owner only after video pause-for-audio completes", async () => {
    const { VideoPlaybackSession } = await import("./videoPlaybackSession");
    const videoSession = new VideoPlaybackSession();
    const videoElement = {
      pause: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      currentTime: 18,
      duration: 90,
      muted: false,
    } as unknown as HTMLVideoElement;
    const registration = videoSession.attach(
      { chatId: "chat|one", messageId: "message/video", fileId: "file%2Fvideo" },
      videoElement,
    );
    videoSession.activate(registration);
    videoSession.update(registration, {
      currentTime: 18,
      duration: 90,
      status: "playing",
      playIntent: true,
    });

    await session.load(firstDescriptor);
    expect(videoSession.pauseActive()).toBe(true);
    backend.emit(
      backendSnapshot({
        position: 0,
        duration: 40,
        isPlaying: true,
        playWhenReady: true,
        status: "playing",
        revision: 3,
      }),
    );

    expect(videoElement.pause).toHaveBeenCalledTimes(1);
    expect(videoSession.getSnapshot()).toMatchObject({
      identity: { chatId: "chat|one", messageId: "message/video", fileId: "file%2Fvideo" },
      currentTime: 18,
      status: "paused",
      playIntent: false,
    });
    expect(session.getSnapshot()).toMatchObject({
      identity: firstDescriptor.identity,
      isPlaying: true,
      status: "playing",
    });
    expect(backend.play).not.toHaveBeenCalled();
  });

  it("accepts system-originated playing state without auto-resuming after call or video interruption ends", async () => {
    await session.load(firstDescriptor);
    backend.emit(
      backendSnapshot({
        position: 27,
        duration: 80,
        isPlaying: true,
        playWhenReady: true,
        status: "playing",
        revision: 5,
      }),
    );

    await session.pauseForVideo();
    expect(session.getSnapshot()).toMatchObject({
      position: 27,
      suppressionReason: "video",
      playWhenReady: false,
      isPlaying: false,
    });

    backend.emit(
      backendSnapshot({
        position: 27,
        duration: 80,
        isPlaying: false,
        playWhenReady: false,
        status: "paused",
        revision: 6,
      }),
    );
    expect(backend.play).not.toHaveBeenCalled();

    await session.setCallActive(true);
    await session.setCallActive(false);
    expect(session.getSnapshot()).toMatchObject({
      position: 27,
      playWhenReady: false,
      isPlaying: false,
      suppressionReason: null,
    });
    expect(backend.play).not.toHaveBeenCalled();
  });

  it("applies terminal and account cleanup once while ordinary reconnect preserves ownership", async () => {
    await session.load(firstDescriptor);
    backend.emit(
      backendSnapshot({
        position: 14,
        duration: 50,
        status: "playing",
        isPlaying: true,
        playWhenReady: true,
        revision: 9,
        platform: "android",
      }),
    );
    backend.load.mockClear();
    backend.play.mockClear();
    backend.clear.mockClear();

    await session.connect();
    await session.connect();
    expect(backend.connect).toHaveBeenCalledTimes(1);
    expect(backend.load).not.toHaveBeenCalled();
    expect(backend.play).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({
      identity: firstDescriptor.identity,
      position: 14,
    });

    backend.emit(backendSnapshot({ position: 14, duration: 50, revision: 9 }));
    backend.emit(backendSnapshot({ position: 99, duration: 50, revision: 8 }));
    expect(session.getSnapshot().position).toBe(14);

    await session.clear("logout");
    expect(session.getSnapshot()).toMatchObject({ identity: null, status: "idle" });
    await session.clear("logout");
    expect(session.getSnapshot()).toMatchObject({ identity: null, status: "idle" });
    expect(backend.clear).toHaveBeenCalled();
  });
});

class FakeAudioElement extends EventTarget {
  src = "";
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  error: { code: number } | null = null;
  bufferedEnd = 0;
  pause = vi.fn(() => {
    this.paused = true;
  });
  play = vi.fn(async () => {
    this.paused = false;
  });
  load = vi.fn();
  removeAttribute = vi.fn((name: string) => {
    if (name === "src") this.src = "";
  });
  get buffered(): TimeRanges {
    return {
      length: this.bufferedEnd > 0 ? 1 : 0,
      start: () => 0,
      end: () => this.bufferedEnd,
    };
  }
}

function webDescriptor(fileId: string): AudioDescriptor {
  return {
    identity: { chatId: "chat", messageId: `message-${fileId}`, fileId },
    title: `${fileId}.mp3`,
  };
}

describe("WebAudioPlaybackBackend", () => {
  let element: FakeAudioElement;
  let elementFactory: ReturnType<typeof vi.fn<() => HTMLAudioElement>>;
  let revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>;
  let backend: WebAudioPlaybackBackend;

  beforeEach(() => {
    element = new FakeAudioElement();
    elementFactory = vi.fn<() => HTMLAudioElement>(
      () => element as unknown as HTMLAudioElement,
    );
    revokeObjectURL = vi.fn<(url: string) => void>();
    backend = new WebAudioPlaybackBackend(elementFactory, revokeObjectURL);
  });

  it("creates one long-lived audio element and reuses it for every identity", async () => {
    await backend.load(webDescriptor("one"), { url: "blob:one", objectUrl: true }, 0);
    await backend.load(webDescriptor("two"), { url: "blob:two", objectUrl: true }, 0);

    expect(elementFactory).toHaveBeenCalledTimes(1);
    expect(element.src).toBe("blob:two");
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:one");
    expect(element.play).not.toHaveBeenCalled();
  });

  it("cancels late source resolution, seeks after metadata, and revokes each owned URL once", async () => {
    let resolveFirst!: (source: AudioPlaybackSource) => void;
    const sourceFactory = vi
      .fn<(descriptor: AudioDescriptor) => Promise<AudioPlaybackSource>>()
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce({ url: "blob:second", objectUrl: true });
    const session = new AudioPlaybackSession(backend, sourceFactory);

    const firstLoad = session.load(webDescriptor("first"), 22);
    await session.load(webDescriptor("second"), 37);
    resolveFirst({ url: "blob:late", objectUrl: true });
    await firstLoad;

    expect(element.src).toBe("blob:second");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:late");
    element.duration = 100;
    element.dispatchEvent(new Event("loadedmetadata"));
    expect(element.currentTime).toBe(37);

    await backend.clear();
    await backend.clear();
    expect(revokeObjectURL.mock.calls.filter(([url]) => url === "blob:second")).toHaveLength(1);
  });

  it("maps media events to ordered intent, playback, buffering, progress, end, and error state", async () => {
    const snapshots: AudioPlaybackSnapshot[] = [];
    backend.subscribe((snapshot) => snapshots.push(snapshot));
    await backend.load(webDescriptor("events"), { url: "blob:events", objectUrl: true }, 5);
    element.duration = 80;
    element.currentTime = 5;
    element.bufferedEnd = 30;

    element.dispatchEvent(new Event("loadedmetadata"));
    await backend.play();
    element.dispatchEvent(new Event("play"));
    element.dispatchEvent(new Event("waiting"));
    element.dispatchEvent(new Event("canplay"));
    element.currentTime = 12;
    element.dispatchEvent(new Event("timeupdate"));
    element.dispatchEvent(new Event("progress"));
    element.dispatchEvent(new Event("playing"));
    element.dispatchEvent(new Event("pause"));
    element.dispatchEvent(new Event("ended"));

    expect(snapshots.map((snapshot) => snapshot.revision)).toEqual(
      [...snapshots.map((snapshot) => snapshot.revision)].sort((left, right) => left - right),
    );
    expect(snapshots.some((snapshot) =>
      snapshot.status === "buffering" &&
      snapshot.playWhenReady &&
      !snapshot.isPlaying)).toBe(true);
    expect(snapshots.some((snapshot) =>
      snapshot.status === "playing" &&
      snapshot.playWhenReady &&
      snapshot.isPlaying)).toBe(true);
    expect(snapshots.some((snapshot) => snapshot.position === 12)).toBe(true);
    expect(snapshots.some((snapshot) => snapshot.bufferedPosition === 30)).toBe(true);
    expect(backend.getSnapshot()).toMatchObject({
      status: "ended",
      playWhenReady: false,
      isPlaying: false,
      position: 80,
    });
  });

  it("converts rejected play, decoder failures, invalid timing, and unsupported sources to closed errors", async () => {
    await backend.load(webDescriptor("failure"), { url: "blob:failure", objectUrl: true }, 0);
    element.play.mockRejectedValueOnce(new DOMException("raw denied text", "NotAllowedError"));
    await backend.play();
    expect(backend.getSnapshot()).toMatchObject({
      status: "error",
      error: "playback-denied",
    });
    expect(JSON.stringify(backend.getSnapshot())).not.toContain("raw denied text");

    element.duration = Number.POSITIVE_INFINITY;
    element.dispatchEvent(new Event("durationchange"));
    expect(backend.getSnapshot().duration).toBe(0);

    element.error = { code: 4 };
    element.dispatchEvent(new Event("error"));
    expect(backend.getSnapshot().error).toBe("unsupported");
    element.error = { code: 3 };
    element.dispatchEvent(new Event("error"));
    expect(backend.getSnapshot().error).toBe("decode");

    await backend.load(webDescriptor("empty"), { url: "" }, 0);
    expect(backend.getSnapshot()).toMatchObject({
      status: "error",
      error: "unsupported",
    });
  });

  it("makes clear idempotently pause, detach, load, revoke, and reject late decoder events", async () => {
    await backend.load(webDescriptor("clear"), { url: "blob:clear", objectUrl: true }, 0);
    await backend.clear();
    const cleared = backend.getSnapshot();
    element.currentTime = 99;
    element.dispatchEvent(new Event("timeupdate"));
    element.dispatchEvent(new Event("playing"));

    expect(element.pause).toHaveBeenCalled();
    expect(element.removeAttribute).toHaveBeenCalledWith("src");
    expect(element.load).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(backend.getSnapshot()).toEqual(cleared);
    expect(cleared).toMatchObject({ identity: null, status: "idle" });
  });
});
