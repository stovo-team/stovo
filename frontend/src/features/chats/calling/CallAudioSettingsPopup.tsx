import { RefObject } from "react";
import { Smartphone, Volume2, X } from "lucide-react";
import {
  CallCapabilities,
  CallDevice,
  CallSettings,
} from "../../../realtime/CallController";
import { CallDeviceSelect } from "./CallDeviceSelect";

function AudioToggleRow({
  name,
  description,
  checked,
  disabled,
  onChange,
}: {
  name: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = `audio-toggle-${name.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className={`call-audio-toggle-row${disabled ? " disabled" : ""}`}>
      <div className="call-audio-toggle-info">
        <span id={id} className="call-audio-toggle-name">
          {name}
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
  warning,
  onPatch,
  onClose,
}: {
  popupRef: RefObject<HTMLDivElement | null>;
  isMobile: boolean;
  settings: CallSettings;
  capabilities: CallCapabilities;
  devices: CallDevice[];
  trackStatus?: unknown;
  warning: string | null;
  onPatch: (patch: Partial<CallSettings>) => void;
  onClose: () => void;
}) {
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

        <section className="call-audio-popup-section" aria-label="Microphone settings">
          <div className="call-audio-section-label">Microphone settings</div>
          <div className="call-audio-device-row">
            <span>Microphone</span>
            <CallDeviceSelect
              variant="settings"
              portalContainerRef={popupRef}
              label="Microphone"
              deviceKind="audioinput"
              selectedDeviceId={settings.inputDeviceId}
              devices={devices}
              canSelectDevice={capabilities.canSelectInputDevice}
              onDeviceChange={(inputDeviceId) => onPatch({ inputDeviceId })}
            />
          </div>
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
              disabled={!capabilities.canUseVoiceEnhancement}
              aria-label="Input gain"
              onChange={(e) => onPatch({ inputGain: Number(e.target.value) })}
            />
          </div>
        </section>

        <section className="call-audio-popup-section" aria-label="Dynamic settings">
          <div className="call-audio-section-label">Dynamic settings</div>
          <div className="call-audio-toggle-group">
            <div className="call-audio-slider-row">
              <div className="call-audio-slider-head">
                <span>Speaking sensitivity</span>
                <span className="call-audio-slider-value">{Math.round(settings.speakingSensitivity)}</span>
              </div>
              <input
                aria-label="Speaking sensitivity"
                type="range"
                min={2}
                max={24}
                step={1}
                value={settings.speakingSensitivity}
                onChange={(e) => onPatch({ speakingSensitivity: Number(e.target.value) })}
              />
            </div>
            <AudioToggleRow
              name="Noise suppression"
              description="Filters background noise via browser"
              checked={settings.noiseSuppression}
              disabled={!capabilities.canUseNoiseSuppression}
              onChange={(v) => onPatch({ noiseSuppression: v })}
            />
            <AudioToggleRow
              name="Echo cancellation"
              description="Prevents mic from picking up speakers"
              checked={settings.echoCancellation}
              disabled={!capabilities.canUseEchoCancellation}
              onChange={(v) => onPatch({ echoCancellation: v })}
            />
            <AudioToggleRow
              name="Auto gain control"
              description="Normalises mic level automatically"
              checked={settings.autoGainControl}
              disabled={!capabilities.canUseAutoGainControl}
              onChange={(v) => onPatch({ autoGainControl: v })}
            />
            <AudioToggleRow
              name="Voice enhancement"
              description="Highpass filter + dynamics compressor"
              checked={settings.voiceEnhancement}
              disabled={!capabilities.canUseVoiceEnhancement}
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

        <section className="call-audio-popup-section" aria-label="Speaker settings">
          <div className="call-audio-section-label">Speaker</div>
          <div className="call-audio-device-row">
            <span>Output device</span>
            <CallDeviceSelect
              variant="settings"
              portalContainerRef={popupRef}
              label="Speaker"
              deviceKind="audiooutput"
              selectedDeviceId={settings.outputDeviceId}
              devices={devices}
              canSelectDevice={capabilities.canSelectOutputDevice}
              onDeviceChange={(outputDeviceId) => onPatch({ outputDeviceId })}
            />
          </div>
          {!capabilities.canSelectOutputDevice && <p className="call-audio-popup-note">This browser uses the system default output only.</p>}
          <div className="call-audio-slider-row">
            <div className="call-audio-slider-head"><span>Output volume</span><span className="call-audio-slider-value">{Math.round(settings.outputVolume)}%</span></div>
            <input type="range" min={0} max={100} step={1} value={settings.outputVolume} onChange={(e) => onPatch({ outputVolume: Number(e.target.value) })} />
          </div>
          {isMobile && (
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
          )}
        </section>
      </div>
    </div>
    </div>
  );
}
