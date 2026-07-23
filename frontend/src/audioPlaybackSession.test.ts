import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AudioPlaybackSession,
  sameAudioIdentity,
  type AudioDescriptor,
  type AudioPlaybackBackend,
  type AudioPlaybackSnapshot,
  type AudioPlaybackSource,
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
  let sourceFactory: ReturnType<typeof vi.fn>;
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
