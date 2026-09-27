import { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MoreVertical, Settings2, Users, X } from "lucide-react";
import CallParticipantGrid from "./src/components/CallParticipantGrid";
import { CallControlButton } from "./src/features/chats/calling/CallControlButton";
import { CallDeviceControl } from "./src/features/chats/calling/CallDeviceControl";
import { CallParticipantStage } from "./src/features/chats/calling/CallParticipantStage";
import { CallAudioSettingsPopup } from "./src/features/chats/calling/CallAudioSettingsPopup";
import { DEFAULT_CALL_SETTINGS, type CallCapabilities, type CallDevice, type RemoteMedia } from "./src/realtime/call/types";

const participantNames = ["Alex Morgan", "Maya Chen", "Sam Rivera", "Jordan Lee", "Taylor Kim", "Riley Patel", "Casey Brown"];
const mockStream = null as unknown as MediaStream;
const devices: CallDevice[] = [
  { deviceId: "mic-built-in", kind: "audioinput", label: "Built-in Microphone" },
  { deviceId: "mic-usb", kind: "audioinput", label: "USB Microphone" },
  { deviceId: "speaker-default", kind: "audiooutput", label: "System Default" },
  { deviceId: "speaker-headphones", kind: "audiooutput", label: "Headphones" },
  { deviceId: "camera-built-in", kind: "videoinput", label: "Built-in Camera" },
  { deviceId: "camera-usb", kind: "videoinput", label: "USB Camera" },
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

function createRemoteParticipants(count: number): RemoteMedia[] {
  return participantNames.slice(0, count - 1).map((userId, index) => ({
    userId,
    stream: mockStream,
    screenStream: null,
    hasVideo: false,
    hasAudio: true,
    hasScreenShare: false,
    isMuted: index === 1,
  }));
}

export function CallUiPreview() {
  const [kind, setKind] = useState("Direct call");
  const [mobile, setMobile] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_CALL_SETTINGS);
  const [participantCount, setParticipantCount] = useState(3);
  const [screenSharing, setScreenSharing] = useState(false);
  const [focusedContent, setFocusedContent] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const patchSettings = (patch: Partial<typeof settings>) => setSettings((previous) => ({ ...previous, ...patch }));
  const remoteMedia = createRemoteParticipants(participantCount);

  useEffect(() => {
    if (!focusedContent) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusedContent(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [focusedContent]);

  function openParticipant(event: React.MouseEvent<HTMLDivElement>) {
    const tile = (event.target as HTMLElement).closest<HTMLElement>(".call-grid__tile");
    const label = tile?.querySelector(".call-grid__label")?.textContent?.trim();
    if (label) setFocusedContent(label.replace(/ · Screen$/, ""));
  }

  const microphoneControl = <CallDeviceControl action="microphone" controlClassName="call-ctrl-btn" label="Microphone" active={!settings.micMuted} deviceKind="audioinput" selectedDeviceId={settings.inputDeviceId} devices={devices} onToggle={() => patchSettings({ micMuted: !settings.micMuted })} onDeviceChange={(inputDeviceId) => patchSettings({ inputDeviceId })} />;
  const speakerControl = <CallDeviceControl action="audio-output" controlClassName="call-ctrl-btn" label="Speaker" active={!settings.soundDisabled} deviceKind="audiooutput" selectedDeviceId={settings.outputDeviceId} devices={devices} onToggle={() => patchSettings({ soundDisabled: !settings.soundDisabled })} onDeviceChange={(outputDeviceId) => patchSettings({ outputDeviceId })} />;
  const cameraControl = <CallDeviceControl action="camera" controlClassName="call-ctrl-btn" label="Camera" active={settings.cameraEnabled} deviceKind="videoinput" selectedDeviceId={settings.videoDeviceId} devices={devices} onToggle={() => patchSettings({ cameraEnabled: !settings.cameraEnabled })} onDeviceChange={(videoDeviceId) => patchSettings({ videoDeviceId })} />;
  const flipControl = mobile && settings.cameraEnabled && <CallControlButton action="flip-camera" className="call-ctrl-btn" label="Flip camera" aria-pressed={settings.cameraFacingMode === "environment"} onClick={() => patchSettings({ cameraFacingMode: settings.cameraFacingMode === "user" ? "environment" : "user" })} />;
  const settingsControl = <div className="call-ctrl-wrap call-preview-settings-anchor"><button type="button" className={`call-ctrl-btn${settingsOpen ? " is-active" : ""}`} aria-label="Audio settings" onClick={() => setSettingsOpen((open) => !open)}><Settings2 aria-hidden="true" size={20} /></button><span>Settings</span></div>;
  const screenShareControl = <CallControlButton action="screen-share" className="call-ctrl-btn" label={screenSharing ? "Stop sharing" : "Share screen"} onClick={() => setScreenSharing((sharing) => !sharing)} />;
  const endCallControl = <CallControlButton action="end-call" className="call-ctrl-btn end-btn" label="End call" />;

  return (
    <main className={`call-preview-page${mobile ? " call-preview-mobile" : ""}`}>
      <div className="call-preview-toolbar">
        <div className="call-preview-switches" aria-label="Call surface">
          {["Direct call", "Group call", "Voice channel", "Guest meeting"].map((label) => (
            <button key={label} type="button" className={kind === label ? "active" : ""} onClick={() => setKind(label)}>{label}</button>
          ))}
        </div>
        <div className="call-preview-toolbar-options">
          <label>Participants
            <select aria-label="Number of participants" value={participantCount} onChange={(event) => setParticipantCount(Number(event.target.value))}>
              {[2, 3, 4, 6, 8].map((count) => <option key={count} value={count}>{count}</option>)}
            </select>
          </label>
          <div className="call-preview-switches" aria-label="Viewport">
            <button type="button" aria-label="Desktop" className={!mobile ? "active" : ""} onClick={() => setMobile(false)}>Desktop</button>
            <button type="button" aria-label="Mobile" className={mobile ? "active" : ""} onClick={() => setMobile(true)}>Mobile</button>
          </div>
        </div>
      </div>
      <p className="call-preview-note">Production call components with mock participants and devices. Controls are interactive; no call connection is started.</p>
      {minimized ? (
        <button type="button" className="call-preview-restore" onClick={() => setMinimized(false)}>Restore call</button>
      ) : (
        <section className={`call-preview-panel${screenSharing ? " is-sharing" : ""}`} aria-label={`${kind} preview`}>
          <header className="call-preview-header">
            <div><strong>{kind}</strong><br /><span>Connected · {participantCount} participants · 12:48</span></div>
            <div className="call-preview-header-actions"><Users size={15} aria-hidden="true" /> <span>{participantCount}</span>
              <button type="button" className="call-preview-more-trigger" aria-label="More options" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}><MoreVertical size={20} aria-hidden="true" /></button>
              {moreOpen && <div className="call-preview-more-menu" role="menu"><button type="button" role="menuitem" aria-label="Minimize call" onClick={() => { setMoreOpen(false); setMinimized(true); }}>Minimize call</button></div>}
            </div>
          </header>
          {screenSharing ? (
            <div className="call-preview-share-stage">
              <button type="button" className="call-preview-share-content" aria-label="Focus shared screen" data-preview-screen-share="true" onClick={() => setFocusedContent("Shared screen")}>
                <span>LIVE SCREEN SHARE</span><strong>Product roadmap</strong><small>Q4 planning · Milestones and owners</small>
                <div className="call-preview-share-columns"><i /><i /><i /></div>
              </button>
              <div className="call-preview-share-participants" aria-label="Participants while sharing">
                <div>You <span>Connected</span></div>{remoteMedia.slice(0, 3).map((person) => <div key={person.userId}>{person.userId}<span>{person.isMuted ? "Muted" : "Connected"}</span></div>)}
              </div>
            </div>
          ) : (
            <CallParticipantStage className="shared-call-stage call-popup-video-area" onClick={openParticipant}>
              <CallParticipantGrid
                localStream={null}
                remoteMedia={remoteMedia}
                localUserLabel="You"
                callType="video"
                isLocalSpeaking={false}
                speakingUserIds={["Alex Morgan"]}
                localVideoPlaceholder={settings.cameraEnabled ? <div className={`call-preview-camera-feed${settings.cameraFacingMode === "environment" ? " is-back-camera" : ""}`} aria-label="Your camera preview"><span>Camera preview</span></div> : undefined}
              />
            </CallParticipantStage>
          )}
          <div className="call-preview-control-rows shared-call-controls guest-call-controls" data-layout={mobile ? "mobile-two-row" : "desktop-one-row"}>
            {mobile ? (
              <>
                <div className="call-preview-control-row">{microphoneControl}{speakerControl}</div>
                <div className="call-preview-control-row">{cameraControl}{flipControl}{settingsControl}{screenShareControl}{endCallControl}</div>
              </>
            ) : (
              <div className="call-preview-control-row">{microphoneControl}{speakerControl}{cameraControl}{settingsControl}{screenShareControl}{endCallControl}</div>
            )}
          </div>
        </section>
      )}
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
      {focusedContent && <div className="call-preview-fullscreen-backdrop" role="presentation" onClick={() => setFocusedContent(null)}>
        <section className="call-preview-fullscreen" role="dialog" aria-modal="true" aria-label={`Fullscreen: ${focusedContent}`} onClick={(event) => event.stopPropagation()}>
          <button type="button" aria-label="Close fullscreen" onClick={() => setFocusedContent(null)}><X size={20} /></button>
          <div className="call-preview-fullscreen-content">{focusedContent === "Shared screen" ? "Product roadmap · Q4 planning" : focusedContent}</div>
        </section>
      </div>}
    </main>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  const previewWindow = window as Window & { __callUiPreviewRoot?: Root };
  previewWindow.__callUiPreviewRoot ??= createRoot(rootElement);
  previewWindow.__callUiPreviewRoot.render(<CallUiPreview />);
}
