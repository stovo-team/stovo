import { X } from "lucide-react";
import {
  CallCapabilities,
  CallDevice,
  CallSettings,
} from "../../../realtime/CallController";

export function CallVideoSettingsPopup({
  settings,
  capabilities,
  devices,
  isMobile,
  onPatch,
  onClose,
  embedded = false,
}: {
  settings: CallSettings;
  capabilities: CallCapabilities;
  devices: CallDevice[];
  isMobile: boolean;
  onPatch: (patch: Partial<CallSettings>) => void;
  onClose: () => void;
  embedded?: boolean;
}) {
  const videoDevices = devices.filter((d) => d.kind === "videoinput");

  return (
    <div
      className={embedded ? "call-settings-embedded-content" : "call-audio-popup-backdrop"}
      role={embedded ? undefined : "presentation"}
      onMouseDown={!embedded ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
    >
      <div
        className={embedded ? "call-audio-popup call-settings-embedded-panel" : "call-audio-popup"}
        role={embedded ? "region" : "dialog"}
        aria-modal={embedded ? undefined : true}
        aria-label={embedded ? "Camera settings" : "Video settings"}
      >
        {!embedded && <div className="call-audio-popup-header">
          <span>Video settings</span>
          <button type="button" className="call-audio-popup-close" aria-label="Close" autoFocus onClick={onClose}>
            <X aria-hidden="true" size={14} />
          </button>
        </div>}
        <div className="call-audio-popup-body">
          {!isMobile && (
            <section className="call-audio-popup-section">
              <div className="call-audio-section-label">Camera device</div>
              <label className="call-audio-device-row">
                <span>Camera</span>
                <select
                  value={settings.videoDeviceId}
                  disabled={!capabilities.canUseCamera || videoDevices.length === 0}
                  onChange={(e) => onPatch({ videoDeviceId: e.target.value })}
                >
                  <option value="">System default</option>
                  {videoDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                  ))}
                </select>
              </label>
            </section>
          )}
          {!isMobile && <div className="call-audio-popup-divider" />}
          <section className="call-audio-popup-section">
            <div className="call-audio-section-label">Display</div>
            <div className="call-audio-toggle-group">
              <div className="call-audio-toggle-row">
                <div className="call-audio-toggle-info">
                  <span className="call-audio-toggle-name">Mirror my video</span>
                  <span className="call-audio-toggle-desc">Flip the local preview horizontally (front camera)</span>
                </div>
                <label className="call-audio-toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.mirrorLocalVideo}
                    onChange={(e) => onPatch({ mirrorLocalVideo: e.target.checked })}
                  />
                  <span className="call-audio-toggle-track" />
                </label>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
