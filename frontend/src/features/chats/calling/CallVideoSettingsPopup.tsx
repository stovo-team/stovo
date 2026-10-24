import {
  CallCapabilities,
  CallDevice,
  CallSettings,
} from "../../../realtime/CallController";
import { PopupBackdrop, PopupCloseButton } from "../../../components/ui/Popup";
import { PopupSelect } from "../../../components/ui/PopupSelect";
import { useStrings } from "../../../i18n/LanguageContext";

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
  const copy = useStrings().callAudio;
  const videoDevices = devices.filter((d) => d.kind === "videoinput");

  const content = (
    <div
      className={embedded ? "call-audio-popup call-settings-embedded-panel" : "call-audio-popup"}
      role={embedded ? "region" : "dialog"}
      aria-modal={embedded ? undefined : true}
      aria-label={embedded ? copy.cameraSettings : copy.videoSettings}
      onClick={!embedded ? (e) => e.stopPropagation() : undefined}
    >
      {!embedded && (
        <div className="call-audio-popup-header">
          <span>{copy.videoSettings}</span>
          <PopupCloseButton className="call-audio-popup-close" ariaLabel={copy.close} autoFocus onClick={onClose} />
        </div>
      )}
      <div className="call-audio-popup-body">
        {!isMobile && (
          <section className="call-audio-popup-section">
            <div className="call-audio-section-label">{copy.cameraDevice}</div>
            <div className="call-audio-device-row">
              <span>{copy.camera}</span>
              <PopupSelect
                ariaLabel={copy.camera}
                className="call-audio-device-select"
                value={settings.videoDeviceId}
                disabled={!capabilities.canUseCamera || videoDevices.length === 0}
                onChange={(videoDeviceId) => onPatch({ videoDeviceId })}
                options={[
                  { value: "", label: copy.systemDefault },
                  ...videoDevices.map((d) => ({ value: d.deviceId, label: d.label })),
                ]}
              />
            </div>
          </section>
        )}
        <section className="call-audio-popup-section" aria-label={copy.display}>
          <div className="call-audio-section-label">{copy.display}</div>
          <div className="call-audio-toggle-group">
            <div className="call-audio-toggle-row">
              <div className="call-audio-toggle-info">
                <span className="call-audio-toggle-name">{copy.mirrorVideo}</span>
                <span className="call-audio-toggle-desc">{copy.mirrorVideoHelp}</span>
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
