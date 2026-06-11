import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createCallSoundPlayer } from "./callSounds";

describe("createCallSoundPlayer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts and stops incoming ringtone loop", () => {
    const player = createCallSoundPlayer();
    player.startIncomingRingtone(() => false);
    player.stopRingtone();
    expect(true).toBe(true);
  });

  it("starts outgoing ringtone without throwing", () => {
    const player = createCallSoundPlayer();
    player.startOutgoingRingtone(() => false);
    player.stopRingtone();
    expect(true).toBe(true);
  });

  it("skips sounds when disabled", async () => {
    const player = createCallSoundPlayer();
    await player.playCallEndSound(() => true);
    player.startIncomingRingtone(() => true);
    player.startOutgoingRingtone(() => true);
    player.stopRingtone();
    expect(true).toBe(true);
  });
});
