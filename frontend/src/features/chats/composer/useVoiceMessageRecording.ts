import { PointerEvent as ReactPointerEvent, useRef, useState } from "react";

import { createClientMessageId } from "../shared/messageState";
import type { PendingLocalAttachment } from "../shared/types";
import { seedMediaBlobCache } from "../../../mediaBlobCache";
import { isVoiceRecordingSupported, startVoiceRecording, type VoiceRecorderHandle } from "../../../voiceRecording";

type VoiceRecordingOptions = {
  disabled: boolean;
  cooldownSeconds: number;
  onError: (message: string | null) => void;
  onSend: (attachments: PendingLocalAttachment[]) => Promise<void>;
};

export function useVoiceMessageRecording({ disabled, cooldownSeconds, onError, onSend }: VoiceRecordingOptions) {
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const recorderRef = useRef<VoiceRecorderHandle | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  function cancelVoiceRecording() {
    pointerIdRef.current = null;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setIsVoiceRecording(false);
  }

  async function stopAndSendVoiceRecording() {
    pointerIdRef.current = null;
    const recorder = recorderRef.current;
    recorderRef.current = null;
    setIsVoiceRecording(false);
    if (!recorder) return;
    try {
      const file = await recorder.stop();
      const localId = `local:${createClientMessageId()}`;
      try {
        seedMediaBlobCache(localId, file);
      } catch {
        // Voice upload does not require a local preview cache.
      }
      await onSend([{ localId, file, previewUrl: null }]);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not send voice message");
    }
  }

  async function handleVoicePressStart(event: ReactPointerEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (cooldownSeconds > 0) {
      onError(`Please wait ${cooldownSeconds}s before sending another message`);
      return;
    }
    if (event.pointerType === "mouse" && pointerIdRef.current !== null) return stopAndSendVoiceRecording();
    if (event.button !== 0 || pointerIdRef.current !== null) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerIdRef.current = event.pointerId;
    if (!isVoiceRecordingSupported()) {
      pointerIdRef.current = null;
      onError("Voice recording is not supported on this device");
      return;
    }
    try {
      onError(null);
      const recorder = await startVoiceRecording();
      if (pointerIdRef.current !== event.pointerId) return recorder.cancel();
      recorderRef.current = recorder;
      setIsVoiceRecording(true);
    } catch (error) {
      if (pointerIdRef.current !== event.pointerId) return;
      pointerIdRef.current = null;
      recorderRef.current = null;
      setIsVoiceRecording(false);
      onError(error instanceof Error ? error.message : "Microphone permission is required to record");
    }
  }

  async function handleVoicePressEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    if (pointerIdRef.current === event.pointerId) await stopAndSendVoiceRecording();
  }

  function handleVoicePressCancel(event: ReactPointerEvent<HTMLButtonElement>) {
    if (pointerIdRef.current === event.pointerId) cancelVoiceRecording();
  }

  return { isVoiceRecording, cancelVoiceRecording, stopAndSendVoiceRecording, handleVoicePressStart, handleVoicePressEnd, handleVoicePressCancel };
}
