import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createCallSpeakingIndicator, CALL_SPEAKING_RELEASE_DELAY_MS, CALL_SPEAKING_THRESHOLD } from "./callSpeakingIndicator";

const callSessionSource = readFileSync(resolve(process.cwd(), "src/realtime/call/CallSessionController.ts"), "utf8");

describe("shared call speaking indicator", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps the guest-link speech threshold and release delay in the shared contract", () => {
    expect(CALL_SPEAKING_THRESHOLD).toBe(8);
    expect(CALL_SPEAKING_RELEASE_DELAY_MS).toBe(1_000);
  });

  it("routes DM/group/voice activity through the same indicator and thresholds", () => {
    expect(callSessionSource).toMatch(/localSpeakingIndicator\s*=\s*createCallSpeakingIndicator\(/);
    expect(callSessionSource).toContain('localSpeakingIndicator?.update({ microphoneEnabled: true, level: avg })');
    expect(callSessionSource).toContain('indicator?.update({ microphoneEnabled: true, level: avg })');
    expect(callSessionSource).toContain('indicator && indicator.state !== "idle"');
    expect(callSessionSource).toContain("peerSpeakingUserIdsCallback?.(activeSpeakingUserIds)");
    expect(callSessionSource).toContain("localSpeakingCallback?.(isSpeaking)");
    expect(callSessionSource).toContain("CALL_SPEAKING_THRESHOLD");
    expect(callSessionSource).toContain("CALL_SPEAKING_RELEASE_DELAY_MS");
  });

  it("activates at the guest-link voice threshold and ignores quieter input", () => {
    const onStateChange = vi.fn();
    const indicator = createCallSpeakingIndicator(onStateChange);

    indicator.update({ microphoneEnabled: true, level: CALL_SPEAKING_THRESHOLD - 1 });
    expect(indicator.state).toBe("idle");

    indicator.update({ microphoneEnabled: true, level: CALL_SPEAKING_THRESHOLD });
    expect(indicator.state).toBe("speaking");
    expect(onStateChange).toHaveBeenLastCalledWith("speaking");
    indicator.dispose();
  });

  it("holds the speaking presentation for the guest-link release delay", () => {
    vi.useFakeTimers();
    const indicator = createCallSpeakingIndicator(vi.fn());

    indicator.update({ microphoneEnabled: true, level: CALL_SPEAKING_THRESHOLD });
    indicator.update({ microphoneEnabled: true, level: 0 });
    expect(indicator.state).toBe("settling");

    vi.advanceTimersByTime(CALL_SPEAKING_RELEASE_DELAY_MS - 1);
    expect(indicator.state).toBe("settling");
    vi.advanceTimersByTime(1);
    expect(indicator.state).toBe("idle");
    indicator.dispose();
  });

  it("restarts the release delay when speech resumes before it expires", () => {
    vi.useFakeTimers();
    const indicator = createCallSpeakingIndicator(vi.fn());

    indicator.update({ microphoneEnabled: true, level: CALL_SPEAKING_THRESHOLD });
    indicator.update({ microphoneEnabled: true, level: 0 });
    vi.advanceTimersByTime(CALL_SPEAKING_RELEASE_DELAY_MS - 300);
    indicator.update({ microphoneEnabled: true, level: CALL_SPEAKING_THRESHOLD });
    expect(indicator.state).toBe("speaking");
    indicator.update({ microphoneEnabled: true, level: 0 });
    vi.advanceTimersByTime(CALL_SPEAKING_RELEASE_DELAY_MS - 1);
    expect(indicator.state).toBe("settling");
    vi.advanceTimersByTime(1);
    expect(indicator.state).toBe("idle");
    indicator.dispose();
  });

  it("clears speaking immediately when the microphone is disabled", () => {
    vi.useFakeTimers();
    const indicator = createCallSpeakingIndicator(vi.fn());

    indicator.update({ microphoneEnabled: true, level: 40 });
    indicator.update({ microphoneEnabled: false, level: 100 });
    expect(indicator.state).toBe("idle");
    vi.advanceTimersByTime(CALL_SPEAKING_RELEASE_DELAY_MS * 2);
    expect(indicator.state).toBe("idle");
    indicator.dispose();
  });

  it("cancels a pending release callback when disposed", () => {
    vi.useFakeTimers();
    const onStateChange = vi.fn();
    const indicator = createCallSpeakingIndicator(onStateChange);

    indicator.update({ microphoneEnabled: true, level: CALL_SPEAKING_THRESHOLD });
    indicator.update({ microphoneEnabled: true, level: 0 });
    indicator.dispose();
    const changesAtDispose = onStateChange.mock.calls.length;

    vi.advanceTimersByTime(CALL_SPEAKING_RELEASE_DELAY_MS * 2);
    expect(indicator.state).toBe("settling");
    expect(onStateChange).toHaveBeenCalledTimes(changesAtDispose);
  });
});
