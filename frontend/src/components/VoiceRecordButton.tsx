import type { PointerEvent } from "react";
import { Mic, Square } from "lucide-react";
import { useStrings } from "../i18n/LanguageContext";

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
  const strings = useStrings();
  const label = isRecording
    ? strings.chats.composer.clickToSendVoice
    : strings.chats.composer.clickToRecordVoice;

  return (
    <button
      type="button"
      className={`composer-voice-button${isRecording ? " is-recording" : ""}`}
      aria-label={label}
      aria-pressed={isRecording}
      title={label}
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
