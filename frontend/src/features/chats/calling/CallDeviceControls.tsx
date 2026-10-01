import type { CallCapabilities, CallDevice, CallSettings } from "../../../realtime/call/types";
import { CallDeviceControl } from "./CallDeviceControl";
import type { CallDeviceStrings } from "./CallDeviceSelect";

export function CallDeviceControls({
  settings,
  devices,
  capabilities = {
    canSelectInputDevice: true,
    canSelectOutputDevice: true,
    canUseNoiseSuppression: false,
    canUseEchoCancellation: false,
    canUseAutoGainControl: false,
    canUseVoiceEnhancement: false,
    canUseCamera: true,
    canShareScreen: false,
  },
  controlClassName,
  cameraActive = settings.cameraEnabled,
  showCamera = true,
  labels,
  toggleLabels,
  deviceStrings,
  onPatch,
  onToggleCamera,
}: {
  settings: CallSettings;
  devices: CallDevice[];
  capabilities: CallCapabilities;
  controlClassName: string;
  cameraActive?: boolean;
  showCamera?: boolean;
  labels?: { microphone?: string; speaker?: string; camera?: string };
  toggleLabels?: { microphone?: string; speaker?: string; camera?: string };
  deviceStrings?: CallDeviceStrings;
  onPatch: (patch: Partial<CallSettings>) => void;
  onToggleCamera: () => void;
}) {
  return (
    <>
      <CallDeviceControl
        action="microphone"
        controlClassName={controlClassName}
        label={labels?.microphone ?? "Microphone"}
        toggleLabel={toggleLabels?.microphone}
        deviceStrings={deviceStrings}
        active={!settings.micMuted}
        deviceKind="audioinput"
        selectedDeviceId={settings.inputDeviceId}
        devices={devices}
        canSelectDevice={capabilities.canSelectInputDevice}
        onToggle={() => onPatch({ micMuted: !settings.micMuted })}
        onDeviceChange={(inputDeviceId) => onPatch({ inputDeviceId })}
      />
      <CallDeviceControl
        action="audio-output"
        controlClassName={controlClassName}
        label={labels?.speaker ?? "Speaker"}
        toggleLabel={toggleLabels?.speaker}
        deviceStrings={deviceStrings}
        active={!settings.soundDisabled}
        deviceKind="audiooutput"
        selectedDeviceId={settings.outputDeviceId}
        devices={devices}
        canSelectDevice={capabilities.canSelectOutputDevice}
        onToggle={() => onPatch({ soundDisabled: !settings.soundDisabled })}
        onDeviceChange={(outputDeviceId) => onPatch({ outputDeviceId })}
      />
      {showCamera && <CallDeviceControl
        action="camera"
        controlClassName={controlClassName}
        label={labels?.camera ?? "Camera"}
        toggleLabel={toggleLabels?.camera}
        deviceStrings={deviceStrings}
        active={cameraActive}
        deviceKind="videoinput"
        selectedDeviceId={settings.videoDeviceId}
        devices={devices}
        canSelectDevice={capabilities.canUseCamera}
        onToggle={onToggleCamera}
        onDeviceChange={(videoDeviceId) => onPatch({ videoDeviceId })}
      />}
    </>
  );
}
