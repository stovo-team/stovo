import {
  CallCapabilities,
  CallDevice,
  CallSettings,
} from "../../../realtime/CallController";
import { PopupBackdrop, PopupCloseButton } from "../../../components/ui/Popup";
import { PopupSelect } from "../../../components/ui/PopupSelect";

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

  const content = (
    <div
      className={embedded ? "call-audio-popup call-settings-embedded-panel" : "call-audio-popup"}
      role={embedded ? "region" : "dialog"}
      aria-modal={embedded ? undefined : true}
      aria-label={embedded ? "Camera settings" : "Video settings"}
      onClick={!embedded ? (e) => e.stopPropagation() : undefined}
    >
      {!embedded && (
        <div className="call-audio-popup-header">
          <span>Video settings</span>
          <PopupCloseButton className="call-audio-popup-close" ariaLabel="Close" autoFocus onClick={onClose} />
        </div>
      )}
      <div className="call-audio-popup-body">
        {!isMobile && (
          <section className="call-audio-popup-section">
            <div className="call-audio-section-label">Camera device</div>
            <div className="call-audio-device-row">
              <span>Camera</span>
              <PopupSelect
                ariaLabel="Camera"
                className="call-audio-device-select"
                value={settings.videoDeviceId}
                disabled={!capabilities.canUseCamera || videoDevices.length === 0}
                onChange={(videoDeviceId) => onPatch({ videoDeviceId })}
                options={[
                  { value: "", label: "System default" },
                  ...videoDevices.map((d) => ({ value: d.deviceId, label: d.label })),
                ]}
              />
            </div>
          </section>
        )}
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
  );

  if (embedded) {
    return <div className="call-settings-embedded-content">{content}</div>;
  }

  return (
    <PopupBackdrop className="call-audio-popup-backdrop" onClick={onClose}>
      {content}
    </PopupBackdrop>
  );
}
