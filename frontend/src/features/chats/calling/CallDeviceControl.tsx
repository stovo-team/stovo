import type { CallDevice } from "../../../realtime/call/types";
import { CallControlButton, type CallControlAction } from "./CallControlButton";
import { CallDeviceSelect, type CallDeviceStrings } from "./CallDeviceSelect";

type DeviceKind = CallDevice["kind"];

export function CallDeviceControl({
  action,
  label,
  active,
  deviceKind,
  selectedDeviceId,
  devices = [],
  canSelectDevice = true,
  toggleLabel,
  deviceStrings,
  onToggle,
  onDeviceChange,
  controlClassName = "",
}: {
  action: Extract<CallControlAction, "microphone" | "audio-output" | "camera">;
  label: string;
  active: boolean;
  deviceKind: DeviceKind;
  selectedDeviceId: string;
  devices: CallDevice[];
  canSelectDevice?: boolean;
  toggleLabel?: string;
  deviceStrings?: CallDeviceStrings;
  onToggle: () => void;
  onDeviceChange: (deviceId: string) => void;
  controlClassName?: string;
}) {
  return (
    <div className="guest-device-control">
      <CallControlButton
        action={action}
        toggle
        state={active ? "active" : "muted"}
        label={toggleLabel ?? `Toggle ${label}`}
        aria-label={toggleLabel ?? `Toggle ${label}`}
        className={[controlClassName, active ? "active" : ""].filter(Boolean).join(" ")}
        onClick={onToggle}
      />
      <CallDeviceSelect
        label={label}
        deviceKind={deviceKind}
        selectedDeviceId={selectedDeviceId}
        devices={devices}
        onDeviceChange={onDeviceChange}
        canSelectDevice={canSelectDevice}
        deviceStrings={deviceStrings}
      />
    </div>
  );
}
