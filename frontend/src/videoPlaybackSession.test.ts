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
