import {
  Mic,
  MicOff,
  PhoneOff,
  RotateCcw,
  ScreenShare,
  ScreenShareOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

export type CallControlAction = "microphone" | "camera" | "screen-share" | "audio-output" | "flip-camera" | "end-call";
export type CallControlState = "active" | "muted" | "idle";

const actionIcons = {
  microphone: { active: Mic, muted: MicOff, idle: MicOff },
  camera: { active: Video, muted: VideoOff, idle: VideoOff },
  "screen-share": { active: ScreenShareOff, muted: ScreenShare, idle: ScreenShare },
  "audio-output": { active: Volume2, muted: VolumeX, idle: Volume2 },
  "flip-camera": { active: RotateCcw, muted: RotateCcw, idle: RotateCcw },
  "end-call": { active: PhoneOff, muted: PhoneOff, idle: PhoneOff },
} as const;

type CallControlButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> & {
  action: CallControlAction;
  label: string;
  state?: CallControlState;
  iconSize?: number;
  toggle?: boolean;
};

export function CallControlButton({
  action,
  label,
  state = "idle",
  iconSize = 20,
  toggle,
  children,
  className = "",
  type = "button",
  ...buttonProps
}: CallControlButtonProps) {
  const Icon = actionIcons[action][state];
  const isToggleAction = toggle ?? (action === "microphone" || action === "camera" || action === "screen-share");
  const stateClass = state === "active" ? "is-active" : state === "muted" ? "is-muted" : "";
  return (
    <button
      {...buttonProps}
      type={type}
      className={`shared-call-control-button${stateClass ? ` ${stateClass}` : ""}${className ? ` ${className}` : ""}`}
      aria-label={label}
      {...(isToggleAction ? { "aria-pressed": state === "active" } : {})}
    >
      <Icon aria-hidden="true" size={iconSize} />
      {children}
    </button>
  );
}
