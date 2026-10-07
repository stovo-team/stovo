import { useEffect, useRef, useState } from "react";
import type { CallSettings } from "../../../realtime/call/types";

type SinkableAudioContext = AudioContext & { setSinkId?: (deviceId: string) => Promise<void> };

export function useCallAudioTests(stream: MediaStream | null, settings: CallSettings) {
  const [level, setLevel] = useState(0);
  const [available, setAvailable] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const speakerContext = useRef<AudioContext | null>(null);
  const speakerTimer = useRef<number | null>(null);
  function stopSound() {
    if (speakerTimer.current !== null) window.clearTimeout(speakerTimer.current);
    speakerTimer.current = null;
    const context = speakerContext.current;
    speakerContext.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  }
  useEffect(() => stopSound, []);
  useEffect(() => {
    setLevel(0);
    setAvailable(false);
    if (!stream?.getAudioTracks().length || settings.micMuted || typeof AudioContext === "undefined") return;
    let context: AudioContext | null = null;
    let frame = 0;
    try {
      context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      if (context.state === "suspended") void context.resume().catch(() => undefined);
      setAvailable(true);
      const samples = new Uint8Array(analyser.fftSize);
      const measure = () => {
        analyser.getByteTimeDomainData(samples);
        const peak = samples.reduce((max, sample) => Math.max(max, Math.abs(sample - 128)), 0);
        setLevel(Math.min(100, Math.round(peak / 128 * 180)));
        frame = window.requestAnimationFrame(measure);
      };
      measure();
    } catch { setAvailable(false); }
    return () => { window.cancelAnimationFrame(frame); if (context) void context.close().catch(() => undefined); };
  }, [stream, settings.micMuted]);

  async function testSound() {
    if (settings.soundDisabled || settings.outputVolume <= 0) return;
    stopSound();
    setWarning(null);
    try {
      const context = new AudioContext() as SinkableAudioContext;
      speakerContext.current = context;
      if (settings.outputDeviceId) {
        if (!context.setSinkId) throw new Error("Output selection unavailable");
        await context.setSinkId(settings.outputDeviceId);
      }
      if (context.state === "suspended") await context.resume();
      if (speakerContext.current !== context) return;
      [523.25, 659.25, 783.99].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * 0.18;
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(settings.outputVolume / 100 * 0.25, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.18);
      });
      speakerTimer.current = window.setTimeout(stopSound, 800);
    } catch { stopSound(); setWarning("Could not play the speaker test on the selected output in this browser."); }
  }
  return { level, available, warning, testSound };
}
