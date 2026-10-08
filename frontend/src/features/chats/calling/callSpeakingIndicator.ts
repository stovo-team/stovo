export const CALL_SPEAKING_THRESHOLD = 8;
export const CALL_SPEAKING_RELEASE_DELAY_MS = 1_000;

export type CallSpeakingState = "idle" | "speaking" | "settling";

/** Applies the shared voice activity threshold and release grace period. */
export function createCallSpeakingIndicator(onStateChange: (state: CallSpeakingState) => void) {
  let currentState: CallSpeakingState = "idle";
  let releaseTimer: ReturnType<typeof setTimeout> | null = null;

  const setState = (next: CallSpeakingState) => {
    if (next === currentState) return;
    currentState = next;
    onStateChange(next);
  };

  return {
    get state() { return currentState; },
    update({ microphoneEnabled, level, threshold = CALL_SPEAKING_THRESHOLD }: { microphoneEnabled: boolean; level: number; threshold?: number }) {
      if (!microphoneEnabled) {
        if (releaseTimer !== null) clearTimeout(releaseTimer);
        releaseTimer = null;
        setState("idle");
      } else if (level >= threshold) {
        if (releaseTimer !== null) clearTimeout(releaseTimer);
        releaseTimer = null;
        setState("speaking");
      } else if (currentState !== "idle" && releaseTimer === null) {
        setState("settling");
        releaseTimer = setTimeout(() => {
          releaseTimer = null;
          setState("idle");
        }, CALL_SPEAKING_RELEASE_DELAY_MS);
      }
    },
    dispose() {
      if (releaseTimer !== null) clearTimeout(releaseTimer);
      releaseTimer = null;
    },
  };
}

/** Samples waveform amplitude around digital silence, excluding DC offset. */
export function createCallLevelSampler() {
  const data = new Uint8Array(256);
  return (analyser: AnalyserNode) => {
    analyser.getByteTimeDomainData(data);
    const mean = data.reduce((sum, value) => sum + value, 0) / data.length;
    return Math.sqrt(data.reduce((sum, value) => sum + (value - mean) ** 2, 0) / data.length);
  };
}
