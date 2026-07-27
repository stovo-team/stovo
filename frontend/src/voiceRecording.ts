/**
 * Browser MediaRecorder helper for composer voice messages.
 */

export type VoiceRecorderHandle = {
  stop: () => Promise<File>;
  cancel: () => void;
};

function preferredMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg"
  ];
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "audio/webm";
  }
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "audio/webm";
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export function isVoiceRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}

export async function startVoiceRecording(): Promise<VoiceRecorderHandle> {
  if (!isVoiceRecordingSupported()) {
    throw new Error("Voice recording is not supported on this device");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = preferredMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });

  let settle: {
    resolve: (file: File) => void;
    reject: (error: Error) => void;
  } | null = null;

  recorder.addEventListener("stop", () => {
    stream.getTracks().forEach((track) => track.stop());
    if (!settle) return;
    const type = recorder.mimeType || mimeType || "audio/webm";
    const blob = new Blob(chunks, { type });
    if (blob.size === 0) {
      settle.reject(new Error("Recording was empty"));
      settle = null;
      return;
    }
    const file = new File(
      [blob],
      `voice-${new Date().toISOString().replace(/[:.]/g, "-")}.${extensionForMime(type)}`,
      { type }
    );
    settle.resolve(file);
    settle = null;
  });

  recorder.addEventListener("error", () => {
    stream.getTracks().forEach((track) => track.stop());
    settle?.reject(new Error("Voice recording failed"));
    settle = null;
  });

  recorder.start(250);

  return {
    stop: () =>
      new Promise<File>((resolve, reject) => {
        if (recorder.state === "inactive") {
          reject(new Error("Recording already stopped"));
          return;
        }
        settle = { resolve, reject };
        try {
          recorder.stop();
        } catch (error) {
          settle = null;
          stream.getTracks().forEach((track) => track.stop());
          reject(error instanceof Error ? error : new Error("Failed to stop recording"));
        }
      }),
    cancel: () => {
      settle = null;
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        // Ignore teardown races.
      }
      stream.getTracks().forEach((track) => track.stop());
    }
  };
}
