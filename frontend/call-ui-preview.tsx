import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ArrowLeft, Minimize2, MoreVertical, RotateCcw, Settings2, Share2, X } from "lucide-react";
import CallParticipantGrid from "./src/components/CallParticipantGrid";
import { CallControlButton } from "./src/features/chats/calling/CallControlButton";
import { CallDeviceControl } from "./src/features/chats/calling/CallDeviceControl";
import { CallParticipantStage } from "./src/features/chats/calling/CallParticipantStage";
import { CallAudioSettingsPopup } from "./src/features/chats/calling/CallAudioSettingsPopup";
import IconIntelligence from "./src/components/icons/IconIntelligence";
import { MeetingIntelligencePopover } from "./src/features/chats/calling/MeetingIntelligencePopover";
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
  const [mobileLandscape, setMobileLandscape] = useState(false);
  const [focusedContent, setFocusedContent] = useState<string | null>(null);
  const [focusedParticipant, setFocusedParticipant] = useState<string | null>(null);
  const [showParticipantGrid, setShowParticipantGrid] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [selfViewFullscreen, setSelfViewFullscreen] = useState(false);
  const [intelligenceOpen, setIntelligenceOpen] = useState(false);
  const [mobileMenuOffset, setMobileMenuOffset] = useState(0);
  const popupRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const mobileMoreTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const patchSettings = (patch: Partial<typeof settings>) => setSettings((previous) => ({ ...previous, ...patch }));
  const remoteMedia = createRemoteParticipants(participantCount);

  useEffect(() => {
    if (!controlsVisible || minimized || !mobile) return;
    const timer = window.setTimeout(() => setControlsVisible(false), 15_000);
    return () => window.clearTimeout(timer);
  }, [controlsVisible, minimized, mobile]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMoreOpen(false);
        mobileMoreTriggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [moreOpen, mobile]);

  useEffect(() => {
    if (!focusedContent) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusedContent(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [focusedContent]);

  useLayoutEffect(() => {
    if (!mobile || !moreOpen) return;
    const alignWithinViewport = () => {
      const anchor = mobileMoreTriggerRef.current?.parentElement?.getBoundingClientRect();
      const menu = mobileMenuRef.current;
      if (!anchor || !menu) return;
      if (mobileMoreTriggerRef.current?.closest(".call-preview-panel.is-landscape-mobile")) {
        setMobileMenuOffset(0);
        return;
      }
      const width = document.documentElement.clientWidth || window.innerWidth;
      const menuWidth = menu.getBoundingClientRect().width || Math.min(336, width - 32);
      const minLeft = 16;
      const maxLeft = Math.max(minLeft, width - menuWidth - 16);
      setMobileMenuOffset(Math.max(0, anchor.left - Math.min(maxLeft, Math.max(minLeft, anchor.left))));
    };
    alignWithinViewport();
    window.addEventListener("resize", alignWithinViewport);
    return () => window.removeEventListener("resize", alignWithinViewport);
  }, [mobile, moreOpen, mobileLandscape]);

  function openParticipant(event: React.MouseEvent<HTMLDivElement>) {
    const tile = (event.target as HTMLElement).closest<HTMLElement>(".call-grid__tile");
    const label = tile?.querySelector(".call-grid__label")?.textContent?.trim();
    if (label) setFocusedParticipant(label.replace(/ · Screen$/, ""));
  }

  const focusParticipants = [{ userId: "You", isMuted: settings.micMuted }, ...remoteMedia];
  const focusedPerson = focusParticipants.find((person) => person.userId === focusedParticipant);
  const focusedHasVideo = focusedPerson?.userId === "You"
    ? settings.cameraEnabled
    : Boolean(focusedPerson?.hasVideo && focusedPerson.stream?.getVideoTracks().some((track) => track.readyState !== "ended"));
  const showFocusedCall = Boolean(focusedPerson) && !screenSharing;

  const microphoneControl = <CallDeviceControl action="microphone" controlClassName="call-ctrl-btn" label="Microphone" active={!settings.micMuted} deviceKind="audioinput" selectedDeviceId={settings.inputDeviceId} devices={devices} onToggle={() => patchSettings({ micMuted: !settings.micMuted })} onDeviceChange={(inputDeviceId) => patchSettings({ inputDeviceId })} />;
  const speakerControl = <CallDeviceControl action="audio-output" controlClassName="call-ctrl-btn" label="Speaker" active={!settings.soundDisabled} deviceKind="audiooutput" selectedDeviceId={settings.outputDeviceId} devices={devices} onToggle={() => patchSettings({ soundDisabled: !settings.soundDisabled })} onDeviceChange={(outputDeviceId) => patchSettings({ outputDeviceId })} />;
  const cameraControl = <CallDeviceControl action="camera" controlClassName="call-ctrl-btn" label="Camera" active={settings.cameraEnabled} deviceKind="videoinput" selectedDeviceId={settings.videoDeviceId} devices={devices} onToggle={() => patchSettings({ cameraEnabled: !settings.cameraEnabled })} onDeviceChange={(videoDeviceId) => patchSettings({ videoDeviceId })} />;
  const flipControl = mobile && settings.cameraEnabled && <button type="button" className="call-ctrl-btn call-preview-flip" aria-label="Flip camera" aria-pressed={settings.cameraFacingMode === "environment"} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); patchSettings({ cameraFacingMode: settings.cameraFacingMode === "user" ? "environment" : "user" }); }}><RotateCcw size={18} aria-hidden="true" /></button>;
  const settingsControl = <div className="call-ctrl-wrap call-preview-settings-anchor"><button type="button" className={`call-ctrl-btn${settingsOpen ? " is-active" : ""}`} aria-label="Audio settings" onClick={() => setSettingsOpen((open) => !open)}><Settings2 aria-hidden="true" size={20} /></button><span>Settings</span></div>;
  const screenShareControl = <CallControlButton action="screen-share" className="call-ctrl-btn" label={screenSharing ? "Stop sharing" : "Share screen"} onClick={() => setScreenSharing((sharing) => !sharing)} />;
  const endCallControl = <CallControlButton action="end-call" className="call-ctrl-btn end-btn" label="End call" data-shape="circle" data-fixed-size="true" />;
  const isGuestMeeting = kind === "Guest meeting";

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
        <button type="button" className="call-preview-restore" aria-label="Restore call" onClick={() => setMinimized(false)}>Restore call</button>
      ) : (
        <section className={`call-preview-panel${screenSharing ? " is-sharing" : ""}${mobileLandscape ? " is-landscape-mobile" : ""}`} aria-label={`${kind} preview`} data-mobile-orientation={mobileLandscape ? "landscape" : "portrait"}>
          <header className="call-preview-header">
            <div className="call-preview-header-title"><strong>{kind}</strong></div>
            <div className={`call-preview-header-actions${showFocusedCall ? " call-preview-focus-header" : ""}`} data-narrow-layout={showFocusedCall ? "compact" : undefined}>
              {mobileLandscape && <button type="button" className="call-preview-minimize" aria-label="Close landscape view" onClick={() => setMobileLandscape(false)}><ArrowLeft size={18} aria-hidden="true" /></button>}
              {showFocusedCall && <button type="button" className="call-preview-focus-back" aria-label="Back to participants" onClick={() => { setFocusedParticipant(null); setShowParticipantGrid(true); }}><ArrowLeft size={18} aria-hidden="true" /></button>}
              {!isGuestMeeting && <button type="button" className="call-preview-minimize" aria-label="Minimize call" title="Minimize call" onClick={() => { setMoreOpen(false); setMinimized(true); }}><Minimize2 size={18} aria-hidden="true" /></button>}
            </div>
          </header>
          {showFocusedCall && focusedPerson ? (
            <div className="call-preview-focus-stage" aria-label="Focused participant">
              <div className="call-preview-focus-main" data-focus-main={focusedPerson.userId}>
                {focusedHasVideo ? <div className="call-preview-camera-feed" aria-label={`${focusedPerson.userId} video`} /> : <div className="call-preview-avatar call-preview-focus-avatar" aria-label={`${focusedPerson.userId} avatar`}>{focusedPerson.userId.slice(0, 1).toUpperCase()}</div>}
                <span>{focusedPerson.isMuted ? "Muted" : "Connected"}</span>
                <strong>{focusedPerson.userId}</strong>
              </div>
              <div className="call-preview-focus-participants" aria-label="Other participants">
                {focusParticipants.filter((person) => person.userId !== focusedPerson.userId).map((person) => (
                  <button type="button" className="call-preview-focus-participant" style={{ aspectRatio: "1 / 1" }} data-focus-participant={person.userId} key={person.userId} onClick={() => setFocusedParticipant(person.userId)}>
                    <span>{person.userId.slice(0, 1).toUpperCase()}</span><strong>{person.userId}</strong>
                  </button>
                ))}
              </div>
            </div>
          ) : screenSharing ? (
            <div className="call-preview-share-stage">
              {mobile && !mobileLandscape && <button type="button" className="call-preview-landscape-toggle" aria-label="Rotate landscape" onClick={() => setMobileLandscape(true)}><RotateCcw size={17} aria-hidden="true" /></button>}
              <div className="call-preview-share-content" data-preview-screen-share="true">
                <span>LIVE SCREEN SHARE</span><strong>Product roadmap</strong><small>Q4 planning · Milestones and owners</small>
                <div className="call-preview-share-columns"><i /><i /><i /></div>
              </div>
              {!(mobile && mobileLandscape) && <div className="call-preview-share-participants" aria-label="Participants while sharing">
                <div className="call-preview-share-participant" style={{ aspectRatio: "1 / 1" }}>
                  {settings.cameraEnabled ? <div className="call-preview-camera-feed" aria-label="Your camera preview" /> : <div className="call-preview-avatar">Y</div>}
                  <strong>You</strong><span>Connected</span>
                </div>{remoteMedia.slice(0, 3).map((person) => <div className="call-preview-share-participant" style={{ aspectRatio: "1 / 1" }} key={person.userId}>
                  <div className="call-preview-avatar">{person.userId.slice(0, 1)}</div><strong>{person.userId}</strong><span>{person.isMuted ? "Muted" : "Connected"}</span>
                </div>)}
              </div>}
            </div>
          ) : mobile && !showParticipantGrid ? (
            <div className="call-preview-mobile-stage call-popup-video-area" onPointerDown={() => setControlsVisible((visible) => !visible)}>
              {!selfViewFullscreen ? (
                <button type="button" className="call-preview-stage-primary" aria-label="Remote participant" data-stage-role="remote-primary" onClick={() => setFocusedParticipant("Alex Morgan")}>
                  <div className="call-preview-avatar call-preview-remote-avatar">A</div><strong>Alex Morgan</strong><span>Connected</span>
                </button>
              ) : (
                <button type="button" className="call-preview-stage-primary" aria-label="Your camera" data-stage-role="local-primary" onClick={() => setFocusedParticipant("You")}>
                  <div className={`call-preview-camera-feed${settings.cameraFacingMode === "environment" ? " is-back-camera" : ""}`}><span>Camera preview</span></div>
                </button>
              )}
              {settings.cameraEnabled && (
                <div className={`call-preview-stage-pip-wrap bottom-right${selfViewFullscreen ? " is-remote" : ""}`}>
                  <button
                    type="button"
                    role="button"
                    className="call-preview-stage-pip"
                    data-stage-role={selfViewFullscreen ? "remote-pip" : "local-pip"}
                    aria-label={selfViewFullscreen ? "Remote video preview" : "Local video preview"}
                    onClick={() => setSelfViewFullscreen((fullscreen) => !fullscreen)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") event.preventDefault();
                      if (event.key === "Enter") setSelfViewFullscreen((fullscreen) => !fullscreen);
                    }}
                    onKeyUp={(event) => {
                      if (event.key === " ") {
                        event.preventDefault();
                        setSelfViewFullscreen((fullscreen) => !fullscreen);
                      }
                    }}
                  >
                    {selfViewFullscreen ? <div className="call-preview-avatar call-preview-remote-avatar">A</div> : <div className={`call-preview-camera-feed${settings.cameraFacingMode === "environment" ? " is-back-camera" : ""}`} aria-label="Your camera preview" />}
                  </button>
                  {flipControl}
                </div>
              )}
            </div>
          ) : (
            <CallParticipantStage className="shared-call-stage call-popup-video-area" onClick={openParticipant} onPointerDown={() => mobile && setControlsVisible((visible) => !visible)}>
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
          <div ref={panelRef} className={`call-preview-control-rows shared-call-controls guest-call-controls${mobile && !controlsVisible ? " is-hidden" : ""}`} aria-hidden={mobile && !controlsVisible} data-layout={mobile ? "mobile-one-row" : "desktop-one-row"} data-no-wrap={mobile ? "true" : undefined} onPointerDown={(event) => event.stopPropagation()}>
            {mobile ? (
              <div className="call-preview-control-row" data-no-wrap="true" data-equal-gap="true">
                  <CallControlButton action="microphone" className="call-ctrl-btn" label={settings.micMuted ? "Unmute" : "Toggle Microphone"} aria-label="Toggle Microphone" toggle state={settings.micMuted ? "muted" : "active"} data-shape="circle" data-fixed-size="true" onClick={() => patchSettings({ micMuted: !settings.micMuted })} />
                  <CallControlButton action="audio-output" className="call-ctrl-btn" label="Toggle Speaker" aria-label="Toggle Speaker" toggle state={settings.soundDisabled ? "muted" : "active"} data-shape="circle" data-fixed-size="true" onClick={() => patchSettings({ soundDisabled: !settings.soundDisabled })} />
                  <CallControlButton action="camera" className="call-ctrl-btn" label="Toggle Camera" aria-label="Toggle Camera" toggle state={settings.cameraEnabled ? "active" : "muted"} data-shape="circle" data-fixed-size="true" onClick={() => patchSettings({ cameraEnabled: !settings.cameraEnabled })} />
                  <div className="call-ctrl-wrap call-preview-more-anchor">
                    <button ref={mobileMoreTriggerRef} type="button" className="call-ctrl-btn" aria-label="More options" aria-expanded={moreOpen} data-shape="circle" data-fixed-size="true" onClick={() => setMoreOpen((open) => screenSharing ? true : !open)}><MoreVertical size={20} aria-hidden="true" /></button><span>More</span>
                    {moreOpen && <div ref={mobileMenuRef} className="call-preview-mobile-menu" style={{ left: `${-mobileMenuOffset}px` }} role="group" aria-label="More call options">
                      <button type="button" aria-label="Settings" onClick={() => { setMoreOpen(false); setSettingsOpen(true); }}><Settings2 size={17} aria-hidden="true" /><span>Settings</span></button>
                      <button type="button" aria-label={screenSharing ? "Stop sharing" : "Screen Share"} onClick={() => setScreenSharing((sharing) => !sharing)}><Share2 size={17} aria-hidden="true" /><span>{screenSharing ? "Stop screen share" : "Screen Share"}</span></button>
                      <button type="button" aria-label="Stovo Intelligence" onClick={() => { setMoreOpen(false); setIntelligenceOpen((open) => !open); }}><IconIntelligence size={17} /><span>Stovo Intelligence</span></button>
                    </div>}
                  </div>
                  {endCallControl}
              </div>
            ) : (
              <div className="call-preview-control-row">{microphoneControl}{speakerControl}{cameraControl}{settingsControl}<div className="call-ctrl-wrap call-preview-intelligence-anchor"><button type="button" className={`call-ctrl-btn${intelligenceOpen ? " is-active" : ""}`} aria-label="Stovo Intelligence" title="Stovo Intelligence" onClick={() => setIntelligenceOpen((open) => !open)}><IconIntelligence size={20} /></button><span>Intelligence</span></div>{screenShareControl}{endCallControl}</div>
            )}
          </div>
          <MeetingIntelligencePopover
            isOpen={intelligenceOpen}
            onClose={() => setIntelligenceOpen(false)}
            notesState="idle"
            onToggleNotes={() => undefined}
            recordingState="idle"
            recordingTimer="00:00"
            onToggleRecording={() => undefined}
            isCaptionsEnabled={false}
            onToggleCaptions={() => undefined}
            targetLanguage="en"
            onChangeTargetLanguage={() => undefined}
            isMobile={mobile}
          />
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
