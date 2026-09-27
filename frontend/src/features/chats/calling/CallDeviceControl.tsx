import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { CallDevice } from "../../../realtime/call/types";
import { CallControlButton, type CallControlAction } from "./CallControlButton";

type DeviceKind = CallDevice["kind"];
export type CallDeviceStrings = {
  selectDevice: string;
  deviceLabelFormat: string;
  systemDefault: string;
  deviceSelectionUnavailable: string;
};
const DEFAULT_DEVICE_STRINGS: CallDeviceStrings = {
  selectDevice: "Select",
  deviceLabelFormat: "{label} device",
  systemDefault: "System default",
  deviceSelectionUnavailable: "Device selection unavailable in this browser",
};

export function CallDeviceControl({
  action,
  label,
  active,
  deviceKind,
  selectedDeviceId,
  devices = [],
  canSelectDevice = true,
  toggleLabel,
  deviceStrings = DEFAULT_DEVICE_STRINGS,
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
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const availableDevices = devices.filter((device) => device.kind === deviceKind);
  const selectedLabel = selectedDeviceId
    ? availableDevices.find((device) => device.deviceId === selectedDeviceId)?.label || label
    : deviceStrings.systemDefault;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: MouseEvent) => {
      if (controlRef.current && !controlRef.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function chooseDevice(deviceId: string) {
    onDeviceChange(deviceId);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="guest-device-control" ref={controlRef}>
      <CallControlButton
        action={action}
        toggle
        state={active ? "active" : "muted"}
        label={toggleLabel ?? `Toggle ${label}`}
        aria-label={toggleLabel ?? `Toggle ${label}`}
        className={[controlClassName, active ? "active" : ""].filter(Boolean).join(" ")}
        onClick={onToggle}
      />
      <div className="guest-device-select">
        <button
          ref={triggerRef}
          type="button"
          className="guest-device-menu-trigger"
          aria-label={`${deviceStrings.selectDevice} ${label}`}
          aria-haspopup="listbox"
          aria-controls={menuId}
          aria-expanded={open}
          disabled={!canSelectDevice}
          title={canSelectDevice ? `${deviceStrings.selectDevice} ${label}: ${selectedLabel}` : deviceStrings.deviceSelectionUnavailable}
          onClick={() => setOpen((wasOpen) => !wasOpen)}
        >
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        {open && (
            <div id={menuId} className="guest-device-menu" role="listbox" aria-label={deviceStrings.deviceLabelFormat.replace("{label}", label)}>
            <div className="guest-device-menu-heading"><span>{label}</span></div>
            <div className="guest-device-menu-options">
              <button type="button" role="option" aria-selected={!selectedDeviceId} className="guest-device-menu-option" onClick={() => chooseDevice("")}>
                <span>{deviceStrings.systemDefault}</span>{!selectedDeviceId && <span aria-hidden="true">✓</span>}
              </button>
              {availableDevices.map((device, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={device.deviceId === selectedDeviceId}
                  className="guest-device-menu-option"
                  key={device.deviceId}
                  onClick={() => chooseDevice(device.deviceId)}
                >
                  <span>{device.label || `${label} ${index + 1}`}</span>
                  {device.deviceId === selectedDeviceId && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
