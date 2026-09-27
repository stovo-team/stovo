import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MoreHorizontal, Settings2, Users } from "lucide-react";
import CallParticipantGrid from "./src/components/CallParticipantGrid";
import { CallControlButton } from "./src/features/chats/calling/CallControlButton";
import { CallDeviceControl } from "./src/features/chats/calling/CallDeviceControl";
import { CallParticipantStage } from "./src/features/chats/calling/CallParticipantStage";
import { CallAudioSettingsPopup } from "./src/features/chats/calling/CallAudioSettingsPopup";
import { DEFAULT_CALL_SETTINGS, type CallCapabilities, type CallDevice, type RemoteMedia } from "./src/realtime/call/types";

const mockStream = null as unknown as MediaStream;
const remoteMedia: RemoteMedia[] = [
  { userId: "Alex Morgan", stream: mockStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false, isMuted: false },
  { userId: "Maya Chen", stream: mockStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false, isMuted: true },
];
const devices: CallDevice[] = [
  { deviceId: "mic-built-in", kind: "audioinput", label: "Built-in Microphone" },
  { deviceId: "mic-usb", kind: "audioinput", label: "USB Microphone" },
  { deviceId: "speaker-default", kind: "audiooutput", label: "System Default" },
  { deviceId: "speaker-headphones", kind: "audiooutput", label: "Headphones" },
];
const capabilities: CallCapabilities = {
  canSelectInputDevice: true,
  canSelectOutputDevice: true,
  canUseNoiseSuppression: true,
  canUseEchoCancellation: true,
  canUseAutoGainControl: true,
  canUseVoiceEnhancement: true,
  canUseCamera: true,
  canShareScreen: true,
};

function Preview() {
  const [kind, setKind] = useState("Direct call");
  const [mobile, setMobile] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_CALL_SETTINGS);
  const popupRef = useRef<HTMLDivElement>(null);
  const patchSettings = (patch: Partial<typeof settings>) => setSettings((previous) => ({ ...previous, ...patch }));

  return (
    <main className={`call-preview-page${mobile ? " call-preview-mobile" : ""}`}>
      <div className="call-preview-toolbar">
        <div className="call-preview-switches" aria-label="Call surface">
          {["Direct call", "Group call", "Voice channel", "Guest meeting"].map((label) => (
            <button key={label} type="button" className={kind === label ? "active" : ""} onClick={() => setKind(label)}>{label}</button>
          ))}
        </div>
        <div className="call-preview-switches" aria-label="Viewport">
          <button type="button" className={!mobile ? "active" : ""} onClick={() => setMobile(false)}>Desktop</button>
          <button type="button" className={mobile ? "active" : ""} onClick={() => setMobile(true)}>Mobile</button>
        </div>
      </div>
      <p className="call-preview-note">Rendered from the production participant stage, control buttons, icons, status styles, and audio settings popup. Mock participants; no call connection.</p>
      <section className="call-preview-panel" aria-label={`${kind} preview`}>
        <header className="call-preview-header">
          <div><strong>{kind}</strong><br /><span>Connected · 3 participants · 12:48</span></div>
          <div><Users size={15} aria-hidden="true" /> <span>3</span> <MoreHorizontal size={20} aria-label="More options" /></div>
        </header>
        <CallParticipantStage className="shared-call-stage call-popup-video-area">
          <CallParticipantGrid
            localStream={null}
            remoteMedia={remoteMedia}
            localUserLabel="You"
            callType="video"
            isLocalSpeaking={false}
            speakingUserIds={["Alex Morgan"]}
            onFlipLocalCamera={mobile ? () => undefined : undefined}
          />
        </CallParticipantStage>
        <div className="call-ctrl-row call-popup-ctrl-row shared-call-controls guest-call-controls" aria-label="Call controls">
          <CallDeviceControl action="microphone" controlClassName="call-ctrl-btn" label="Microphone" active={!settings.micMuted} deviceKind="audioinput" selectedDeviceId={settings.inputDeviceId} devices={devices} onToggle={() => patchSettings({ micMuted: !settings.micMuted })} onDeviceChange={(inputDeviceId) => patchSettings({ inputDeviceId })} />
          <CallDeviceControl action="audio-output" controlClassName="call-ctrl-btn" label="Speaker" active={!settings.soundDisabled} deviceKind="audiooutput" selectedDeviceId={settings.outputDeviceId} devices={devices} onToggle={() => patchSettings({ soundDisabled: !settings.soundDisabled })} onDeviceChange={(outputDeviceId) => patchSettings({ outputDeviceId })} />
          <CallDeviceControl action="camera" controlClassName="call-ctrl-btn" label="Camera" active={settings.cameraEnabled} deviceKind="videoinput" selectedDeviceId={settings.videoDeviceId} devices={devices} onToggle={() => patchSettings({ cameraEnabled: !settings.cameraEnabled })} onDeviceChange={(videoDeviceId) => patchSettings({ videoDeviceId })} />
          <div className="call-ctrl-wrap call-preview-settings-anchor">
            <button type="button" className={`call-ctrl-btn${settingsOpen ? " is-active" : ""}`} aria-label="Audio settings" onClick={() => setSettingsOpen((open) => !open)}><Settings2 aria-hidden="true" size={20} /></button><span>Settings</span>
          </div>
          {mobile && <div className="call-ctrl-wrap"><CallControlButton action="flip-camera" className="call-ctrl-btn" label="Flip camera" /><span>Flip</span></div>}
          <CallControlButton action="screen-share" className="call-ctrl-btn" label="Share screen" />
          <CallControlButton action="end-call" className="call-ctrl-btn end-btn" label="End call" />
        </div>
      </section>
      {settingsOpen && <CallAudioSettingsPopup
        popupRef={popupRef}
        isMobile={mobile}
        settings={settings}
        capabilities={capabilities}
        devices={devices}
        trackStatus={null}
        warning={null}
        onPatch={patchSettings}
        onClose={() => setSettingsOpen(false)}
      />}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
