import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Room, RoomEvent, Track } from "livekit-client";
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

  useEffect(() => { if (token) previewGuestMeeting(token).then(setPreview).catch((e) => { setError(e.message); setState("error"); }); }, [token]);
  useEffect(() => () => { localStreamRef.current?.getTracks().forEach((track) => track.stop()); void roomRef.current?.disconnect(); }, []);

  async function connect() {
    if (!token) return;
    setState("joining");
    try {
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
  function leave() { localStreamRef.current?.getTracks().forEach((track) => track.stop()); void roomRef.current?.disconnect(); setRemoteStreams([]); setState("name"); }

  return <main className="guest-meeting-page"><section className="guest-meeting-card"><p className="eyebrow">Stovo guest meeting</p><h1>{state === "joined" ? "In the meeting" : "Join meeting"}</h1>
    {preview && <p className="muted-copy">Link expires {new Date(preview.expiresAt).toLocaleString()}. {preview.admissionMode === "lobby" ? "The host will admit you." : "You can join immediately."}</p>}
    {state === "name" && <form className="form-grid" onSubmit={submit}><label>Your name<input autoFocus required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label><button className="primary-button" type="submit">Join meeting</button></form>}
    {state === "waiting" && <p className="muted-copy">Waiting for the host to admit you…</p>}
    {state === "joining" && <p className="muted-copy">Connecting your camera and microphone…</p>}
    {state === "joined" && <div className="guest-meeting-media"><video ref={localRef} autoPlay muted playsInline /><div className="guest-meeting-remotes">{remoteStreams.map((stream, index) => <RemoteVideo key={index} stream={stream} />)}</div><button className="action-button danger" onClick={leave}>Leave meeting</button></div>}
    {error && <p className="error-text">{error}</p>}
  </section></main>;
}
function RemoteVideo({ stream }: { stream: MediaStream }) { const ref = useRef<HTMLVideoElement>(null); useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]); return <video ref={ref} autoPlay playsInline />; }
