type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") {
    return null;
  }
  return (
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ||
    null
  );
}

function playToneBurst(
  context: AudioContext,
  frequencies: number[],
  options: {
    staggerSeconds?: number;
    toneDurationSeconds?: number;
    gainPeak?: number;
    waveType?: OscillatorType;
  } = {}
) {
  const {
    staggerSeconds = 0.2,
    toneDurationSeconds = 0.16,
    gainPeak = 0.35,
    waveType = "sine",
  } = options;
  const baseTime = context.currentTime;
  frequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = waveType;
    oscillator.frequency.value = frequency;
    const startAt = baseTime + index * staggerSeconds;
    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.exponentialRampToValueAtTime(gainPeak, startAt + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + toneDurationSeconds);
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + toneDurationSeconds + 0.02);
  });
}

export function createCallSoundPlayer() {
  let context: AudioContext | null = null;
  let loopTimer: number | null = null;
  let loopMode: "incoming" | "outgoing" | null = null;

  function stopLoop() {
    if (loopTimer !== null) {
      window.clearInterval(loopTimer);
      loopTimer = null;
    }
    loopMode = null;
  }

  async function ensureContext(): Promise<AudioContext | null> {
    const AudioCtor = getAudioContextCtor();
    if (!AudioCtor) {
      return null;
    }
    if (!context || context.state === "closed") {
      context = new AudioCtor();
    }
    if (context.state === "suspended") {
      await context.resume().catch(() => undefined);
    }
    return context;
  }

  async function playIncomingBurst() {
    const ctx = await ensureContext();
    if (!ctx) return;
    playToneBurst(ctx, [880, 660]);
  }

  async function playOutgoingBurst() {
    const ctx = await ensureContext();
    if (!ctx) return;
    playToneBurst(ctx, [440, 520], {
      staggerSeconds: 0.18,
      toneDurationSeconds: 0.22,
      gainPeak: 0.24,
    });
  }

  async function playEndBurst() {
    const AudioCtor = getAudioContextCtor();
    if (!AudioCtor) {
      return;
    }
    const endContext = new AudioCtor();
    if (endContext.state === "suspended") {
      await endContext.resume().catch(() => undefined);
    }
    playToneBurst(endContext, [620, 480, 360], {
      staggerSeconds: 0.14,
      toneDurationSeconds: 0.12,
      gainPeak: 0.28,
    });
    window.setTimeout(() => {
      void endContext.close().catch(() => undefined);
    }, 700);
  }

  function startLoop(mode: "incoming" | "outgoing", isSoundDisabled: () => boolean) {
    if (isSoundDisabled()) {
      return;
    }
    if (loopMode === mode) {
      return;
    }
    stopLoop();
    loopMode = mode;
    const playBurst = mode === "incoming" ? playIncomingBurst : playOutgoingBurst;
    const intervalMs = mode === "incoming" ? 1800 : 2400;
    void playBurst().catch(() => undefined);
    loopTimer = window.setInterval(() => {
      void playBurst().catch(() => undefined);
    }, intervalMs);
  }

  return {
    startIncomingRingtone: (isSoundDisabled: () => boolean) => startLoop("incoming", isSoundDisabled),
    startOutgoingRingtone: (isSoundDisabled: () => boolean) => startLoop("outgoing", isSoundDisabled),
    stopRingtone: stopLoop,
    playCallEndSound: async (isSoundDisabled: () => boolean) => {
      if (isSoundDisabled()) {
        return;
      }
      stopLoop();
      await playEndBurst().catch(() => undefined);
    },
  };
}
