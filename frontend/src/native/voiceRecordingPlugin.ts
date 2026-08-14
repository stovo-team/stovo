import { Capacitor, registerPlugin } from "@capacitor/core";

export interface NativeVoiceRecordingPlugin {
  start(): Promise<void>;
  stop(): Promise<{ path: string; name: string; mimeType: string }>;
  cancel(): Promise<void>;
}

const VoiceRecordingPlugin = registerPlugin<NativeVoiceRecordingPlugin>("VoiceRecordingPlugin");

export function isNativeVoiceRecordingAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function startNativeVoiceRecording(): Promise<{ stop: () => Promise<File>; cancel: () => void }> {
  await VoiceRecordingPlugin.start();
  let finalized = false;
  const cancel = () => {
    if (finalized) return;
    finalized = true;
    void VoiceRecordingPlugin.cancel().catch(() => undefined);
  };
  return {
    cancel,
    stop: async () => {
      if (finalized) throw new Error("Recording already stopped");
      finalized = true;
      const recorded = await VoiceRecordingPlugin.stop();
      const url = Capacitor.convertFileSrc(recorded.path);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Could not read voice recording");
      const blob = await response.blob();
      if (blob.size === 0) throw new Error("Recording was empty");
      return new File([blob], recorded.name, { type: recorded.mimeType });
    },
  };
}
