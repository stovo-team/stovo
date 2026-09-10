import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Room, RoomEvent, Track } from "livekit-client";
import { Camera, CameraOff, Mic, MicOff, Users } from "lucide-react";
import { createGuestMeetingSession, getGuestMeetingStatus, getGuestMeetingToken, previewGuestMeeting, type GuestMeetingPreview } from "../api/guestMeetings";

type MeetingState = "name" | "waiting" | "joining" | "joined" | "blocked" | "error";

export default function GuestMeetingPage() {
  const { token } = useParams();
  const [preview, setPreview] = useState<GuestMeetingPreview | null>(null);
  const [name, setName] = useState("");
  const [state, setState] = useState<MeetingState>("name");
  const [error, setError] = useState<string | null>(null);
  const [deviceIssue, setDeviceIssue] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<MediaStream[]>([]);
  const [deviceTestActive, setDeviceTestActive] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const localRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => { if (token) previewGuestMeeting(token).then(setPreview).catch((e) => { setError(e.message); setState("error"); }); }, [token]);
  useEffect(() => () => { localStreamRef.current?.getTracks().forEach((track) => track.stop()); void roomRef.current?.disconnect(); }, []);
  useEffect(() => { if (localRef.current && localStreamRef.current) localRef.current.srcObject = localStreamRef.current; }, [deviceTestActive, state]);

  async function acquireLocalMedia() {
    const [audio, video] = await Promise.allSettled([
      navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
      navigator.mediaDevices.getUserMedia({ audio: false, video: true })
    ]);
    const tracks = [...(audio.status === "fulfilled" ? audio.value.getAudioTracks() : []), ...(video.status === "fulfilled" ? video.value.getVideoTracks() : [])];
    if (!tracks.length) throw new Error("No microphone or camera is available. Connect a device, then try again.");
    setMicrophoneEnabled(audio.status === "fulfilled");
    setCameraEnabled(video.status === "fulfilled");
    setDeviceIssue(audio.status === "rejected" && video.status === "rejected" ? "No microphone or camera was found." : audio.status === "rejected" ? "Microphone unavailable — you can still join with your camera." : video.status === "rejected" ? "Camera unavailable — you can still join with your microphone." : null);
    return new MediaStream(tracks);
  }
  function stopLocalMedia() { localStreamRef.current?.getTracks().forEach((track) => track.stop()); localStreamRef.current = null; if (localRef.current) localRef.current.srcObject = null; setDeviceTestActive(false); }
  async function testDevices() {
    setError(null); setDeviceIssue(null); stopLocalMedia();
    try { localStreamRef.current = await acquireLocalMedia(); setDeviceTestActive(true); }
    catch (e) { setDeviceIssue(e instanceof Error ? e.message : "Could not access your devices"); }
  }
  function toggleDevice(kind: "audio" | "video") {
    const tracks = localStreamRef.current?.getTracks().filter((track) => track.kind === kind) ?? [];
    if (!tracks.length) return;
    const enabled = !tracks.every((track) => track.enabled);
    tracks.forEach((track) => { track.enabled = enabled; });
    if (kind === "audio") setMicrophoneEnabled(enabled); else setCameraEnabled(enabled);
  }
  async function connect() {
    if (!token) return;
    setState("joining");
    try {
      stopLocalMedia();
      const credentials = await getGuestMeetingToken(token);
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track) => { if (track.mediaStreamTrack) setRemoteStreams((previous) => [...previous, new MediaStream([track.mediaStreamTrack!])]); });
      room.on(RoomEvent.TrackUnsubscribed, (track) => setRemoteStreams((previous) => previous.filter((stream) => !stream.getTracks().some((item) => item.id === track.mediaStreamTrack?.id))));
      await room.connect(credentials.url, credentials.token);
      const stream = await acquireLocalMedia();
      localStreamRef.current = stream;
      for (const track of stream.getTracks()) await room.localParticipant.publishTrack(track, { source: track.kind === "audio" ? Track.Source.Microphone : Track.Source.Camera });
      setState("joined");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not join meeting"); setState("error"); }
  }
  async function submit(event: FormEvent) { event.preventDefault(); if (!token) return; setError(null); try { const session = await createGuestMeetingSession(token, name); if (session.state === "admitted") void connect(); else setState("waiting"); } catch (e) { setError(e instanceof Error ? e.message : "Could not join meeting"); } }
  useEffect(() => { if (state !== "waiting" || !token) return; const timer = window.setInterval(() => void getGuestMeetingStatus(token).then((status) => { if (status.state === "admitted") void connect(); if (status.state === "blocked") { setError("The host removed you from this meeting."); setState("blocked"); } }).catch((e) => { setError(e.message); setState("error"); }), 2500); return () => window.clearInterval(timer); }, [state, token]);
  function leave() { stopLocalMedia(); void roomRef.current?.disconnect(); setRemoteStreams([]); setState("name"); }
  const participantCopy = preview?.guestCount ? `${preview.guestCount} ${preview.guestCount === 1 ? "person is" : "people are"} already here` : "No one else is here yet";

  return <main className="guest-meeting-page"><section className="guest-meeting-card">
    {state === "name" && <div className="guest-prejoin"><section className="guest-prejoin-preview"><div className="guest-preview-label">{name.trim() || "You"}</div><video ref={localRef} className={cameraEnabled ? "visible" : ""} autoPlay muted playsInline />{!cameraEnabled && <div className="guest-preview-empty"><CameraOff size={30} /><span>Camera is off</span></div>}<div className="guest-preview-controls"><button type="button" className={microphoneEnabled ? "active" : ""} disabled={!deviceTestActive} onClick={() => toggleDevice("audio")}>{microphoneEnabled ? <Mic size={18} /> : <MicOff size={18} />}<span className="visually-hidden">Toggle microphone</span></button><button type="button" className={cameraEnabled ? "active" : ""} disabled={!deviceTestActive} onClick={() => toggleDevice("video")}>{cameraEnabled ? <Camera size={18} /> : <CameraOff size={18} />}<span className="visually-hidden">Toggle camera</span></button><button type="button" className="guest-preview-test" onClick={() => void testDevices()}><Camera size={17} /> Test devices</button></div></section>
      <form className="guest-prejoin-panel" onSubmit={submit}><p className="eyebrow">Stovo guest meeting</p><h1>{preview?.title || "Join meeting"}</h1><div className="guest-prejoin-meta"><span>{preview?.scheduledAt ? `Planned for ${new Date(preview.scheduledAt).toLocaleString()}` : "Starts when the host opens the meeting"}</span><span><Users size={16} /> {participantCopy}</span></div><label>Your name<input autoFocus required minLength={2} maxLength={80} value={name} placeholder="Enter your name" onChange={(e) => setName(e.target.value)} /></label>{deviceIssue && <p className="guest-device-note">{deviceIssue}</p>}<button className="primary-button guest-meeting-join-button" type="submit">Join meeting</button><small>Link expires {preview ? new Date(preview.expiresAt).toLocaleString() : "soon"}</small></form></div>}
    {state === "waiting" && <p className="muted-copy">Waiting for the host to admit you…</p>}
    {state === "joining" && <p className="muted-copy">Joining meeting…</p>}
    {state === "joined" && <div className="guest-meeting-media"><video ref={localRef} autoPlay muted playsInline /><div className="guest-meeting-remotes">{remoteStreams.map((stream, index) => <RemoteVideo key={index} stream={stream} />)}</div><button className="action-button danger" onClick={leave}>Leave meeting</button></div>}
    {error && <p className="error-text">{error}</p>}
  </section></main>;
}
function RemoteVideo({ stream }: { stream: MediaStream }) { const ref = useRef<HTMLVideoElement>(null); useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]); return <video ref={ref} autoPlay playsInline />; }
