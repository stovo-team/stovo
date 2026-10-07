import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import type { CallDevice } from "../../../realtime/call/types";

export type CallDeviceStrings = {
  selectDevice: string;
  deviceLabelFormat: string;
  systemDefault: string;
  deviceSelectionUnavailable: string;
};

const defaultStrings: CallDeviceStrings = {
  selectDevice: "Select",
  deviceLabelFormat: "{label} device",
  systemDefault: "System default",
  deviceSelectionUnavailable: "Device selection unavailable in this browser",
};

type MenuPosition = { top: number; left: number; width: number; maxHeight: number };

export function CallDeviceSelect({
  label,
  deviceKind,
  selectedDeviceId,
  devices,
  onDeviceChange,
  canSelectDevice = true,
  deviceStrings = defaultStrings,
  variant = "split",
  portalContainerRef,
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
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition>();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const availableDevices = devices.filter((device) => device.kind === deviceKind);
  const selectedLabel = selectedDeviceId
    ? availableDevices.find((device) => device.deviceId === selectedDeviceId)?.label || label
    : deviceStrings.systemDefault;
  const isSettings = variant === "settings";

  useLayoutEffect(() => {
    if (!open || !isSettings) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(rect.width, window.innerWidth - 16);
      const top = rect.bottom + 6;
      const maxHeight = Math.min(280, Math.max(0, window.innerHeight - top - 8));
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      setPosition({ top, left, width, maxHeight });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, isSettings]);

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
      className={`guest-device-menu${isSettings ? " call-audio-device-menu" : ""}`}
      role="listbox"
      aria-label={deviceStrings.deviceLabelFormat.replace("{label}", label)}
      style={isSettings ? { ...position, position: "fixed" } : undefined}
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
    <div className={isSettings ? "call-audio-device-select" : "guest-device-select"} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={isSettings ? "call-audio-device-trigger" : "guest-device-menu-trigger"}
        aria-label={`${deviceStrings.selectDevice} ${label}`}
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
        {isSettings && <span>{selectedLabel}</span>}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {isSettings && menu && portalContainerRef?.current
        ? createPortal(menu, portalContainerRef.current)
        : menu}
    </div>
  );
}
