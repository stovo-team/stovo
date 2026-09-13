import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Room, RoomEvent, Track, VideoPreset } from "livekit-client";
import { Camera, CameraOff, ChevronDown, Link2Off, Mic, MicOff, PhoneOff, ScreenShare, ScreenShareOff, Settings, Users, Volume2, VolumeX } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import StovoLogo from "../components/StovoLogo";
import { RealAvatar } from "../features/chats/sidebar/RealAvatar";
import { createGuestMeetingSession, getGuestMeetingStatus, getGuestMeetingToken, GuestMeetingLinkError, leaveGuestMeetingSession, previewGuestMeeting, type GuestMeetingPreview } from "../api/guestMeetings";
import { resolveLiveKitUrl } from "../realtime/call/livekitUrl";

type MeetingState = "name" | "waiting" | "joining" | "joined" | "blocked" | "expired" | "error";
type RemoteParticipantStream = { id: string; cameraStream: MediaStream | null; screenStream: MediaStream | null };
type SinkableMediaElement = HTMLMediaElement & { setSinkId?: (deviceId: string) => Promise<void> };
type SinkableAudioContext = AudioContext & { setSinkId?: (deviceId: string) => Promise<void> };
const SPEAKING_RING_RELEASE_DELAY_MS = 1000;

function deviceLabel(device: MediaDeviceInfo, fallback: string, index: number) {
  return device.label || `${fallback} ${index + 1}`;
}

function streamAspectRatio(stream: MediaStream | null | undefined) {
  const settings = stream?.getVideoTracks()[0]?.getSettings();
  if (settings?.aspectRatio && Number.isFinite(settings.aspectRatio)) return settings.aspectRatio;
  if (settings?.width && settings?.height) return settings.width / settings.height;
  return 16 / 9;
}

function guestJoinErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not join meeting";
  return /invalid API key|could not establish signal connection/i.test(message)
    ? "Could not connect to the meeting. Please try again shortly."
    : message;
}

function isExpiredGuestMeetingError(error: unknown) {
  return error instanceof GuestMeetingLinkError && error.code === "meeting_expired";
}

function regionalStovoSite() {
  if (typeof window === "undefined") return "https://stovo.org";
  const locale = navigator.language?.toUpperCase() ?? "";
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  const centralAsia = /-(KZ|KG|UZ|TJ|TM)$/.test(locale) || /^Asia\/(Almaty|Aqtobe|Atyrau|Oral|Qostanay|Qyzylorda|Bishkek|Tashkent|Dushanbe|Ashgabat|Urumqi)$/.test(timeZone);
  if (/-((RU)|(NL))$/.test(locale) || /^Europe\/(Amsterdam|Moscow|Kaliningrad|Samara|Volgograd|Kirov|Saratov|Astrakhan|Ulyanovsk|Yekaterinburg|Omsk|Novosibirsk|Barnaul|Tomsk|Novokuznetsk|Krasnoyarsk|Irkutsk|Chita|Yakutsk|Khandyga|Vladivostok|Ust-Nera|Magadan|Sakhalin|Srednekolymsk|Kamchatka|Anadyr)$/.test(timeZone)) return "https://stovo.ru";
  return centralAsia ? "https://stovo.kg" : "https://stovo.org";
}

export default function GuestMeetingPage() {
  const { token } = useParams();
  const { accessToken, currentUser } = useAuth();
  const [preview, setPreview] = useState<GuestMeetingPreview | null>(null);
	const screenShareBitrateKbps = Math.min(20_000, Math.max(1_000, preview?.screenShareBitrateKbps ?? 5_000));
	const screenShareMaxBitrate = screenShareBitrateKbps * 1_000;
  const authenticatedName = currentUser?.displayName.trim() || currentUser?.username.trim() || "";
  const [name, setName] = useState(() => authenticatedName);
  const [state, setState] = useState<MeetingState>("name");
  const [error, setError] = useState<string | null>(null);
  const [deviceIssue, setDeviceIssue] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteParticipantStream[]>([]);
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
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [meterLevel, setMeterLevel] = useState(0);
  const [speakingIndicatorState, setSpeakingIndicatorState] = useState<"idle" | "speaking" | "settling">("idle");
  const [audioMeterRevision, setAudioMeterRevision] = useState(0);
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
  const speakingReleaseTimerRef = useRef<number | null>(null);
  const hasEditedNameRef = useRef(false);
  const guestSessionIDRef = useRef<string | null>(null);
  const screenShareStreamRef = useRef<MediaStream | null>(null);

  const stovoSite = regionalStovoSite();

  const inputDevices = devices.filter((device) => device.kind === "audioinput");
  const outputDevices = devices.filter((device) => device.kind === "audiooutput");
  const videoDevices = devices.filter((device) => device.kind === "videoinput");

  useEffect(() => {
    if (!hasEditedNameRef.current && !name && authenticatedName) {
      setName(authenticatedName);
    }
  }, [authenticatedName, name]);

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try { setDevices(await navigator.mediaDevices.enumerateDevices()); } catch { /* The system default remains usable. */ }
  }

  function stopLocalMedia() {
    if (meterFrameRef.current !== null) window.cancelAnimationFrame(meterFrameRef.current);
    meterFrameRef.current = null;
    if (speakingReleaseTimerRef.current !== null) window.clearTimeout(speakingReleaseTimerRef.current);
    speakingReleaseTimerRef.current = null;
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
    setSpeakingIndicatorState("idle");
  }

  async function stopScreenShare() {
    const room = roomRef.current;
    const publication = room && Array.from(room.localParticipant.trackPublications.values()).find((item) => item.source === Track.Source.ScreenShare);
    if (publication?.track) await room?.localParticipant.unpublishTrack(publication.track).catch(() => undefined);
    screenShareStreamRef.current?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    screenShareStreamRef.current = null;
    setLocalScreenStream(null);
    setIsScreenSharing(false);
  }

  async function toggleScreenShare() {
    const room = roomRef.current;
    if (!room) return;
    if (isScreenSharing) {
      await stopScreenShare();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setDeviceIssue("Screen sharing is not supported by this browser.");
      return;
    }
    try {
      // Keep text and UI readable: ask the browser for a 1080p, 30fps capture and
      // publish it with the matching high-detail LiveKit encoding below. The browser
      // still retains final control over the selected display/window resolution.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: true
      });
      const track = stream.getVideoTracks()[0];
      if (!track) {
        stream.getTracks().forEach((item) => item.stop());
        return;
      }
      track.contentHint = "detail";
      screenShareStreamRef.current = stream;
      setLocalScreenStream(stream);
      await room.localParticipant.publishTrack(track, {
        source: Track.Source.ScreenShare,
        degradationPreference: "maintain-resolution",
        screenShareEncoding: { maxBitrate: screenShareMaxBitrate, maxFramerate: 30 },
        screenShareSimulcastLayers: [
          new VideoPreset(640, 360, Math.min(400_000, screenShareMaxBitrate), 15),
          new VideoPreset(1280, 720, Math.min(2_000_000, screenShareMaxBitrate), 30),
          new VideoPreset(1920, 1080, screenShareMaxBitrate, 30)
        ]
      });
      setIsScreenSharing(true);
      track.onended = () => { void stopScreenShare(); };
    } catch (e) {
      screenShareStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenShareStreamRef.current = null;
      setLocalScreenStream(null);
      setDeviceIssue(e instanceof Error && e.name === "NotAllowedError" ? "Screen sharing permission was denied." : "Could not start screen sharing.");
    }
  }

  function markCurrentGuestSessionLeft() {
    if (!token || !guestSessionIDRef.current) return;
    const sessionID = guestSessionIDRef.current;
    guestSessionIDRef.current = null;
    void leaveGuestMeetingSession(token, sessionID).catch(() => undefined);
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
          setAudioMeterRevision((revision) => revision + 1);
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
    setDeviceIssue(null);
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

  function showExpiredLink() { stopLocalMedia(); setError(null); setState("expired"); }

  useEffect(() => { if (token) previewGuestMeeting(token).then(setPreview).catch((e) => { if (isExpiredGuestMeetingError(e)) showExpiredLink(); else { setError(e.message); setState("error"); } }); }, [token]);
  useEffect(() => {
    void refreshDevices();
    void startLocalMedia().catch((e) => setDeviceIssue(e instanceof Error ? e.message : "Could not access your devices."));
    const refreshWhenDevicesChange = () => { void refreshDevices(); };
    const mediaDevices = navigator.mediaDevices;
    const canListenForDeviceChanges = Boolean(mediaDevices && typeof mediaDevices.addEventListener === "function");
    if (canListenForDeviceChanges) mediaDevices.addEventListener("devicechange", refreshWhenDevicesChange);
    return () => {
      if (canListenForDeviceChanges && typeof mediaDevices?.removeEventListener === "function") mediaDevices.removeEventListener("devicechange", refreshWhenDevicesChange);
      markCurrentGuestSessionLeft();
      void stopScreenShare();
      stopLocalMedia();
      void roomRef.current?.disconnect();
    };
    // Device permission is intentionally requested once on page entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const leaveOnPageHide = () => { markCurrentGuestSessionLeft(); };
    window.addEventListener("pagehide", leaveOnPageHide);
    return () => window.removeEventListener("pagehide", leaveOnPageHide);
  }, [token]);
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
    if (!analyserRef.current || !microphoneEnabled) { setMeterLevel(0); return; }
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
  }, [audioMeterRevision, microphoneEnabled]);

  async function connect() {
    if (!token) return;
    setState("joining");
    try {
      const credentials = await getGuestMeetingToken(token);
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (!track.mediaStreamTrack) return;
        setRemoteStreams((previous) => {
          const existing = previous.find((item) => item.id === participant.identity);
          const isScreenTrack = publication.source === Track.Source.ScreenShare || publication.source === Track.Source.ScreenShareAudio;
          const streamKey = isScreenTrack ? "screenStream" : "cameraStream";
          const tracks = existing?.[streamKey]?.getTracks() ?? [];
          return [
            ...previous.filter((item) => item.id !== participant.identity),
            { id: participant.identity, cameraStream: existing?.cameraStream ?? null, screenStream: existing?.screenStream ?? null, [streamKey]: new MediaStream([...tracks.filter((item) => item.id !== track.mediaStreamTrack?.id), track.mediaStreamTrack]) }
          ];
        });
      });
      room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => setRemoteStreams((previous) => previous.flatMap((item) => {
        if (item.id !== participant.identity) return [item];
        const streamKey = publication.source === Track.Source.ScreenShare || publication.source === Track.Source.ScreenShareAudio ? "screenStream" : "cameraStream";
        const remainingTracks = item[streamKey]?.getTracks().filter((mediaTrack) => mediaTrack.id !== track.mediaStreamTrack?.id) ?? [];
        const nextItem = { ...item, [streamKey]: remainingTracks.length ? new MediaStream(remainingTracks) : null };
        return nextItem.cameraStream || nextItem.screenStream ? [nextItem] : [];
      })));
      room.on(RoomEvent.ParticipantDisconnected, (participant) => setRemoteStreams((previous) => previous.filter((item) => item.id !== participant.identity)));
      await room.connect(resolveLiveKitUrl(credentials.url), credentials.token);
      if (!localStreamRef.current) await startLocalMedia();
      for (const track of localStreamRef.current?.getTracks() ?? []) {
        if (track.enabled) await room.localParticipant.publishTrack(track, { source: track.kind === "audio" ? Track.Source.Microphone : Track.Source.Camera });
      }
      setState("joined");
    } catch (e) {
      markCurrentGuestSessionLeft();
      await roomRef.current?.disconnect().catch(() => undefined);
      roomRef.current = null;
	  if (isExpiredGuestMeetingError(e)) { showExpiredLink(); return; }
      setError(guestJoinErrorMessage(e));
      setState("error");
    }
  }
  async function submit(event: FormEvent) { event.preventDefault(); if (!token) return; setError(null); try { const session = await createGuestMeetingSession(token, name); guestSessionIDRef.current = session.id; if (session.state === "admitted") void connect(); else setState("waiting"); } catch (e) { if (isExpiredGuestMeetingError(e)) showExpiredLink(); else setError(e instanceof Error ? e.message : "Could not join meeting"); } }
  useEffect(() => { if (state !== "waiting" || !token) return; const timer = window.setInterval(() => void getGuestMeetingStatus(token).then((status) => { if (status.state === "admitted") void connect(); if (status.state === "blocked") { setError("The host removed you from this meeting."); setState("blocked"); } }).catch((e) => { if (isExpiredGuestMeetingError(e)) showExpiredLink(); else { setError(e.message); setState("error"); } }), 2500); return () => window.clearInterval(timer); }, [state, token]);
  async function leave() { await stopScreenShare(); stopLocalMedia(); await roomRef.current?.disconnect(); roomRef.current = null; markCurrentGuestSessionLeft(); setRemoteStreams([]); setState("name"); void startLocalMedia(); }
  const participantCopy = preview?.guestCount ? `${preview.guestCount} ${preview.guestCount === 1 ? "guest is" : "guests are"} already here` : "No guests are here yet";
  const guestDisplayName = name.trim() || currentUser?.displayName || "You";
  const hasVoiceActivity = microphoneEnabled && meterLevel >= 8;
  useEffect(() => {
    if (speakingReleaseTimerRef.current !== null) {
      window.clearTimeout(speakingReleaseTimerRef.current);
      speakingReleaseTimerRef.current = null;
    }
    if (!microphoneEnabled) {
      setSpeakingIndicatorState("idle");
      return;
    }
    if (hasVoiceActivity) {
      setSpeakingIndicatorState("speaking");
      return;
    }
    setSpeakingIndicatorState((current) => current === "idle" ? "idle" : "settling");
    speakingReleaseTimerRef.current = window.setTimeout(() => {
      speakingReleaseTimerRef.current = null;
      setSpeakingIndicatorState("idle");
    }, SPEAKING_RING_RELEASE_DELAY_MS);
    return () => {
      if (speakingReleaseTimerRef.current !== null) window.clearTimeout(speakingReleaseTimerRef.current);
      speakingReleaseTimerRef.current = null;
    };
  }, [hasVoiceActivity, microphoneEnabled]);
  const isSpeaking = speakingIndicatorState === "speaking";
  const isSpeakingIndicatorVisible = speakingIndicatorState !== "idle";

  if (state === "joined") {
    const hasLocalScreenShare = Boolean(localScreenStream?.getVideoTracks().some((track) => track.readyState === "live"));
    const hasLocalCamera = Boolean(cameraEnabled && localStreamRef.current?.getVideoTracks().some((track) => track.enabled && track.readyState === "live"));
    const localCameraStream = localStreamRef.current;
    const participantCount = remoteStreams.length + 1;
    const gridTierClass = participantCount === 1 ? "voice-grid--1" : participantCount === 2 ? "voice-grid--2" : participantCount <= 4 ? "voice-grid--4" : participantCount <= 6 ? "voice-grid--6" : "voice-grid--9";
    const remoteScreenShare = remoteStreams.find((remote) => remote.screenStream?.getVideoTracks().some((track) => track.readyState === "live"));
    const hasScreenShare = hasLocalScreenShare || Boolean(remoteScreenShare);
    const sharedScreenStream = hasLocalScreenShare ? localScreenStream : remoteScreenShare?.screenStream;
    const screenAspectRatio = streamAspectRatio(sharedScreenStream);
    const cameraTiles = [
      { id: "local", label: `${guestDisplayName} (You)`, stream: hasLocalCamera ? localCameraStream : null, muted: !microphoneEnabled, speaking: isSpeakingIndicatorVisible, local: true },
      ...remoteStreams.map((remote, index) => ({ id: remote.id, label: `Guest ${index + 1}`, stream: remote.cameraStream, muted: false, speaking: false, local: false }))
    ];

    return <main className="guest-meeting-page guest-meeting-page--in-call">
      <div className="guest-stovo-brand"><StovoLogo size={38} title="Stovo" /><span>Stovo</span></div>
      <section className="guest-call-room voice-channel-room" aria-label={`${preview?.title || "Guest"} meeting`}>
        <header className="guest-call-header">
          <div><strong>{preview?.title || "Guest meeting"}</strong><span><i aria-hidden="true" /> {participantCount} {participantCount === 1 ? "participant" : "participants"}</span></div>
        </header>
        <div className="voice-room-stage">
          {hasScreenShare ? <div className={`guest-call-spotlight${cameraTiles.length > 3 ? " guest-call-spotlight--grid" : ""}`} aria-label="Shared screen and cameras">
            <div className="guest-call-screen-stage">
              {hasLocalScreenShare && localScreenStream ? <GuestParticipantTile className="guest-call-screen-tile" style={{ aspectRatio: screenAspectRatio }} label={`${guestDisplayName} (You) — Screen`} hasVideo muted={!microphoneEnabled}><LocalStreamVideo stream={localScreenStream} className="voice-participant-video-feed" /></GuestParticipantTile> : remoteScreenShare?.screenStream && <GuestParticipantTile className="guest-call-screen-tile" style={{ aspectRatio: screenAspectRatio }} label={`Guest ${remoteStreams.indexOf(remoteScreenShare) + 1} — Screen`} hasVideo><RemoteVideo stream={remoteScreenShare.screenStream} outputVolume={outputVolume} speakerEnabled={speakerEnabled} speakerDeviceId={speakerDeviceId} className="voice-participant-video-feed" /></GuestParticipantTile>}
            </div>
            <aside className="guest-call-camera-rail" aria-label="Participant cameras">
              {cameraTiles.map((participant) => <GuestParticipantTile key={participant.id} className="guest-call-camera-tile" label={participant.label} hasVideo={Boolean(participant.stream?.getVideoTracks().some((track) => track.readyState === "live"))} muted={participant.muted} speaking={participant.speaking} avatar={participant.local ? <span className={`guest-preview-avatar-halo guest-call-avatar-halo${isSpeaking ? " is-speaking" : ""}${speakingIndicatorState === "settling" ? " is-settling" : ""}`}><RealAvatar accessToken={accessToken} className="avatar voice-participant-avatar voice-avatar--xl" file={currentUser?.profilePhoto} label={guestDisplayName} /></span> : undefined}>
                {participant.stream && (participant.local ? <LocalStreamVideo stream={participant.stream} className="voice-participant-video-feed is-mirrored" /> : <RemoteVideo stream={participant.stream} outputVolume={outputVolume} speakerEnabled={speakerEnabled} speakerDeviceId={speakerDeviceId} className="voice-participant-video-feed" />)}
              </GuestParticipantTile>)}
            </aside>
          </div> : <div className={`voice-room-grid ${gridTierClass}`} aria-label="Meeting participants">
            <GuestParticipantTile label={`${guestDisplayName} (You)`} hasVideo={hasLocalCamera} muted={!microphoneEnabled} speaking={isSpeakingIndicatorVisible} avatar={<span className={`guest-preview-avatar-halo guest-call-avatar-halo${isSpeaking ? " is-speaking" : ""}${speakingIndicatorState === "settling" ? " is-settling" : ""}`}><RealAvatar accessToken={accessToken} className="avatar voice-participant-avatar voice-avatar--xl" file={currentUser?.profilePhoto} label={guestDisplayName} /></span>}>{hasLocalCamera && localCameraStream && <LocalStreamVideo stream={localCameraStream} className="voice-participant-video-feed is-mirrored" />}</GuestParticipantTile>
            {remoteStreams.map((remote, index) => <GuestParticipantTile key={remote.id} label={`Guest ${index + 1}`} hasVideo={Boolean(remote.cameraStream?.getVideoTracks().some((track) => track.readyState === "live"))}>{remote.cameraStream && <RemoteVideo stream={remote.cameraStream} outputVolume={outputVolume} speakerEnabled={speakerEnabled} speakerDeviceId={speakerDeviceId} className="voice-participant-video-feed" />}</GuestParticipantTile>)}
          </div>}
        </div>
        <div className="voice-room-bottom-bar">
          <div className="voice-room-in-call-controls guest-call-controls" role="toolbar" aria-label="Meeting controls">
            <DeviceControl label="Microphone" active={microphoneEnabled} onToggle={() => toggleDevice("audio")} icon={microphoneEnabled ? <Mic size={20} /> : <MicOff size={20} />}><DeviceSelect value={microphoneDeviceId} onChange={(value) => void selectInputDevice("audio", value)} devices={inputDevices} fallback="Microphone" /></DeviceControl>
            <DeviceControl label="Speaker" active={speakerEnabled} onToggle={() => setSpeakerEnabled((enabled) => !enabled)} icon={speakerEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}><DeviceSelect value={speakerDeviceId} onChange={setSpeakerDeviceId} devices={outputDevices} fallback="Speaker" /></DeviceControl>
            <DeviceControl label="Camera" active={cameraEnabled} onToggle={() => toggleDevice("video")} icon={cameraEnabled ? <Camera size={20} /> : <CameraOff size={20} />}><DeviceSelect value={cameraDeviceId} onChange={(value) => void selectInputDevice("video", value)} devices={videoDevices} fallback="Camera" /></DeviceControl>
            <button className={`voice-dock-btn${isScreenSharing ? " is-active" : ""}`} type="button" onClick={() => void toggleScreenShare()} aria-label={isScreenSharing ? "Stop screen sharing" : "Share screen"} title={isScreenSharing ? "Stop screen sharing" : "Share screen"}>{isScreenSharing ? <ScreenShareOff size={20} /> : <ScreenShare size={20} />}</button>
            <div className="guest-settings guest-call-settings" ref={settingsRef}>
              <button ref={settingsButtonRef} className={`voice-dock-btn${settingsOpen ? " is-active" : ""}`} type="button" aria-label="Open device settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}><Settings size={20} /></button>
              {settingsOpen && <section className="guest-settings-popover" role="dialog" aria-label="Device settings"><div className="guest-settings-section"><label>Microphone volume <strong>{inputGain}%</strong><input aria-label="Microphone volume" type="range" min="0" max="200" value={inputGain} onChange={(event) => setMicVolume(Number(event.target.value))} /></label><div className="guest-mic-test"><span>Microphone test</span>{analyserRef.current && microphoneEnabled ? <div className="guest-mic-meter" aria-label={`Microphone level ${meterLevel}%`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={meterLevel}><i style={{ width: `${meterLevel}%` }} /></div> : <small>Microphone unavailable</small>}</div></div><div className="guest-settings-section"><label>Speaker volume <strong>{outputVolume}%</strong><input aria-label="Speaker volume" type="range" min="0" max="100" value={outputVolume} onChange={(event) => setOutputVolume(Number(event.target.value))} /></label><button type="button" className="guest-test-sound" disabled={!speakerEnabled} onClick={() => void testSound()}><Volume2 size={16} /> Test sound</button></div>{deviceIssue && <p className="guest-device-issue" role="status">{deviceIssue}</p>}</section>}
            </div>
            <button className="voice-dock-btn voice-dock-btn--disconnect" type="button" onClick={() => void leave()} aria-label="Leave meeting" title="Leave meeting"><PhoneOff size={20} /></button>
          </div>
        </div>
      </section>
    </main>;
  }

  return <main className="guest-meeting-page"><div className="guest-stovo-brand"><StovoLogo size={38} title="Stovo" /><span>Stovo</span></div><section className="guest-meeting-card">
    {state === "expired" && <section className="guest-link-expired" aria-labelledby="expired-link-title"><span className="guest-link-expired-icon"><Link2Off size={28} aria-hidden="true" /></span><div><h1 id="expired-link-title">This meeting link has expired</h1><p>Ask the host to send you a new link, then open it to join.</p></div></section>}
    {state === "name" && <div className="guest-prejoin">
      <section className="guest-prejoin-preview">
        <div className="guest-preview-label">{guestDisplayName}</div>
        <div className="guest-settings" ref={settingsRef}>
          <button ref={settingsButtonRef} className="guest-settings-trigger" type="button" aria-label="Open device settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}><Settings size={22} /></button>
          {settingsOpen && <section className="guest-settings-popover" role="dialog" aria-label="Device settings"><div className="guest-settings-section"><label>Microphone volume <strong>{inputGain}%</strong><input aria-label="Microphone volume" type="range" min="0" max="200" value={inputGain} onChange={(event) => setMicVolume(Number(event.target.value))} /></label><div className="guest-mic-test"><span>Microphone test</span>{analyserRef.current && microphoneEnabled ? <div className="guest-mic-meter" aria-label={`Microphone level ${meterLevel}%`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={meterLevel}><i style={{ width: `${meterLevel}%` }} /></div> : <small>Microphone unavailable</small>}</div></div><div className="guest-settings-section"><label>Speaker volume <strong>{outputVolume}%</strong><input aria-label="Speaker volume" type="range" min="0" max="100" value={outputVolume} onChange={(event) => setOutputVolume(Number(event.target.value))} /></label><button type="button" className="guest-test-sound" disabled={!speakerEnabled} onClick={() => void testSound()}><Volume2 size={16} /> Test sound</button></div>{deviceIssue && <p className="guest-device-issue" role="status">{deviceIssue}</p>}</section>}
        </div>
        <video ref={localRef} className={cameraEnabled ? "visible" : ""} autoPlay muted playsInline />
        {!cameraEnabled && <div className="guest-preview-empty"><span className={`guest-preview-avatar-halo${isSpeaking ? " is-speaking" : ""}${speakingIndicatorState === "settling" ? " is-settling" : ""}`}><RealAvatar accessToken={accessToken} className="avatar guest-preview-avatar" file={currentUser?.profilePhoto} label={guestDisplayName} /></span><span>{guestDisplayName}</span></div>}
        <div className="guest-preview-controls">
          <DeviceControl label="Microphone" active={microphoneEnabled} onToggle={() => toggleDevice("audio")} icon={microphoneEnabled ? <Mic size={23} /> : <MicOff size={23} />}><DeviceSelect value={microphoneDeviceId} onChange={(value) => void selectInputDevice("audio", value)} devices={inputDevices} fallback="Microphone" /></DeviceControl>
          <DeviceControl label="Speaker" active={speakerEnabled} onToggle={() => setSpeakerEnabled((enabled) => !enabled)} icon={speakerEnabled ? <Volume2 size={23} /> : <VolumeX size={23} />}><DeviceSelect value={speakerDeviceId} onChange={setSpeakerDeviceId} devices={outputDevices} fallback="Speaker" /></DeviceControl>
          <DeviceControl label="Camera" active={cameraEnabled} onToggle={() => toggleDevice("video")} icon={cameraEnabled ? <Camera size={23} /> : <CameraOff size={23} />}><DeviceSelect value={cameraDeviceId} onChange={(value) => void selectInputDevice("video", value)} devices={videoDevices} fallback="Camera" /></DeviceControl>
        </div>
      </section>
      <form className="guest-prejoin-panel" onSubmit={submit}><div className="guest-prejoin-title-row"><h1>{preview?.title || "Join meeting"}</h1></div><div className="guest-prejoin-meta">{preview?.scheduledAt && <span>{new Date(preview.scheduledAt).toLocaleString()}</span>}<div className="guest-prejoin-attendee"><span className="guest-prejoin-attendee-copy"><Users size={16} /> {participantCopy}</span></div></div><label>Your name<input autoFocus required minLength={2} maxLength={80} value={name} placeholder="Enter your name" onChange={(e) => { hasEditedNameRef.current = true; setName(e.target.value); }} /></label><button className="primary-button guest-meeting-join-button" type="submit">Join meeting</button><small>Link expires {preview ? new Date(preview.expiresAt).toLocaleString() : "soon"}</small></form>
    </div>}
    {state === "waiting" && <p className="muted-copy">Waiting for the host to admit you…</p>}
    {state === "joining" && <p className="muted-copy">Joining meeting…</p>}
    {error && <p className="error-text">{error}</p>}
    <a className="guest-stovo-marketing" href={stovoSite} target="_blank" rel="noreferrer">Want a private space for your own group? Run Stovo <span aria-hidden="true">↗</span></a>
  </section></main>;
}

function DeviceControl({ label, active, onToggle, icon, children }: { label: string; active: boolean; onToggle: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="guest-device-control"><button type="button" className={active ? "active" : ""} aria-label={`Toggle ${label}`} aria-pressed={active} onClick={onToggle}>{icon}</button>{children}</div>;
}
function DeviceSelect({ value, onChange, devices, fallback }: { value: string; onChange: (value: string) => void; devices: MediaDeviceInfo[]; fallback: string }) {
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const selectedLabel = value ? devices.find((device) => device.deviceId === value)?.label || fallback : "System default";

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: MouseEvent) => {
      if (controlRef.current && !controlRef.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function chooseDevice(deviceId: string) {
    onChange(deviceId);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return <div className="guest-device-select" ref={controlRef}>
    <button ref={triggerRef} type="button" className="guest-device-menu-trigger" aria-label={`Select ${fallback}`} aria-haspopup="listbox" aria-controls={menuId} aria-expanded={open} title={`Select ${fallback}: ${selectedLabel}`} onClick={() => setOpen((isOpen) => !isOpen)}><ChevronDown size={16} aria-hidden="true" /></button>
    {open && <div id={menuId} className="guest-device-menu" role="listbox" aria-label={`${fallback} device`}>
      <div className="guest-device-menu-heading"><span>{fallback}</span></div>
      <div className="guest-device-menu-options">
        <button type="button" role="option" aria-selected={!value} className="guest-device-menu-option" onClick={() => chooseDevice("")}><span>System default</span>{!value && <span aria-hidden="true">✓</span>}</button>
        {devices.map((device, index) => <button type="button" role="option" aria-selected={device.deviceId === value} className="guest-device-menu-option" key={device.deviceId} onClick={() => chooseDevice(device.deviceId)}><span>{deviceLabel(device, fallback, index)}</span>{device.deviceId === value && <span aria-hidden="true">✓</span>}</button>)}
      </div>
    </div>}
  </div>;
}
function GuestParticipantTile({ label, hasVideo, muted = false, speaking = false, avatar, children, className = "", style }: { label: string; hasVideo: boolean; muted?: boolean; speaking?: boolean; avatar?: React.ReactNode; children?: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`voice-participant-card${hasVideo ? " has-video" : ""}${className ? ` ${className}` : ""}`} style={style}>
    {hasVideo ? <div className="voice-participant-video-container">{children}{speaking && <span className="voice-video-speaking-border guest-video-speaking-border" aria-label="Speaking" />}{muted && <span className="voice-card-muted-badge voice-card-muted-badge--video" aria-label="Microphone muted"><MicOff size={14} /></span>}</div> : <><div className="voice-participant-avatar-wrapper voice-avatar-wrapper--xl">{avatar ?? <span className="guest-call-avatar-placeholder" aria-hidden="true"><Users size={40} /></span>}{muted && <span className="voice-card-muted-badge" aria-label="Microphone muted"><MicOff size={14} /></span>}</div>{children}</>}
    <div className="voice-participant-meta"><span className="voice-participant-name">{label}</span><span className="voice-participant-state">{muted ? "Muted" : "Connected"}</span></div>
  </div>;
}
function LocalStreamVideo({ stream, className }: { stream: MediaStream; className?: string }) { const ref = useRef<HTMLVideoElement>(null); useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]); return <video ref={ref} className={className} autoPlay muted playsInline />; }
function RemoteVideo({ stream, outputVolume, speakerEnabled, speakerDeviceId, className }: { stream: MediaStream; outputVolume: number; speakerEnabled: boolean; speakerDeviceId: string; className?: string }) { const ref = useRef<HTMLVideoElement>(null); useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]); useEffect(() => { const video = ref.current as SinkableMediaElement | null; if (!video) return; video.volume = speakerEnabled ? outputVolume / 100 : 0; if (speakerDeviceId && video.setSinkId) void video.setSinkId(speakerDeviceId).catch(() => undefined); }, [outputVolume, speakerDeviceId, speakerEnabled]); return <video ref={ref} className={className} autoPlay playsInline />; }
