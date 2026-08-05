import { RefObject } from "react";
import { Smartphone, Volume2, X } from "lucide-react";
import {
  CallCapabilities,
  CallDevice,
  CallSettings,
} from "../../../realtime/CallController";
import type { CallTrackStatus } from "../shared/types";

function AudioToggleRow({
  name,
  description,
  badge,
  checked,
  disabled,
  status,
  onChange,
}: {
  name: string;
  description: string;
  badge: "browser" | "software";
  checked: boolean;
  disabled: boolean;
  status: boolean | null;
  onChange: (value: boolean) => void;
}) {
  const id = `audio-toggle-${name.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className={`call-audio-toggle-row${disabled ? " disabled" : ""}`}>
      <div className="call-audio-toggle-info">
        <span id={id} className="call-audio-toggle-name">
          {name}
          <span className={`call-audio-badge call-audio-badge-${badge}`}>{badge}</span>
          {status === true && <span className="call-audio-status-chip active">active</span>}
          {status === false && <span className="call-audio-status-chip unsupported">not supported</span>}
        </span>
        <span className="call-audio-toggle-desc">{description}</span>
      </div>
      <label className="call-audio-toggle-switch">
        <input
          type="checkbox"
          aria-labelledby={id}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="call-audio-toggle-slider" />
      </label>
    </div>
  );
}

export function CallAudioSettingsPopup({
  popupRef,
  isMobile,
  settings,
  capabilities,
  devices,
  trackStatus,
  warning,
  onPatch,
  onClose,
}: {
  popupRef: RefObject<HTMLDivElement | null>;
  isMobile: boolean;
  settings: CallSettings;
  capabilities: CallCapabilities;
  devices: CallDevice[];
  trackStatus: CallTrackStatus | null;
  warning: string | null;
  onPatch: (patch: Partial<CallSettings>) => void;
  onClose: () => void;
}) {
  const inputDevices = devices.filter((d) => d.kind === "audioinput");
  const outputDevices = devices.filter((d) => d.kind === "audiooutput");

  return (
    <div
      className="call-audio-popup-backdrop"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={popupRef}
        className="call-audio-popup"
        role="dialog"
        aria-modal="true"
        aria-label="Audio settings"
      >
      <div className="call-audio-popup-header">
        <span>Audio settings</span>
        <button type="button" className="call-audio-popup-close" aria-label="Close" autoFocus onClick={onClose}>
          <X aria-hidden="true" size={14} />
        </button>
      </div>

      <div className="call-audio-popup-body">
        {warning && <p className="call-audio-popup-warning">{warning}</p>}

        <section className="call-audio-popup-section">
          <div className="call-audio-section-label">Devices</div>
          <label className="call-audio-device-row">
            <span>Microphone</span>
            <select
              value={settings.inputDeviceId}
              disabled={!capabilities.canSelectInputDevice}
              onChange={(e) => onPatch({ inputDeviceId: e.target.value })}
            >
              <option value="">System default</option>
              {inputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          </label>
          <label className="call-audio-device-row">
            <span>Speaker</span>
            <select
              value={settings.outputDeviceId}
              disabled={!capabilities.canSelectOutputDevice}
              onChange={(e) => onPatch({ outputDeviceId: e.target.value })}
            >
              <option value="">System default</option>
              {outputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          </label>
          {!capabilities.canSelectOutputDevice && (
            <p className="call-audio-popup-note">This browser uses the system default output only.</p>
          )}
        </section>

        <div className="call-audio-popup-divider" />

        <section className="call-audio-popup-section">
          <div className="call-audio-section-label">Levels</div>
          <div className="call-audio-slider-row">
            <div className="call-audio-slider-head">
              <span>Input gain (mic boost)</span>
              <span className="call-audio-slider-value">{Math.round(settings.inputGain)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={200}
              step={1}
              value={settings.inputGain}
              onChange={(e) => onPatch({ inputGain: Number(e.target.value) })}
            />
          </div>
          <div className="call-audio-slider-row">
            <div className="call-audio-slider-head">
              <span>Output volume</span>
              <span className="call-audio-slider-value">{Math.round(settings.outputVolume)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={settings.outputVolume}
              onChange={(e) => onPatch({ outputVolume: Number(e.target.value) })}
            />
          </div>
        </section>

        <div className="call-audio-popup-divider" />

        <section className="call-audio-popup-section">
          <div className="call-audio-section-label">Processing</div>
          <div className="call-audio-toggle-group">
            <AudioToggleRow
              name="Noise suppression"
              description="Filters background noise via browser"
              badge="browser"
              checked={settings.noiseSuppression}
              disabled={!capabilities.canUseNoiseSuppression}
              status={trackStatus?.noiseSuppression ?? null}
              onChange={(v) => onPatch({ noiseSuppression: v })}
            />
            <AudioToggleRow
              name="Echo cancellation"
              description="Prevents mic from picking up speakers"
              badge="browser"
              checked={settings.echoCancellation}
              disabled={!capabilities.canUseEchoCancellation}
              status={trackStatus?.echoCancellation ?? null}
              onChange={(v) => onPatch({ echoCancellation: v })}
            />
            <AudioToggleRow
              name="Auto gain control"
              description="Normalises mic level automatically"
              badge="browser"
              checked={settings.autoGainControl}
              disabled={!capabilities.canUseAutoGainControl}
              status={trackStatus?.autoGainControl ?? null}
              onChange={(v) => onPatch({ autoGainControl: v })}
            />
            <AudioToggleRow
              name="Voice enhancement"
              description="Highpass filter + dynamics compressor"
              badge="software"
              checked={settings.voiceEnhancement}
              disabled={!capabilities.canUseVoiceEnhancement}
              status={null}
              onChange={(v) => onPatch({ voiceEnhancement: v })}
            />
            {settings.voiceEnhancement && (
              <div className="call-audio-sub-sliders">
                <div className="call-audio-slider-row">
                  <div className="call-audio-slider-head">
                    <span>Compressor threshold</span>
                    <span className="call-audio-slider-value">{Math.round(settings.voiceEnhancementThreshold)} dB</span>
                  </div>
                  <input
                    type="range"
                    min={-50}
                    max={0}
                    step={1}
                    value={settings.voiceEnhancementThreshold}
                    onChange={(e) => onPatch({ voiceEnhancementThreshold: Number(e.target.value) })}
                  />
                </div>
                <div className="call-audio-slider-row">
                  <div className="call-audio-slider-head">
                    <span>Highpass cutoff</span>
                    <span className="call-audio-slider-value">{Math.round(settings.voiceEnhancementHighpass)} Hz</span>
                  </div>
                  <input
                    type="range"
                    min={60}
                    max={300}
                    step={5}
                    value={settings.voiceEnhancementHighpass}
                    onChange={(e) => onPatch({ voiceEnhancementHighpass: Number(e.target.value) })}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {isMobile && (
          <>
            <div className="call-audio-popup-divider" />
            <section className="call-audio-popup-section">
              <div className="call-audio-section-label">Speaker mode</div>
              <div className="call-audio-speaker-row" role="group" aria-label="Speaker mode">
                <button
                  type="button"
                  className={`call-audio-speaker-btn${settings.speakerMode === "small" ? " active" : ""}`}
                  aria-pressed={settings.speakerMode === "small"}
                  onClick={() => onPatch({ speakerMode: "small" })}
                >
                  <Smartphone aria-hidden="true" size={15} />
                  Earpiece
                </button>
                <button
                  type="button"
                  className={`call-audio-speaker-btn${settings.speakerMode === "large" ? " active" : ""}`}
                  aria-pressed={settings.speakerMode === "large"}
                  onClick={() => onPatch({ speakerMode: "large" })}
                >
                  <Volume2 aria-hidden="true" size={15} />
                  Loudspeaker
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
    </div>
  );
}
