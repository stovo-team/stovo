import type { CallSettings } from "../realtime/call/types";

export function guestCaptureConstraints(devices: { microphoneDeviceId: string; cameraDeviceId: string }, settings: CallSettings, isMobile: boolean): MediaStreamConstraints {
  const audio = devices.microphoneDeviceId ? { deviceId: { exact: devices.microphoneDeviceId } } : {};
  const video = devices.cameraDeviceId ? { deviceId: { exact: devices.cameraDeviceId } } : {};
  return isMobile ? { audio: devices.microphoneDeviceId ? audio : true, video: devices.cameraDeviceId ? video : true } : {
    audio: { ...audio, echoCancellation: settings.echoCancellation, noiseSuppression: settings.noiseSuppression, autoGainControl: settings.autoGainControl },
    video: { ...video, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } },
  };
}

export function createGuestAudioProcessor(sourceStream: MediaStream, inputGain: number, settings: CallSettings, enhance: boolean) {
  const context = new AudioContext();
  try {
    const source = context.createMediaStreamSource(sourceStream);
    const analyser = context.createAnalyser();
    const gain = context.createGain();
    const destination = context.createMediaStreamDestination();
    analyser.fftSize = 256;
    gain.gain.value = inputGain / 100;
    source.connect(analyser); analyser.connect(gain);
    const highpass = enhance ? context.createBiquadFilter() : null;
    const compressor = enhance ? context.createDynamicsCompressor() : null;
    if (highpass && compressor) {
      highpass.type = "highpass";
      compressor.knee.value = 24; compressor.ratio.value = 3;
      compressor.attack.value = 0.003; compressor.release.value = 0.2;
      highpass.connect(compressor); compressor.connect(destination);
    }
    function update(next: CallSettings) {
      if (highpass && compressor) {
        highpass.frequency.value = next.voiceEnhancementHighpass;
        compressor.threshold.value = next.voiceEnhancementThreshold;
      }
      gain.disconnect();
      gain.connect(next.voiceEnhancement && highpass ? highpass : destination);
    }
    update(settings);
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    return { context, analyser, gain, stream: destination.stream, update };
  } catch (error) { void context.close().catch(() => undefined); throw error; }
}
