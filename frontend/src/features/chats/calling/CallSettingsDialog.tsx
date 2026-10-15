import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import type { CallCapabilities, CallDevice, CallSettings } from "../../../realtime/CallController";
import type { CallUIPreferences } from "./callUIPreferences";
import { CallAudioSettingsPopup } from "./CallAudioSettingsPopup";
import { CallVideoSettingsPopup } from "./CallVideoSettingsPopup";

export type CallSettingsTab = "general" | "audio" | "camera";
const tabs: Array<{ id: CallSettingsTab; label: string }> = [
  { id: "general", label: "General" },
  { id: "audio", label: "Audio" },
  { id: "camera", label: "Camera" },
];

export function CallSettingsDialog({
  initialTab,
  preferences,
  settings,
  capabilities,
  devices,
  warning,
  onPatch,
  onPreferencePatch,
  onClose,
  localStream = null,
  isMobile,
}: {
  initialTab: CallSettingsTab;
  preferences: CallUIPreferences;
  settings: CallSettings;
  capabilities: CallCapabilities;
  devices: CallDevice[];
  warning: string | null;
  onPatch: (patch: Partial<CallSettings>) => void;
  onPreferencePatch: (patch: Partial<CallUIPreferences>) => void;
  onClose: () => void;
  localStream?: MediaStream | null;
  isMobile: boolean;
}) {
  const [tab, setTab] = useState<CallSettingsTab>(initialTab);
  const popupRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const closeDialog = useCallback(() => {
    onClose();
    requestAnimationFrame(() => returnFocusRef.current?.focus());
  }, [onClose]);
  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") closeDialog(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [closeDialog]);
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const currentIndex = tabs.findIndex((item) => item.id === tab);
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(currentIndex + delta + tabs.length) % tabs.length];
    setTab(next.id);
    document.getElementById(`call-settings-tab-${next.id}`)?.focus();
  };
  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="call-audio-popup-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
      <section ref={dialogRef} className="call-settings-dialog" role="dialog" aria-modal="true" aria-label="Call settings" onKeyDown={handleDialogKeyDown}>
        <header className="call-settings-dialog-header">
          <strong>Settings</strong>
          <button type="button" className="call-audio-popup-close" aria-label="Close" autoFocus onClick={closeDialog}><X size={14} aria-hidden="true" /></button>
        </header>
        <div className="call-settings-dialog-layout">
          <div className="call-settings-tabs" role="tablist" aria-label="Call settings">
            {tabs.map((item) => <button key={item.id} id={`call-settings-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`call-settings-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={handleTabKeyDown}>{item.label}</button>)}
          </div>
          <div className="call-settings-panel-wrap" id={`call-settings-panel-${tab}`} role="tabpanel" aria-labelledby={`call-settings-tab-${tab}`}>
            {tab === "general" && <div className="call-settings-general">
              <h3>General</h3>
              <div className="call-audio-toggle-row">
                <span className="call-audio-toggle-info"><span className="call-audio-toggle-name">Hide call controls automatically</span><span className="call-audio-toggle-desc">Reveal controls when you move the pointer or focus the panel.</span></span>
                <label className="call-audio-toggle-switch">
                  <input type="checkbox" aria-label="Hide call controls automatically" checked={preferences.autoHideControls} onChange={(event) => onPreferencePatch({ autoHideControls: event.target.checked })} />
                  <span className="call-audio-toggle-slider" />
                </label>
              </div>
            </div>}
            {tab === "audio" && <CallAudioSettingsPopup embedded popupRef={popupRef} isMobile={isMobile} settings={settings} capabilities={capabilities} devices={devices} warning={warning} onPatch={onPatch} onClose={closeDialog} localStream={localStream} />}
            {tab === "camera" && <>
              <CallVideoSettingsPopup embedded settings={settings} capabilities={capabilities} devices={devices} isMobile={isMobile} onPatch={onPatch} onClose={closeDialog} />
              <section className="call-settings-camera-fit" aria-label="Camera tile framing">
                <h3>Camera framing</h3>
                <label><input type="radio" name="camera-fit" value="fit" checked={preferences.cameraFit === "fit"} onChange={() => onPreferencePatch({ cameraFit: "fit" })} /> Fit entire image</label>
                <label><input type="radio" name="camera-fit" value="cover" checked={preferences.cameraFit === "cover"} onChange={() => onPreferencePatch({ cameraFit: "cover" })} /> Fill tile (crop)</label>
              </section>
            </>}
          </div>
        </div>
      </section>
    </div>
  );
}
