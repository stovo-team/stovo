import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  VideoPlaybackSession,
  sameVideoIdentity,
  type VideoIdentity,
} from "./videoPlaybackSession";

function identity(chatId: string, messageId: string, fileId: string): VideoIdentity {
  return { chatId, messageId, fileId };
}

function videoElement() {
  return {
    pause: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    currentTime: 0,
    duration: Number.NaN,
    muted: false,
  } as unknown as HTMLVideoElement;
}

describe("VideoPlaybackSession", () => {
  let session: VideoPlaybackSession;

  beforeEach(() => {
    session = new VideoPlaybackSession();
  });

  it("pauses the former owner before activating another identity", () => {
    const firstElement = videoElement();
    const secondElement = videoElement();
    const first = session.attach(identity("chat", "message-a", "file-a"), firstElement);
    const second = session.attach(identity("chat", "message-b", "file-b"), secondElement);

    expect(session.activate(first)).toBe(true);
    expect(session.activate(second)).toBe(true);
    expect(firstElement.pause).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()?.identity).toEqual(second.identity);

    expect(session.activate(second)).toBe(true);
    expect(secondElement.pause).not.toHaveBeenCalled();
  });

  it("pauses the active registration while retaining its resumable snapshot", () => {
    const mediaIdentity = identity("chat", "message", "file");
    const element = videoElement();
    const registration = session.attach(mediaIdentity, element);
    session.activate(registration);
    session.update(registration, {
      currentTime: 37,
      duration: 120,
      status: "playing",
      playIntent: true,
    });
    const revision = session.getSnapshot(mediaIdentity)?.revision;

    expect(session.pauseActive()).toBe(true);
    expect(element.pause).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toMatchObject({
      identity: mediaIdentity,
      currentTime: 37,
      duration: 120,
      status: "paused",
      playIntent: false,
    });
    expect(session.getSnapshot(mediaIdentity)?.revision).toBeGreaterThan(revision ?? 0);
  });

  it("safely ignores idle and detached active registrations", () => {
    expect(session.pauseActive()).toBe(false);

    const registration = session.attach(identity("chat", "message", "file"), videoElement());
    session.activate(registration);
    session.detach(registration);

    expect(session.pauseActive()).toBe(false);
  });

  it("restores finite position, mute, and play intent after detach and reattach", () => {
    const mediaIdentity = identity("chat", "message", "file");
    const firstElement = videoElement();
    const first = session.attach(mediaIdentity, firstElement);
    session.activate(first);
    session.update(first, {
      currentTime: 37,
      duration: 120,
      muted: true,
      status: "playing",
      playIntent: true,
    });
    session.detach(first);

    const replacement = videoElement();
    const second = session.attach({ ...mediaIdentity }, replacement);

    expect(second.snapshot).toMatchObject({
      currentTime: 37,
      duration: 120,
      muted: true,
      playIntent: true,
    });
    expect(replacement.currentTime).toBe(37);
    expect(replacement.muted).toBe(true);
    expect(session.getSnapshot()?.identity).toEqual(mediaIdentity);
  });

  it("ignores late updates and detaches from a superseded registration", () => {
    const mediaIdentity = identity("chat", "message", "file");
    const oldRegistration = session.attach(mediaIdentity, videoElement());
    const currentRegistration = session.attach(mediaIdentity, videoElement());

    expect(session.update(oldRegistration, { currentTime: 99, duration: 100 })).toBe(false);
    session.detach(oldRegistration);
    expect(session.update(currentRegistration, { currentTime: 12, duration: 100 })).toBe(true);
    expect(session.getSnapshot(mediaIdentity)?.currentTime).toBe(12);
  });

  it("keeps adjacent and opaque structured identities distinct", () => {
    const identities = [
      identity("a|b", "c", "d"),
      identity("a", "b|c", "d"),
      identity("chat/with/slashes", "сообщение", "file%2Fopaque"),
      identity("chat/with/slashes", "сообщение", "file/opaque"),
    ];

    const registrations = identities.map((value) => session.attach(value, videoElement()));
    registrations.forEach((registration, index) => {
      session.update(registration, { currentTime: index + 1, duration: 10 });
    });

    expect(sameVideoIdentity(identities[0], identities[1])).toBe(false);
    expect(sameVideoIdentity(identities[2], identities[3])).toBe(false);
    identities.forEach((value, index) => {
      expect(session.getSnapshot(value)?.identity).toEqual(value);
      expect(session.getSnapshot(value)?.currentTime).toBe(index + 1);
    });
  });

  it("rejects empty identities and ignores malformed or older state", () => {
    expect(() => session.attach(identity("", "message", "file"), videoElement())).toThrow(
      "Video identity fields are required",
    );

    const mediaIdentity = identity("chat", "message", "file");
    const registration = session.attach(mediaIdentity, videoElement());
    const revision = session.issueRevision();
    expect(
      session.update(
        registration,
        { currentTime: 90, duration: 100, status: "playing" },
        revision,
      ),
    ).toBe(true);
    expect(
      session.update(
        registration,
        { currentTime: 1, duration: 5, status: "paused" },
        revision - 1,
      ),
    ).toBe(false);
    expect(
      session.update(registration, {
        currentTime: Number.NaN,
        duration: Number.POSITIVE_INFINITY,
      }),
    ).toBe(true);
    expect(session.getSnapshot(mediaIdentity)).toMatchObject({ currentTime: 90, duration: 100 });

    session.update(registration, { duration: 30 });
    expect(session.getSnapshot(mediaIdentity)).toMatchObject({ currentTime: 30, duration: 30 });
    session.update(registration, { currentTime: -12 });
    expect(session.getSnapshot(mediaIdentity)?.currentTime).toBe(0);
  });

  it("clears play intent on ended, error, and reset without serializing elements", () => {
    const firstIdentity = identity("chat", "message-a", "file-a");
    const firstElement = videoElement();
    const first = session.attach(firstIdentity, firstElement);
    session.activate(first);
    session.update(first, { status: "ended", playIntent: true });

    expect(session.getSnapshot()).toBeNull();
    expect(session.getSnapshot(firstIdentity)?.playIntent).toBe(false);

    const secondIdentity = identity("chat", "message-b", "file-b");
    const secondElement = videoElement();
    const second = session.attach(secondIdentity, secondElement);
    session.activate(second);
    session.update(second, { status: "error", playIntent: true, error: "Decode failed" });
    expect(session.getSnapshot()).toBeNull();
    expect(session.getSnapshot(secondIdentity)).toMatchObject({
      status: "error",
      playIntent: false,
      error: "Decode failed",
    });

    session.reset();
    expect(secondElement.pause).toHaveBeenCalled();
    expect(session.getSnapshot(secondIdentity)).toBeNull();
    expect(JSON.stringify(session.getSnapshot())).not.toContain("HTMLVideoElement");
  });
});

describe("Phase 27 video ownership against audio and call gates", () => {
  let session: VideoPlaybackSession;

  beforeEach(() => {
    session = new VideoPlaybackSession();
  });

  it("awaits audio pause before a user or PiP-originated play leaves one active owner", async () => {
    const { AudioPlaybackSession } = await import("./audioPlaybackSession");
    type AudioSnapshot = {
      identity: { chatId: string; messageId: string; fileId: string } | null;
      title: string;
      position: number;
      duration: number;
      bufferedPosition: number;
      status:
        | "idle"
        | "loading"
        | "ready"
        | "playing"
        | "paused"
        | "buffering"
        | "suppressed"
        | "ended"
        | "error"
        | "authorization-required";
      playWhenReady: boolean;
      isPlaying: boolean;
      suppressionReason: "call" | "video" | "focus" | null;
      canSeek: boolean;
      error: null;
      revision: number;
      platform: "web";
    };
    const pauseOrder: string[] = [];
    let audioSnapshot: AudioSnapshot = {
      identity: null,
      title: "",
      position: 0,
      duration: 0,
      bufferedPosition: 0,
      status: "idle",
      playWhenReady: false,
      isPlaying: false,
      suppressionReason: null,
      canSeek: false,
      error: null,
      revision: 0,
      platform: "web",
    };
    const listeners = new Set<(snapshot: AudioSnapshot) => void>();
    const audioBackend = {
      connect: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => audioSnapshot),
      subscribe: vi.fn((listener: (snapshot: AudioSnapshot) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
      load: vi.fn(async (descriptor: { identity: { chatId: string; messageId: string; fileId: string }; title: string }, _source: unknown, position: number) => {
        audioSnapshot = {
          ...audioSnapshot,
          identity: descriptor.identity,
          title: descriptor.title,
          position,
          duration: 40,
          bufferedPosition: 20,
          status: "ready",
          revision: audioSnapshot.revision + 1,
        };
        listeners.forEach((listener) => listener(audioSnapshot));
      }),
      play: vi.fn(async () => undefined),
      pause: vi.fn(async () => {
        pauseOrder.push("audio-pause");
      }),
      seek: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined),
      setCallActive: vi.fn(async () => undefined),
    };
    const audioSession = new AudioPlaybackSession(audioBackend, async () => ({
      url: "blob:audio",
      objectUrl: true,
    }));
    await audioSession.load({
      identity: { chatId: "chat", messageId: "audio", fileId: "audio-file" },
      title: "clip.mp3",
    }, 11);
    audioSnapshot = {
      ...audioSnapshot,
      position: 11,
      duration: 40,
      status: "playing",
      playWhenReady: true,
      isPlaying: true,
      revision: audioSnapshot.revision + 1,
    };
    listeners.forEach((listener) => listener(audioSnapshot));

    const first = session.attach(identity("chat", "message-v1", "file-v1"), videoElement());
    const second = session.attach(identity("chat", "message-v2", "file-v2"), videoElement());
    session.activate(first);
    session.update(first, {
      currentTime: 22,
      duration: 100,
      status: "playing",
      playIntent: true,
    });

    await audioSession.pauseForVideo();
    pauseOrder.push("video-before-play");
    expect(session.pauseActive()).toBe(true);
    expect(session.activate(second)).toBe(true);
    session.update(second, {
      currentTime: 5,
      duration: 80,
      status: "playing",
      playIntent: true,
    });

    expect(pauseOrder).toEqual(["audio-pause", "video-before-play"]);
    expect(session.getSnapshot()?.identity).toEqual(identity("chat", "message-v2", "file-v2"));
    expect(session.getSnapshot(identity("chat", "message-v1", "file-v1"))).toMatchObject({
      currentTime: 22,
      status: "paused",
      playIntent: false,
    });
    expect(audioSession.getSnapshot()).toMatchObject({
      position: 11,
      suppressionReason: "video",
      playWhenReady: false,
      isPlaying: false,
    });
  });

  it("pauses for any non-idle call and retains state without implicit resume on idle", () => {
    const mediaIdentity = identity("chat", "message", "file");
    const element = videoElement();
    const registration = session.attach(mediaIdentity, element);
    session.activate(registration);
    session.update(registration, {
      currentTime: 33,
      duration: 120,
      status: "playing",
      playIntent: true,
    });
    const beforeCallRevision = session.getSnapshot(mediaIdentity)?.revision ?? 0;

    expect(session.pauseActive()).toBe(true);
    expect(element.pause).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot(mediaIdentity)).toMatchObject({
      currentTime: 33,
      duration: 120,
      status: "paused",
      playIntent: false,
    });
    expect(session.getSnapshot(mediaIdentity)?.revision).toBeGreaterThan(beforeCallRevision);

    expect(session.pauseActive()).toBe(true);
    expect(element.pause).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot(mediaIdentity)?.playIntent).toBe(false);
    expect(element.play).not.toHaveBeenCalled();
  });

  it("ignores stale lower revisions and ordinary detach without clearing a still-valid owner", () => {
    const mediaIdentity = identity("chat", "message", "file");
    const firstElement = videoElement();
    const first = session.attach(mediaIdentity, firstElement);
    session.activate(first);
    session.update(first, {
      currentTime: 40,
      duration: 100,
      status: "playing",
      playIntent: true,
    });
    const acceptedRevision = session.issueRevision();
    expect(
      session.update(
        first,
        { currentTime: 41, duration: 100, status: "playing", playIntent: true },
        acceptedRevision,
      ),
    ).toBe(true);
    expect(
      session.update(
        first,
        { currentTime: 1, duration: 100, status: "paused", playIntent: false },
        acceptedRevision - 1,
      ),
    ).toBe(false);
    expect(session.getSnapshot(mediaIdentity)?.currentTime).toBe(41);

    session.detach(first);
    expect(session.getSnapshot(mediaIdentity)).toMatchObject({
      currentTime: 41,
      duration: 100,
      playIntent: true,
    });

    const replacement = videoElement();
    const second = session.attach(mediaIdentity, replacement);
    expect(second.snapshot.currentTime).toBe(41);
    expect(replacement.currentTime).toBe(41);
    expect(session.getSnapshot()?.identity).toEqual(mediaIdentity);
  });
});
