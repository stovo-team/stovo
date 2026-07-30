import type { PointerEvent } from "react";
import { Mic, Square } from "lucide-react";

export interface VoiceRecordButtonProps {
  isRecording: boolean;
  disabled: boolean;
  onPressStart: (event: PointerEvent<HTMLButtonElement>) => void;
  onPressEnd: (event: PointerEvent<HTMLButtonElement>) => void;
  onPressCancel: (event: PointerEvent<HTMLButtonElement>) => void;
}

export function VoiceRecordButton({
  isRecording,
  disabled,
  onPressStart,
  onPressEnd,
  onPressCancel,
}: VoiceRecordButtonProps) {
  return (
    <button
      type="button"
      className={`composer-voice-button${isRecording ? " is-recording" : ""}`}
      aria-label={isRecording ? "Click to send voice message" : "Click to record voice message"}
      aria-pressed={isRecording}
      title={isRecording ? "Click to send voice message" : "Click to record voice message"}
      disabled={disabled}
      onPointerDown={onPressStart}
      onPointerUp={(event) => {
        if (event.pointerType !== "mouse") onPressEnd(event);
      }}
      onPointerCancel={onPressCancel}
    >
      {isRecording ? (
        <Square size={18} aria-hidden="true" fill="currentColor" />
      ) : (
        <Mic size={20} aria-hidden="true" />
      )}
    </button>
  );
}
