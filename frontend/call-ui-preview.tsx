import { useEffect, useState } from "react";
import { Camera, CameraOff, Maximize2, Mic, MicOff, Minimize2, MonitorUp, PhoneOff, RotateCcw, Settings2, Volume2, VolumeX, X } from "lucide-react";

const participants = [
  { name: "Alex Morgan", initials: "AM", color: "#6d57c8", video: false },
  { name: "Maya Chen", initials: "MC", color: "#c35f73", video: true },
  { name: "Sam Rivera", initials: "SR", color: "#268f83", video: false },
  { name: "Jordan Lee", initials: "JL", color: "#bd7c35", video: true },
  { name: "Taylor Kim", initials: "TK", color: "#4675b8", video: false },
  { name: "Riley Patel", initials: "RP", color: "#ae5eab", video: true },
  { name: "Casey Brown", initials: "CB", color: "#557b4d", video: false },
];

type ControlName = "Mute" | "Audio output" | "Turn on camera" | "Turn off camera" | "Audio settings" | "Share screen" | "End call";

function CallControl({ label, active = false, danger = false, children, onClick }: {
  label: ControlName;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return <button type="button" className={`call-preview-control${active ? " is-active" : ""}${danger ? " is-danger" : ""}`} aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

function MockAvatar({ name, initials, color, className = "" }: { name: string; initials: string; color: string; className?: string }) {
  return <span className={`call-preview-avatar ${className}`} style={{ background: `linear-gradient(145deg, ${color}, #1d2230)` }} role="img" aria-label={`${name} profile photo`}><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="24" r="12" fill="rgba(255,255,255,.78)"/><path d="M9 62c2-15 10-23 23-23s21 8 23 23" fill="rgba(255,255,255,.78)"/></svg><span className="sr-only">{initials}</span></span>;
}

function PersonCard({ name, initials, color, video, self = false, onClick }: {
  name: string; initials: string; color: string; video: boolean; self?: boolean; onClick?: () => void;
}) {
  const content = video
    ? <div className="video-placeholder" style={{ background: `radial-gradient(ellipse at 50% 34%, ${color} 0%, #263044 49%, #121722 100%)` }} role="img" aria-label={`${name} camera video`}><span className="video-silhouette" /></div>
    : <MockAvatar name={name} initials={initials} color={color} />;
  return <button type="button" className={`call-preview-share-participant${self ? " is-self" : ""}`} style={{ aspectRatio: "1 / 1" }} onClick={(event) => { event.stopPropagation(); onClick?.(); }} aria-label={`Focus ${name}`}>
    {content}<span className="call-preview-person-label">{self ? "You" : name}</span>{self && <span className="call-preview-person-status">Connected</span>}
  </button>;
}

export function CallUiPreview() {
  const [kind, setKind] = useState("Direct call");
  const [mobile, setMobile] = useState(false);
  const [count, setCount] = useState(2);
  const [camera, setCamera] = useState(false);
  const [muted, setMuted] = useState(false);
  const [soundOff, setSoundOff] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("user");
  const [sharing, setSharing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [activity, setActivity] = useState(0);

  const isDirectPair = kind === "Direct call" && count === 2;
  const remote = participants[0];
  const visiblePeople = participants.slice(0, Math.max(1, count - 1));

  useEffect(() => {
    if (!controlsVisible) return;
    const timer = window.setTimeout(() => setControlsVisible(false), 15_000);
    return () => window.clearTimeout(timer);
  }, [controlsVisible, activity]);

  useEffect(() => {
    const closeFullscreen = (event: KeyboardEvent) => { if (event.key === "Escape") setFocused(null); };
    window.addEventListener("keydown", closeFullscreen);
    return () => window.removeEventListener("keydown", closeFullscreen);
  }, []);

  const registerControlActivity = () => { setControlsVisible(true); setActivity((current) => current + 1); };
  const toggleControlsFromStage = () => setControlsVisible((visible) => !visible);
  const handleCameraToggle = () => setCamera((enabled) => !enabled);

  const primaryRow = <div className="call-preview-control-row" data-preview-control-row="primary">
    <CallControl label="Mute" active={!muted} onClick={() => setMuted((value) => !value)}>{muted ? <MicOff /> : <Mic />}</CallControl>
    <CallControl label="Audio output" active={!soundOff} onClick={() => setSoundOff((value) => !value)}>{soundOff ? <VolumeX /> : <Volume2 />}</CallControl>
    <CallControl label={camera ? "Turn off camera" : "Turn on camera"} active={camera} onClick={handleCameraToggle}>{camera ? <Camera /> : <CameraOff />}</CallControl>
  </div>;
  const secondaryRow = <div className="call-preview-control-row" data-preview-control-row="secondary">
    <CallControl label="Audio settings" active={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}><Settings2 /></CallControl>
    <CallControl label="Share screen" active={sharing} onClick={() => setSharing((value) => !value)}><MonitorUp /></CallControl>
    <CallControl label="End call" danger onClick={() => setMinimized(true)}><PhoneOff /></CallControl>
  </div>;

  return <main className={`call-preview-page${mobile ? " is-mobile" : ""}`}>
    <nav className="call-preview-toolbar" aria-label="Mock call preview options">
      <div className="call-preview-switches" aria-label="Call surface">{["Direct call", "Group call", "Voice channel", "Guest meeting"].map((label) => <button key={label} type="button" className={kind === label ? "is-selected" : ""} onClick={() => setKind(label)}>{label}</button>)}</div>
      <div className="call-preview-toolbar-options"><label>Participants <select aria-label="Number of participants" value={count} onChange={(event) => setCount(Number(event.target.value))}>{[2, 3, 4, 6, 8].map((number) => <option key={number}>{number}</option>)}</select></label>
        <div className="call-preview-switches" aria-label="Viewport"><button type="button" aria-label="Desktop" className={!mobile ? "is-selected" : ""} onClick={() => setMobile(false)}>Desktop</button><button type="button" aria-label="Mobile" className={mobile ? "is-selected" : ""} onClick={() => setMobile(true)}>Mobile</button></div>
      </div>
    </nav>
    <p className="call-preview-note">Interactive call mockup · controls and call state are simulated</p>
    {minimized ? <button type="button" className="call-preview-restore" aria-label="Restore call" onClick={() => setMinimized(false)}><Maximize2 /> Restore call</button> : <section className="call-preview-panel" aria-label={`${kind} preview`}>
      <header className="call-preview-header"><div><strong>{kind}</strong><span>Connected · {count} participants · 12:48</span></div><button className="call-preview-minimize" type="button" aria-label="Minimize call" title="Minimize call" onClick={() => setMinimized(true)}><Minimize2 aria-hidden="true" /></button></header>
      {sharing ? <div className="call-preview-share-stage" onClick={toggleControlsFromStage}>
        <button type="button" className="call-preview-share-content" aria-label="Focus shared screen" onClick={(event) => { event.stopPropagation(); setFocused("Shared screen"); }}><span>LIVE SCREEN SHARE</span><strong>Product roadmap</strong><small>Q4 planning · Milestones and owners</small><div className="call-preview-share-columns"><i /><i /><i /></div></button>
        <div className="call-preview-share-participants" aria-label="Participants while sharing">
          <PersonCard self name="You" initials="YO" color="#4887c7" video={camera} onClick={() => setFocused("You")} />
          {visiblePeople.map((person) => <PersonCard key={person.name} {...person} onClick={() => setFocused(person.name)} />)}
        </div>
      </div> : <div className={`call-preview-stage${isDirectPair ? " is-direct-pair" : " is-grid"}${focused === "local" ? " is-self-focused" : ""}`} role="region" tabIndex={0} aria-label="Toggle call controls" onClick={toggleControlsFromStage}>
        {isDirectPair ? <>
          <button type="button" className={`call-preview-main-person${camera && focused === "local" ? " is-pip" : ""}`} data-stage-role={camera && focused === "local" ? "remote-pip" : "remote-primary"} aria-label={`Focus ${remote.name}`} onClick={(event) => { event.stopPropagation(); setFocused("remote"); }}>
            <MockAvatar name={remote.name} initials={remote.initials} color={remote.color} /><span className="call-preview-person-label">{remote.name}</span><span className="call-preview-person-status">Speaking</span>
          </button>
          {camera && <div role="group" tabIndex={0} className={`call-preview-local-video${focused === "local" ? " is-primary" : " bottom-right"}`} data-stage-role={focused === "local" ? "local-primary" : "local-pip"} aria-label="Focus your video" onClick={(event) => { event.stopPropagation(); setFocused((value) => value === "local" ? "remote" : "local"); }} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.stopPropagation(); setFocused((value) => value === "local" ? "remote" : "local"); } }}>
            <div className="video-placeholder" style={{ background: cameraFacing === "user" ? "radial-gradient(ellipse at 50% 34%, #5d7390 0%, #263044 52%, #121722 100%)" : "radial-gradient(ellipse at 50% 34%, #74845d 0%, #2b3b2b 52%, #121a16 100%)" }} role="img" aria-label="Your camera video"><span className="video-silhouette" /></div><span className="call-preview-person-label">You</span>
            <button type="button" className="call-preview-flip" aria-label="Flip camera" aria-pressed={cameraFacing === "environment"} onClick={(event) => { event.stopPropagation(); setCameraFacing((mode) => mode === "user" ? "environment" : "user"); }}><RotateCcw /></button>
          </div>}
        </> : <div className="call-preview-participant-grid">{visiblePeople.map((person) => <PersonCard key={person.name} {...person} onClick={() => setFocused(person.name)} />)}<PersonCard self name="You" initials="YO" color="#4887c7" video={camera} onClick={() => setFocused("You")} /></div>}
      </div>}
      <div className={`call-preview-controls${controlsVisible ? "" : " is-hidden"}`} onPointerDown={(event) => event.stopPropagation()} onClick={registerControlActivity}>
        {primaryRow}{secondaryRow}
      </div>
    </section>}
    {settingsOpen && !minimized && <div className="call-preview-settings-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}><section className="call-preview-settings" role="dialog" aria-modal="true" aria-label="Audio settings" onClick={(event) => event.stopPropagation()}><header>Audio settings<button type="button" aria-label="Close audio settings" onClick={() => setSettingsOpen(false)}><X /></button></header><label>Microphone<select><option>System default</option><option>Built-in Microphone</option><option>USB Microphone</option></select></label><label>Speaker<select><option>System default</option><option>Headphones</option></select></label><label className="setting-toggle">Noise suppression<input type="checkbox" defaultChecked /></label><label className="setting-toggle">Echo cancellation<input type="checkbox" defaultChecked /></label></section></div>}
    {focused && <div className="call-preview-fullscreen-backdrop" role="presentation" onClick={() => setFocused(null)}><section className="call-preview-fullscreen" role="dialog" aria-modal="true" aria-label={`Fullscreen: ${focused}`} onClick={(event) => event.stopPropagation()}><button type="button" aria-label="Close fullscreen" onClick={() => setFocused(null)}><X /></button><div className="call-preview-fullscreen-content">{focused === "Shared screen" ? "Product roadmap · Q4 planning" : focused}</div></section></div>}
  </main>;
}
