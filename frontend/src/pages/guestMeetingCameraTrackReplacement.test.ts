import { describe, expect, it, vi } from "vitest";
import {
  CameraTrackReplacementFailedError,
  CameraTrackReplacementRollbackError,
  replacePublishedCameraTrackSafely,
} from "./guestMeetingCameraTrackReplacement";

type FakeTrack = { enabled: boolean; stop: ReturnType<typeof vi.fn> };
type FakeParticipant = {
  unpublishTrack: ReturnType<typeof vi.fn>;
  publishTrack: ReturnType<typeof vi.fn>;
};

describe("guest meeting camera track replacement", () => {
  it("restores a disabled old track when publishing the replacement fails", async () => {
    const oldTrack: FakeTrack = { enabled: false, stop: vi.fn() };
    const replacementTrack: FakeTrack = { enabled: false, stop: vi.fn() };
    const published = new Set<FakeTrack>([oldTrack]);
    const participant: FakeParticipant = {
      unpublishTrack: vi.fn(async (track: FakeTrack, stopOnUnpublish = true) => {
        published.delete(track);
        if (stopOnUnpublish) track.stop();
      }),
      publishTrack: vi.fn(async (track: FakeTrack) => {
        if (track === replacementTrack) throw new Error("replacement publish failed");
        published.add(track);
      }),
    };

    await expect(
      replacePublishedCameraTrackSafely(participant, oldTrack, replacementTrack, { source: "camera" }),
    ).rejects.toMatchObject({
      name: "CameraTrackReplacementFailedError",
      replacementError: new Error("replacement publish failed"),
    });

    expect(participant.unpublishTrack).toHaveBeenCalledWith(oldTrack, false);
    expect(participant.publishTrack).toHaveBeenNthCalledWith(1, replacementTrack, { source: "camera" });
    expect(replacementTrack.enabled).toBe(false);
    expect(participant.publishTrack).toHaveBeenNthCalledWith(2, oldTrack, { source: "camera" });
    expect(oldTrack.stop).not.toHaveBeenCalled();
    expect(replacementTrack.stop).toHaveBeenCalledOnce();
    expect(published.has(oldTrack)).toBe(true);
    expect(published.has(replacementTrack)).toBe(false);
  });

  it("keeps the old track alive until replacement publication succeeds", async () => {
    const oldTrack: FakeTrack = { enabled: true, stop: vi.fn() };
    const replacementTrack: FakeTrack = { enabled: true, stop: vi.fn() };
    const participant: FakeParticipant = {
      unpublishTrack: vi.fn(async (track: FakeTrack, stopOnUnpublish = true) => {
        if (stopOnUnpublish) track.stop();
      }),
      publishTrack: vi.fn(async () => undefined),
    };

    await replacePublishedCameraTrackSafely(participant, oldTrack, replacementTrack, { source: "camera" });

    expect(participant.unpublishTrack).toHaveBeenCalledWith(oldTrack, false);
    expect(oldTrack.stop).not.toHaveBeenCalled();
    expect(replacementTrack.stop).not.toHaveBeenCalled();
  });

  it("reports a distinct error when replacement and old-track restoration both fail", async () => {
    const oldTrack: FakeTrack = { enabled: false, stop: vi.fn() };
    const replacementTrack: FakeTrack = { enabled: false, stop: vi.fn() };
    const participant: FakeParticipant = {
      unpublishTrack: vi.fn(async (track: FakeTrack) => undefined),
      publishTrack: vi.fn(async (track: FakeTrack) => {
        throw new Error(track === replacementTrack ? "replacement failed" : "restore failed");
      }),
    };

    await expect(
      replacePublishedCameraTrackSafely(participant, oldTrack, replacementTrack, { source: "camera" }),
    ).rejects.toBeInstanceOf(CameraTrackReplacementRollbackError);
    expect(participant.publishTrack).toHaveBeenCalledTimes(2);
    expect(participant.publishTrack).toHaveBeenNthCalledWith(2, oldTrack, { source: "camera" });
    expect(replacementTrack.stop).toHaveBeenCalledOnce();
    expect(oldTrack.stop).not.toHaveBeenCalled();
  });

  it("stops an unused replacement stream if the original track cannot be unpublished", async () => {
    const oldTrack: FakeTrack = { enabled: true, stop: vi.fn() };
    const replacementTrack: FakeTrack = { enabled: true, stop: vi.fn() };
    const participant: FakeParticipant = {
      unpublishTrack: vi.fn(async () => { throw new Error("could not unpublish old track"); }),
      publishTrack: vi.fn(async () => undefined),
    };

    const replacement = replacePublishedCameraTrackSafely(participant, oldTrack, replacementTrack, { source: "camera" });
    await expect(replacement).rejects.toBeInstanceOf(CameraTrackReplacementFailedError);
    await expect(replacement).rejects.toMatchObject({ replacementError: new Error("could not unpublish old track") });

    expect(participant.publishTrack).not.toHaveBeenCalled();
    expect(replacementTrack.stop).toHaveBeenCalledOnce();
    expect(oldTrack.stop).not.toHaveBeenCalled();
  });
});
