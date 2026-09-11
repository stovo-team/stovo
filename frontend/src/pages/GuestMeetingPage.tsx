import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Room, RoomEvent, Track } from "livekit-client";
import { Camera, CameraOff, ChevronDown, Mic, MicOff, Settings, Users, Volume2, VolumeX } from "lucide-react";
import VeloLogo from "../components/VeloLogo";
import { createGuestMeetingSession, getGuestMeetingStatus, getGuestMeetingToken, previewGuestMeeting, type GuestMeetingPreview } from "../api/guestMeetings";
import { resolveLiveKitUrl } from "../realtime/call/livekitUrl";

type MeetingState = "name" | "waiting" | "joining" | "joined" | "blocked" | "error";
type SinkableMediaElement = HTMLMediaElement & { setSinkId?: (deviceId: string) => Promise<void> };
type SinkableAudioContext = AudioContext & { setSinkId?: (deviceId: string) => Promise<void> };

function deviceLabel(device: MediaDeviceInfo, fallback: string, index: number) {
  return device.label || `${fallback} ${index + 1}`;
}

export default function GuestMeetingPage() {
  const { token } = useParams();
  const [preview, setPreview] = useState<GuestMeetingPreview | null>(null);
  const [name, setName] = useState("");
  const [state, setState] = useState<MeetingState>("name");
  const [error, setError] = useState<string | null>(null);
  const [deviceIssue, setDeviceIssue] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<MediaStream[]>([]);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneDeviceId, setMicrophoneDeviceId] = useState("");
  const [speakerDeviceId, setSpeakerDeviceId] = useState("");
  const [cameraDeviceId, setCameraDeviceId] = useState("");
  const [inputGain, setInputGain] = useState(100);
  const [outputVolume, setOutputVolume] = useState(100);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [meterLevel, setMeterLevel] = useState(0);
  const localRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const sourceAudioStreamRef = useRef<MediaStream | null>(null);
  const sourceVideoStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputGainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const meterFrameRef = useRef<number | null>(null);

  const inputDevices = devices.filter((device) => device.kind === "audioinput");
  const outputDevices = devices.filter((device) => device.kind === "audiooutput");
  const videoDevices = devices.filter((device) => device.kind === "videoinput");

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try { setDevices(await navigator.mediaDevices.enumerateDevices()); } catch { /* The system default remains usable. */ }
  }

  function stopLocalMedia() {
    if (meterFrameRef.current !== null) window.cancelAnimationFrame(meterFrameRef.current);
    meterFrameRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    sourceAudioStreamRef.current?.getTracks().forEach((track) => track.stop());
    sourceVideoStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    sourceAudioStreamRef.current = null;
    sourceVideoStreamRef.current = null;
    analyserRef.current = null;
    inputGainNodeRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
    if (localRef.current) localRef.current.srcObject = null;
    setMeterLevel(0);
  }

  async function startLocalMedia(next = { microphoneDeviceId, cameraDeviceId }, previousTracks: MediaStreamTrack[] = []) {
    stopLocalMedia();
    const [audio, video] = await Promise.allSettled([
      navigator.mediaDevices.getUserMedia({ audio: next.microphoneDeviceId ? { deviceId: { exact: next.microphoneDeviceId } } : true, video: false }),
      navigator.mediaDevices.getUserMedia({ audio: false, video: next.cameraDeviceId ? { deviceId: { exact: next.cameraDeviceId } } : true })
    ]);
    const local = new MediaStream();
    let micAvailable = false;
    let cameraAvailable = false;
    if (audio.status === "fulfilled") {
      sourceAudioStreamRef.current = audio.value;
      const rawTrack = audio.value.getAudioTracks()[0];
      if (rawTrack) {
        try {
          const context = new AudioContext();
          const source = context.createMediaStreamSource(audio.value);
          const analyser = context.createAnalyser();
          const gain = context.createGain();
          const destination = context.createMediaStreamDestination();
          analyser.fftSize = 256;
          gain.gain.value = inputGain / 100;
          if (context.state === "suspended") await context.resume().catch(() => undefined);
          source.connect(analyser);
          analyser.connect(gain);
          gain.connect(destination);
          const processedTrack = destination.stream.getAudioTracks()[0];
          if (processedTrack) local.addTrack(processedTrack);
          audioContextRef.current = context;
          analyserRef.current = analyser;
          inputGainNodeRef.current = gain;
        } catch { local.addTrack(rawTrack); }
        micAvailable = true;
      }
    }
    if (video.status === "fulfilled") {
      sourceVideoStreamRef.current = video.value;
      video.value.getVideoTracks().forEach((track) => local.addTrack(track));
      cameraAvailable = local.getVideoTracks().length > 0;
    }
    if (!local.getTracks().length) {
      setMicrophoneEnabled(false);
      setCameraEnabled(false);
      setDeviceIssue("No microphone or camera is available. Check your device permissions in Settings.");
      return;
    }
    localStreamRef.current = local;
    local.getAudioTracks().forEach((track) => { track.enabled = microphoneEnabled && micAvailable; });
    local.getVideoTracks().forEach((track) => { track.enabled = cameraEnabled && cameraAvailable; });
    setMicrophoneEnabled((enabled) => enabled && micAvailable);
    setCameraEnabled((enabled) => enabled && cameraAvailable);
    setDeviceIssue(!micAvailable || !cameraAvailable ? "A selected device is unavailable. Choose another device in Settings." : null);
    if (localRef.current) localRef.current.srcObject = local;
    await refreshDevices();
    if (roomRef.current) {
      await Promise.all(previousTracks.map((track) => roomRef.current?.localParticipant.unpublishTrack(track).catch(() => undefined)));
      for (const track of local.getTracks()) {
        if (track.enabled) await roomRef.current.localParticipant.publishTrack(track, { source: track.kind === "audio" ? Track.Source.Microphone : Track.Source.Camera });
      }
    }
  }

  async function selectInputDevice(kind: "audio" | "video", deviceId: string) {
    const next = { microphoneDeviceId: kind === "audio" ? deviceId : microphoneDeviceId, cameraDeviceId: kind === "video" ? deviceId : cameraDeviceId };
    const previousTracks = localStreamRef.current?.getTracks() ?? [];
    if (kind === "audio") setMicrophoneDeviceId(deviceId); else setCameraDeviceId(deviceId);
    try { await startLocalMedia(next, previousTracks); } catch (e) { setDeviceIssue(e instanceof Error ? e.message : "Could not switch the selected device."); }
  }

  function toggleDevice(kind: "audio" | "video") {
    const tracks = localStreamRef.current?.getTracks().filter((track) => track.kind === kind) ?? [];
    const enabled = !tracks.every((track) => track.enabled);
    tracks.forEach((track) => { track.enabled = enabled; });
    if (kind === "audio") setMicrophoneEnabled(enabled); else setCameraEnabled(enabled);
  }

  function setMicVolume(value: number) {
    setInputGain(value);
    if (inputGainNodeRef.current) inputGainNodeRef.current.gain.value = value / 100;
  }

  async function testSound() {
    if (!speakerEnabled) return;
    try {
      const context = new AudioContext() as SinkableAudioContext;
      if (speakerDeviceId && context.setSinkId) await context.setSinkId(speakerDeviceId);
      if (context.state === "suspended") await context.resume();
      [523.25, 659.25, 783.99].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * 0.18;
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime((outputVolume / 100) * 0.25, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.18);
      });
      window.setTimeout(() => void context.close().catch(() => undefined), 800);
    } catch { setDeviceIssue("Could not play the speaker test in this browser."); }
  }

  useEffect(() => { if (token) previewGuestMeeting(token).then(setPreview).catch((e) => { setError(e.message); setState("error"); }); }, [token]);
  useEffect(() => {
    void refreshDevices();
    void startLocalMedia().catch((e) => setDeviceIssue(e instanceof Error ? e.message : "Could not access your devices."));
    return () => { stopLocalMedia(); void roomRef.current?.disconnect(); };
    // Device permission is intentionally requested once on page entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (localRef.current && localStreamRef.current) localRef.current.srcObject = localStreamRef.current; }, [state]);
  useEffect(() => {
    if (!settingsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { setSettingsOpen(false); settingsButtonRef.current?.focus(); } };
    const onPointerDown = (event: MouseEvent) => { if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) setSettingsOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.removeEventListener("mousedown", onPointerDown); };
  }, [settingsOpen]);
  useEffect(() => {
    if (!settingsOpen || !analyserRef.current || !microphoneEnabled) { setMeterLevel(0); return; }
    const analyser = analyserRef.current;
    const values = new Uint8Array(analyser.fftSize);
    const updateMeter = () => {
      analyser.getByteTimeDomainData(values);
      let peak = 0;
      values.forEach((value) => { peak = Math.max(peak, Math.abs(value - 128)); });
      setMeterLevel(Math.min(100, Math.round((peak / 128) * 180)));
      meterFrameRef.current = window.requestAnimationFrame(updateMeter);
    };
    updateMeter();
    return () => { if (meterFrameRef.current !== null) window.cancelAnimationFrame(meterFrameRef.current); meterFrameRef.current = null; };
  }, [settingsOpen, microphoneEnabled]);

  async function connect() {
    if (!token) return;
    setState("joining");
    try {
      const credentials = await getGuestMeetingToken(token);
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track) => { if (track.mediaStreamTrack) setRemoteStreams((previous) => [...previous, new MediaStream([track.mediaStreamTrack!])]); });
      room.on(RoomEvent.TrackUnsubscribed, (track) => setRemoteStreams((previous) => previous.filter((stream) => !stream.getTracks().some((item) => item.id === track.mediaStreamTrack?.id))));
      await room.connect(resolveLiveKitUrl(credentials.url), credentials.token);
      if (!localStreamRef.current) await startLocalMedia();
      for (const track of localStreamRef.current?.getTracks() ?? []) {
        if (track.enabled) await room.localParticipant.publishTrack(track, { source: track.kind === "audio" ? Track.Source.Microphone : Track.Source.Camera });
      }
      setState("joined");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not join meeting"); setState("error"); }
  }
  async function submit(event: FormEvent) { event.preventDefault(); if (!token) return; setError(null); try { const session = await createGuestMeetingSession(token, name); if (session.state === "admitted") void connect(); else setState("waiting"); } catch (e) { setError(e instanceof Error ? e.message : "Could not join meeting"); } }
  useEffect(() => { if (state !== "waiting" || !token) return; const timer = window.setInterval(() => void getGuestMeetingStatus(token).then((status) => { if (status.state === "admitted") void connect(); if (status.state === "blocked") { setError("The host removed you from this meeting."); setState("blocked"); } }).catch((e) => { setError(e.message); setState("error"); }), 2500); return () => window.clearInterval(timer); }, [state, token]);
  function leave() { stopLocalMedia(); void roomRef.current?.disconnect(); roomRef.current = null; setRemoteStreams([]); setState("name"); void startLocalMedia(); }
  const participantCopy = preview?.guestCount ? `${preview.guestCount} ${preview.guestCount === 1 ? "person is" : "people are"} already here` : "No one else is here yet";

  return <main className="guest-meeting-page"><div className="guest-stovo-brand"><VeloLogo size={30} title="Stovo" /><span>Stovo</span></div><section className="guest-meeting-card">
    {state === "name" && <div className="guest-prejoin"><section className="guest-prejoin-preview"><div className="guest-preview-label">{name.trim() || "You"}</div><video ref={localRef} className={cameraEnabled ? "visible" : ""} autoPlay muted playsInline />{!cameraEnabled && <div className="guest-preview-empty"><CameraOff size={34} /><span>Camera is off</span></div>}<div className="guest-preview-controls">
      <DeviceControl label="Microphone" active={microphoneEnabled} onToggle={() => toggleDevice("audio")} icon={microphoneEnabled ? <Mic size={23} /> : <MicOff size={23} />}><DeviceSelect value={microphoneDeviceId} onChange={(value) => void selectInputDevice("audio", value)} devices={inputDevices} fallback="Microphone" /></DeviceControl>
      <DeviceControl label="Speaker" active={speakerEnabled} onToggle={() => setSpeakerEnabled((enabled) => !enabled)} icon={speakerEnabled ? <Volume2 size={23} /> : <VolumeX size={23} />}><DeviceSelect value={speakerDeviceId} onChange={setSpeakerDeviceId} devices={outputDevices} fallback="Speaker" /></DeviceControl>
      <DeviceControl label="Camera" active={cameraEnabled} onToggle={() => toggleDevice("video")} icon={cameraEnabled ? <Camera size={23} /> : <CameraOff size={23} />}><DeviceSelect value={cameraDeviceId} onChange={(value) => void selectInputDevice("video", value)} devices={videoDevices} fallback="Camera" /></DeviceControl>
    </div></section>
      <form className="guest-prejoin-panel" onSubmit={submit}><div className="guest-prejoin-title-row"><h1>{preview?.title || "Join meeting"}</h1><div className="guest-settings" ref={settingsRef}><button ref={settingsButtonRef} className="guest-settings-trigger" type="button" aria-label="Open device settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}><Settings size={22} /></button>{settingsOpen && <section className="guest-settings-popover" role="dialog" aria-label="Device settings"><div className="guest-settings-section"><label>Microphone volume <strong>{inputGain}%</strong><input aria-label="Microphone volume" type="range" min="0" max="200" value={inputGain} onChange={(event) => setMicVolume(Number(event.target.value))} /></label><div className="guest-mic-test"><span>Microphone test</span>{analyserRef.current && microphoneEnabled ? <div className="guest-mic-meter" aria-label={`Microphone level ${meterLevel}%`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={meterLevel}><i style={{ width: `${meterLevel}%` }} /></div> : <small>Microphone unavailable</small>}</div></div><div className="guest-settings-section"><label>Speaker volume <strong>{outputVolume}%</strong><input aria-label="Speaker volume" type="range" min="0" max="100" value={outputVolume} onChange={(event) => setOutputVolume(Number(event.target.value))} /></label><button type="button" className="guest-test-sound" disabled={!speakerEnabled} onClick={() => void testSound()}><Volume2 size={16} /> Test sound</button></div>{deviceIssue && <p className="guest-device-issue" role="status">{deviceIssue}</p>}</section>}</div></div><div className="guest-prejoin-meta">{preview?.scheduledAt && <span>{new Date(preview.scheduledAt).toLocaleString()}</span>}<span><Users size={16} /> {participantCopy}</span></div><label>Your name<input autoFocus required minLength={2} maxLength={80} value={name} placeholder="Enter your name" onChange={(e) => setName(e.target.value)} /></label><button className="primary-button guest-meeting-join-button" type="submit">Join meeting</button><small>Link expires {preview ? new Date(preview.expiresAt).toLocaleString() : "soon"}</small></form></div>}
    {state === "waiting" && <p className="muted-copy">Waiting for the host to admit you…</p>}
    {state === "joining" && <p className="muted-copy">Joining meeting…</p>}
    {state === "joined" && <div className="guest-meeting-media"><video ref={localRef} autoPlay muted playsInline /><div className="guest-meeting-remotes">{remoteStreams.map((stream, index) => <RemoteVideo key={index} stream={stream} outputVolume={outputVolume} speakerEnabled={speakerEnabled} speakerDeviceId={speakerDeviceId} />)}</div><button className="action-button danger" onClick={leave}>Leave meeting</button></div>}
    {error && <p className="error-text">{error}</p>}
  </section></main>;
}

function DeviceControl({ label, active, onToggle, icon, children }: { label: string; active: boolean; onToggle: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="guest-device-control"><button type="button" className={active ? "active" : ""} aria-label={`Toggle ${label}`} aria-pressed={active} onClick={onToggle}>{icon}</button>{children}</div>;
}
function DeviceSelect({ value, onChange, devices, fallback }: { value: string; onChange: (value: string) => void; devices: MediaDeviceInfo[]; fallback: string }) {
  return <span className="guest-device-select"><select aria-label={`Select ${fallback}`} value={value} onChange={(event) => onChange(event.target.value)}><option value="">System default</option>{devices.map((device, index) => <option value={device.deviceId} key={device.deviceId}>{deviceLabel(device, fallback, index)}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></span>;
}
function RemoteVideo({ stream, outputVolume, speakerEnabled, speakerDeviceId }: { stream: MediaStream; outputVolume: number; speakerEnabled: boolean; speakerDeviceId: string }) { const ref = useRef<HTMLVideoElement>(null); useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]); useEffect(() => { const video = ref.current as SinkableMediaElement | null; if (!video) return; video.volume = speakerEnabled ? outputVolume / 100 : 0; if (speakerDeviceId && video.setSinkId) void video.setSinkId(speakerDeviceId).catch(() => undefined); }, [outputVolume, speakerDeviceId, speakerEnabled]); return <video ref={ref} autoPlay playsInline />; }
