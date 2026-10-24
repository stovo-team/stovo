import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { ChevronDown } from "lucide-react";
import type { CallDevice } from "../../../realtime/call/types";
import { PopupSelect } from "../../../components/ui/PopupSelect";

export type CallDeviceStrings = {
  selectDevice: string;
  deviceLabelFormat: string;
  systemDefault: string;
  deviceSelectionUnavailable: string;
  selectDeviceLabel?: (label: string) => string;
};

const defaultStrings: CallDeviceStrings = {
  selectDevice: "Select",
  deviceLabelFormat: "{label} device",
  systemDefault: "System default",
  deviceSelectionUnavailable: "Device selection unavailable in this browser",
};

export function CallDeviceSelect({
  label,
  deviceKind,
  selectedDeviceId,
  devices,
  onDeviceChange,
  canSelectDevice = true,
  deviceStrings = defaultStrings,
  variant = "split",
}: {
  label: string;
  deviceKind: CallDevice["kind"];
  selectedDeviceId: string;
  devices: CallDevice[];
  onDeviceChange: (deviceId: string) => void;
  canSelectDevice?: boolean;
  deviceStrings?: CallDeviceStrings;
  variant?: "split" | "settings";
  portalContainerRef?: RefObject<HTMLElement | null>;
}) {
  const availableDevices = devices.filter((device) => device.kind === deviceKind);

  if (variant === "settings") {
    const options = [
      { value: "", label: deviceStrings.systemDefault },
      ...availableDevices.map((device, index) => ({
        value: device.deviceId,
        label: device.label || `${label} ${index + 1}`,
      })),
    ];
    return (
      <PopupSelect
        ariaLabel={deviceStrings.deviceLabelFormat.replace("{label}", label)}
        triggerAriaLabel={`${deviceStrings.selectDevice} ${label}`}
        className="call-audio-device-select"
        options={options}
        value={selectedDeviceId}
        onChange={onDeviceChange}
        disabled={!canSelectDevice}
      />
    );
  }

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const selectedLabel = selectedDeviceId
    ? availableDevices.find((device) => device.deviceId === selectedDeviceId)?.label || label
    : deviceStrings.systemDefault;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
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

  const menu = open && (
    <div
      id={menuId}
      ref={menuRef}
      className="guest-device-menu"
      role="listbox"
      aria-label={deviceStrings.deviceLabelFormat.replace("{label}", label)}
    >
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
  );

  return (
    <div className="guest-device-select" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="guest-device-menu-trigger"
        aria-label={deviceStrings.selectDeviceLabel?.(label) ?? [deviceStrings.selectDevice, label].join(" ")}
        aria-haspopup="listbox"
        aria-controls={menuId}
        aria-expanded={open}
        disabled={!canSelectDevice}
        title={canSelectDevice ? `${deviceStrings.selectDevice} ${label}: ${selectedLabel}` : deviceStrings.deviceSelectionUnavailable}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" || !open) return;
          event.preventDefault();
          menuRef.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus();
        }}
      >
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {menu}
    </div>
  );
}
