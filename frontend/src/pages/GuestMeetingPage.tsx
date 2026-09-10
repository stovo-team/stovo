import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Room, RoomEvent, Track } from "livekit-client";
import { Camera, Mic, MicOff, VideoOff } from "lucide-react";
import { createGuestMeetingSession, getGuestMeetingStatus, getGuestMeetingToken, previewGuestMeeting, type GuestMeetingPreview } from "../api/guestMeetings";

export default function GuestMeetingPage() {
  const { token } = useParams();
  const [preview, setPreview] = useState<GuestMeetingPreview | null>(null);
  const [name, setName] = useState("");
  const [state, setState] = useState<"name" | "waiting" | "joining" | "joined" | "blocked" | "error">("name");
  const [error, setError] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<MediaStream[]>([]);
  const localRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [deviceTestActive, setDeviceTestActive] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);

  useEffect(() => { if (token) previewGuestMeeting(token).then(setPreview).catch((e) => { setError(e.message); setState("error"); }); }, [token]);
  useEffect(() => () => { localStreamRef.current?.getTracks().forEach((track) => track.stop()); void roomRef.current?.disconnect(); }, []);
  useEffect(() => { if (localRef.current && localStreamRef.current) localRef.current.srcObject = localStreamRef.current; }, [deviceTestActive, state]);

  async function testDevices() {
    setError(null);
    try {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = stream;
      if (localRef.current) localRef.current.srcObject = stream;
      setMicrophoneEnabled(true); setCameraEnabled(true); setDeviceTestActive(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not access your camera or microphone"); }
  }
  function toggleDevice(kind: "audio" | "video") {
    const tracks = localStreamRef.current?.getTracks().filter((track) => track.kind === kind) ?? [];
    const enabled = !tracks.every((track) => track.enabled);
    tracks.forEach((track) => { track.enabled = enabled; });
    if (kind === "audio") setMicrophoneEnabled(enabled); else setCameraEnabled(enabled);
  }
  function stopDeviceTest() { localStreamRef.current?.getTracks().forEach((track) => track.stop()); localStreamRef.current = null; if (localRef.current) localRef.current.srcObject = null; setDeviceTestActive(false); }

  async function connect() {
    if (!token) return;
    setState("joining");
    try {
      stopDeviceTest();
      const credentials = await getGuestMeetingToken(token);
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (!track.mediaStreamTrack) return;
        const stream = new MediaStream([track.mediaStreamTrack]);
        setRemoteStreams((previous) => [...previous, stream]);
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => setRemoteStreams((previous) => previous.filter((stream) => !stream.getTracks().some((item) => item.id === track.mediaStreamTrack?.id))));
      await room.connect(credentials.url, credentials.token);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = stream;
      if (localRef.current) localRef.current.srcObject = stream;
      for (const track of stream.getTracks()) await room.localParticipant.publishTrack(track, { source: track.kind === "audio" ? Track.Source.Microphone : Track.Source.Camera });
      setState("joined");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not join meeting"); setState("error"); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!token) return; setError(null);
    try { const session = await createGuestMeetingSession(token, name); if (session.state === "admitted") void connect(); else setState("waiting"); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not join meeting"); }
  }
  useEffect(() => { if (state !== "waiting" || !token) return; const timer = window.setInterval(() => void getGuestMeetingStatus(token).then((status) => { if (status.state === "admitted") void connect(); if (status.state === "blocked") { setError("The host removed you from this meeting."); setState("blocked"); } }).catch((e) => { setError(e.message); setState("error"); }), 2500); return () => window.clearInterval(timer); }, [state, token]);
  function leave() { stopDeviceTest(); void roomRef.current?.disconnect(); setRemoteStreams([]); setState("name"); }

  return <main className="guest-meeting-page"><section className="guest-meeting-card"><div className="guest-meeting-heading"><p className="eyebrow">Stovo guest meeting</p><h1>{state === "joined" ? "In the meeting" : preview?.title || "Join meeting"}</h1>
    {preview && <div className="guest-meeting-details"><span>{preview.scheduledAt ? `Planned for ${new Date(preview.scheduledAt).toLocaleString()}` : "Starts when the host opens the meeting"}</span><span>Link expires {new Date(preview.expiresAt).toLocaleString()}</span></div>}</div>
    {state === "name" && <form className="guest-meeting-join-form" onSubmit={submit}><label>Your name<input autoFocus required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>{name.trim() && <p className="guest-meeting-identity">You’ll join as <strong>{name.trim()}</strong></p>}<div className="guest-device-test"><div><strong>Check your devices</strong><span>Make sure your camera and microphone are ready.</span></div><button type="button" className="secondary-button" onClick={() => void testDevices()}><Camera size={17} /> Test mic & camera</button></div>{deviceTestActive && <div className="guest-device-preview"><video ref={localRef} autoPlay muted playsInline /><div><button type="button" className={microphoneEnabled ? "active" : ""} onClick={() => toggleDevice("audio")}>{microphoneEnabled ? <Mic size={17} /> : <MicOff size={17} />} Microphone</button><button type="button" className={cameraEnabled ? "active" : ""} onClick={() => toggleDevice("video")}>{cameraEnabled ? <Camera size={17} /> : <VideoOff size={17} />} Camera</button></div></div>}<button className="primary-button guest-meeting-join-button" type="submit">Join meeting</button></form>}
    {state === "waiting" && <p className="muted-copy">Waiting for the host to admit you…</p>}
    {state === "joining" && <p className="muted-copy">Connecting your camera and microphone…</p>}
    {state === "joined" && <div className="guest-meeting-media"><video ref={localRef} autoPlay muted playsInline /><div className="guest-meeting-remotes">{remoteStreams.map((stream, index) => <RemoteVideo key={index} stream={stream} />)}</div><button className="action-button danger" onClick={leave}>Leave meeting</button></div>}
    {error && <p className="error-text">{error}</p>}
  </section></main>;
}
function RemoteVideo({ stream }: { stream: MediaStream }) { const ref = useRef<HTMLVideoElement>(null); useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]); return <video ref={ref} autoPlay playsInline />; }
