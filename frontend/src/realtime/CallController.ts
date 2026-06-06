import { Socket } from "socket.io-client";
import { getApiUrl } from "../api/client";

type SignalEnvelope = {
  chatId: string;
  targetUserId?: string;
  data: Record<string, unknown>;
};

type BufferedSignal = {
  chatId: string;
  fromUserId: string;
  data: Record<string, unknown>;
};

export type CallSettings = {
  micMuted: boolean;
  soundDisabled: boolean;
  cameraEnabled: boolean;
  cameraFacingMode: "user" | "environment";
  speakerMode: "small" | "large";
  inputDeviceId: string;
  outputDeviceId: string;
  videoDeviceId: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  voiceEnhancement: boolean;
  inputGain: number;
  outputVolume: number;
  voiceEnhancementThreshold: number;
  voiceEnhancementHighpass: number;
  mirrorLocalVideo: boolean;
};

export type CallDevice = {
  deviceId: string;
  kind: "audioinput" | "audiooutput" | "videoinput";
  label: string;
};

export type CallCapabilities = {
  canSelectInputDevice: boolean;
  canSelectOutputDevice: boolean;
  canUseNoiseSuppression: boolean;
  canUseEchoCancellation: boolean;
  canUseAutoGainControl: boolean;
  canUseVoiceEnhancement: boolean;
  canUseCamera: boolean;
};

const DEFAULT_SETTINGS: CallSettings = {
  micMuted: false,
  soundDisabled: false,
  cameraEnabled: true,
  cameraFacingMode: "user",
  speakerMode: "small",
  inputDeviceId: "",
  outputDeviceId: "",
  videoDeviceId: "",
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  voiceEnhancement: false,
  inputGain: 100,
  outputVolume: 100,
  voiceEnhancementThreshold: -24,
  voiceEnhancementHighpass: 120,
  mirrorLocalVideo: true,
};

export default class CallController {
  private socket: Socket;
  private accessToken: string;

  // DOM elements — always in the DOM (not inside conditional renders), so refs
  // are valid when the controller is created at socket setup time.
  private remoteAudioEl: HTMLAudioElement | null = null;
  private remoteVideoEl: HTMLVideoElement | null = null;
  private localVideoEl: HTMLVideoElement | null = null;

  private peer: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;  // sent to peer (may be voice-enhanced)
  private sourceStream: MediaStream | null = null; // raw getUserMedia stream (local preview)
  private remoteStream: MediaStream | null = null; // most recent remote stream with video

  private chatId: string | null = null;
  private targetUserId: string | null = null;
  private callType: "audio" | "video" = "audio";
  private isOfferer: boolean = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  // Signals that arrive before the peer is ready are buffered here and
  // replayed immediately after ensurePeer() finishes. This prevents the race
  // where ICE candidates or the offer itself arrive while getUserMedia is still
  // pending in acceptIncoming(), which used to create duplicate peer connections.
  private preconnectSignals: BufferedSignal[] = [];
  // Serial queue for processSignal — prevents concurrent offer/answer handling
  // which causes "cannot create answer in state other than have-remote-offer".
  private signalQueue: Promise<void> = Promise.resolve();
  private settings: CallSettings = { ...DEFAULT_SETTINGS };
  private processorContext: AudioContext | null = null;
  private processorDestination: MediaStreamAudioDestinationNode | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts: number = 0;
  private speakingCallback: ((isSpeaking: boolean) => void) | null = null;
  private speakingAnimFrame: number | null = null;
  private speakingAnalyser: AnalyserNode | null = null;
  private speakingContext: AudioContext | null = null;
  private wasSpeaking: boolean = false;
  private readonly SPEAKING_THRESHOLD = 0.015;

  /** Called when a video call had no camera — UI can warn and show audio-only. */
  onVideoUnavailable?: () => void;
  /** Called when the peer connection cannot be recovered after repeated ICE restarts. */
  onConnectionFailed?: () => void;
  /** Called when a remote video track arrives mid-call (e.g. remote party enables camera). */
  onRemoteVideoTrack?: () => void;

  constructor(socket: Socket, accessToken: string) {
    this.socket = socket;
    this.accessToken = accessToken;
  }

  // ─── Element attachment ──────────────────────────────────────────────────────

  attachRemoteAudioElement(element: HTMLAudioElement | null) {
    this.remoteAudioEl = element;
    this.applySoundDisabledState();
    void this.applyOutputDevice().catch(() => undefined);
  }

  attachRemoteVideoElement(element: HTMLVideoElement | null) {
    this.remoteVideoEl = element;
    if (element) this.reattachRemoteVideo();
  }

  attachLocalVideoElement(element: HTMLVideoElement | null) {
    this.localVideoEl = element;
    if (element && this.sourceStream && this.callType === "video") {
      element.srcObject = this.sourceStream;
      void element.play().catch(() => undefined);
    }
  }

  onSpeakingChange(callback: ((isSpeaking: boolean) => void) | null) {
    this.speakingCallback = callback;
    if (!callback) this.stopSpeakingDetection();
  }

  // ─── Call lifecycle ──────────────────────────────────────────────────────────

  async startOutgoing(
    chatId: string,
    targetUserId: string,
    callType: "audio" | "video" = "audio",
  ) {
    this.chatId = chatId;
    this.targetUserId = targetUserId;
    this.callType = callType;
    this.isOfferer = true;
    await this.ensurePeer();
    // Guard against cleanup() being called while ensurePeer() was pending.
    if (!this.peer) return;
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);
    this.emitSignal({ chatId, targetUserId, data: { type: "offer", sdp: offer.sdp } });
  }

  async acceptIncoming(
    chatId: string,
    targetUserId: string,
    callType: "audio" | "video" = "audio",
  ) {
    this.chatId = chatId;
    this.targetUserId = targetUserId;
    this.callType = callType;
    this.isOfferer = false;
    await this.ensurePeer();
    // ensurePeer() replays any buffered signals (offer + ICE candidates that
    // arrived before getUserMedia finished). No separate draining needed here.
  }

  /**
   * Process a WebRTC signal from the remote peer.
   * If the peer isn't ready yet (getUserMedia still pending), the signal is
   * buffered and automatically replayed once the peer is created.
   *
   * All signals are serialized through signalQueue so that concurrent offers
   * or ICE candidates cannot race and leave the peer in a bad signaling state.
   */
  handleSignal(payload: {
    chatId: string;
    fromUserId: string;
    data: Record<string, unknown>;
  }): Promise<void> {
    if (!payload?.chatId || !payload?.data) return Promise.resolve();

    if (!this.peer) {
      // Peer not ready — buffer until ensurePeer() completes
      this.preconnectSignals.push(payload);
      return Promise.resolve();
    }

    // Chain onto the queue so signals are always processed one at a time.
    this.signalQueue = this.signalQueue
      .then(() => this.processSignal(payload))
      .catch(() => undefined);
    return this.signalQueue;
  }

  // ─── Video toggle mid-call ───────────────────────────────────────────────────

  async toggleVideo(enable: boolean): Promise<void> {
    if (!this.peer) return;

    if (enable) {
      let videoTrack: MediaStreamTrack | null = null;
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: this.buildVideoConstraints(),
        });
        videoTrack = s.getVideoTracks()[0] ?? null;
      } catch {
        this.onVideoUnavailable?.();
        return;
      }
      if (!videoTrack) { this.onVideoUnavailable?.(); return; }

      this.sourceStream?.addTrack(videoTrack);
      if (this.sourceStream !== this.localStream) this.localStream?.addTrack(videoTrack);

      if (this.localVideoEl) {
        this.localVideoEl.srcObject = this.sourceStream;
        void this.localVideoEl.play().catch(() => undefined);
      }

      this.peer.addTrack(videoTrack, this.localStream ?? this.sourceStream!);
      this.callType = "video";
      await this.renegotiate();
    } else {
      for (const sender of this.peer.getSenders()) {
        if (sender.track?.kind === "video") {
          sender.track.stop();
          this.peer.removeTrack(sender);
        }
      }
      for (const t of this.sourceStream?.getVideoTracks() ?? []) t.stop();
      if (this.localStream !== this.sourceStream) {
        for (const t of this.localStream?.getVideoTracks() ?? []) t.stop();
      }
      if (this.localVideoEl) this.localVideoEl.srcObject = null;
      this.callType = "audio";
      await this.renegotiate();
    }
  }

  // ─── Settings ────────────────────────────────────────────────────────────────

  getSettings(): CallSettings { return { ...this.settings }; }

  getCapabilities(): CallCapabilities {
    const has = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices);
    return {
      canSelectInputDevice: has,
      canSelectOutputDevice: this.supportsSinkId(),
      canUseNoiseSuppression: has,
      canUseEchoCancellation: has,
      canUseAutoGainControl: has,
      canUseVoiceEnhancement: typeof window !== "undefined" && "AudioContext" in window,
      canUseCamera: has,
    };
  }

  async getAvailableDevices(): Promise<CallDevice[]> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
    const list = await navigator.mediaDevices.enumerateDevices();
    return list
      .filter((d) => ["audioinput", "audiooutput", "videoinput"].includes(d.kind))
      .map((d) => ({
        deviceId: d.deviceId,
        kind: d.kind as CallDevice["kind"],
        label: d.label || (d.kind === "audioinput" ? "Microphone" : d.kind === "audiooutput" ? "Speaker" : "Camera"),
      }));
  }

  async applySettings(patch: Partial<CallSettings>) {
    const previous = this.settings;
    this.settings = { ...this.settings, ...patch };

    if (patch.micMuted !== undefined) this.applyMicMutedState();
    if (patch.cameraEnabled !== undefined) this.applyCameraEnabledState();
    if (patch.soundDisabled !== undefined || patch.speakerMode !== undefined) {
      this.applySoundDisabledState();
    }

    const needsReacquire =
      patch.inputDeviceId !== undefined ||
      patch.videoDeviceId !== undefined ||
      patch.cameraFacingMode !== undefined ||
      patch.echoCancellation !== undefined ||
      patch.noiseSuppression !== undefined ||
      patch.autoGainControl !== undefined ||
      patch.voiceEnhancement !== undefined;

    if (needsReacquire && this.peer) {
      try {
        await this.acquireLocalStream();
      } catch (err) {
        this.settings = previous;
        this.applyMicMutedState();
        this.applySoundDisabledState();
        throw err;
      }
    }

    if (patch.outputDeviceId !== undefined) await this.applyOutputDevice();
  }

  // ─── Speaking detection ───────────────────────────────────────────────────────

  private startSpeakingDetection(stream: MediaStream) {
    this.stopSpeakingDetection();
    const AudioCtor =
      typeof window === "undefined"
        ? null
        : window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor || !this.speakingCallback) return;
    this.speakingContext = new AudioCtor();
    const source = this.speakingContext.createMediaStreamSource(stream);
    this.speakingAnalyser = this.speakingContext.createAnalyser();
    this.speakingAnalyser.fftSize = 256;
    source.connect(this.speakingAnalyser);
    const data = new Uint8Array(this.speakingAnalyser.frequencyBinCount);
    const poll = () => {
      if (!this.speakingAnalyser) return;
      this.speakingAnalyser.getByteFrequencyData(data);
      const avg = data.reduce((s, v) => s + v, 0) / data.length / 255;
      const speaking = avg > this.SPEAKING_THRESHOLD;
      if (speaking !== this.wasSpeaking) {
        this.wasSpeaking = speaking;
        this.speakingCallback?.(speaking);
      }
      this.speakingAnimFrame = requestAnimationFrame(poll);
    };
    this.speakingAnimFrame = requestAnimationFrame(poll);
  }

  private stopSpeakingDetection() {
    if (this.speakingAnimFrame !== null) {
      cancelAnimationFrame(this.speakingAnimFrame);
      this.speakingAnimFrame = null;
    }
    this.speakingAnalyser = null;
    if (this.speakingContext) {
      void this.speakingContext.close().catch(() => undefined);
      this.speakingContext = null;
    }
    this.wasSpeaking = false;
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  /**
   * Clean up the call.
   * @param serverAlreadyNotified - pass true when the caller has already
   *   emitted `call:end` to the server (e.g. endActiveCall). When false
   *   (default) cleanup will emit `call:end` itself to ensure the server-side
   *   session is always cleared even on abnormal teardown (component unmount,
   *   browser nav, connection failure).
   */
  async cleanup(serverAlreadyNotified = false) {
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    this.isOfferer = false;

    // Ensure the server-side call session is cleared even if the UI did not
    // explicitly emit call:end (e.g. component unmount, browser navigation).
    // Without this the server retains the session and the next call:start fails
    // with "call already in progress".
    if (!serverAlreadyNotified && this.chatId && this.socket.connected) {
      this.socket.emit("call:end", { chatId: this.chatId });
    }

    this.stopStream(this.localStream);
    if (this.localStream !== this.sourceStream) this.stopStream(this.sourceStream);
    this.localStream = null;
    this.sourceStream = null;
    this.remoteStream = null;
    if (this.peer) {
      this.peer.onicecandidate = null;
      this.peer.ontrack = null;
      this.peer.onconnectionstatechange = null;
      this.peer.close();
      this.peer = null;
    }
    if (this.remoteAudioEl) { this.remoteAudioEl.srcObject = null; this.remoteAudioEl.muted = false; }
    if (this.remoteVideoEl) this.remoteVideoEl.srcObject = null;
    if (this.localVideoEl) this.localVideoEl.srcObject = null;
    this.closeAudioProcessor();
    this.stopSpeakingDetection();
    this.speakingCallback = null;
    this.onRemoteVideoTrack = undefined;
    this.settings = { ...DEFAULT_SETTINGS };
    this.chatId = null;
    this.targetUserId = null;
    this.callType = "audio";
    this.pendingCandidates = [];
    this.preconnectSignals = [];
    // Reset the signal queue so stale promises from a previous call cannot
    // affect a freshly started call after cleanup.
    this.signalQueue = Promise.resolve();
  }

  // ─── Private: peer creation ───────────────────────────────────────────────────

  private async ensurePeer() {
    if (this.peer) return;

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      throw new Error("Camera/mic unavailable. Use HTTPS and grant permission.");
    }

    await this.acquireLocalStream();

    const peer = new RTCPeerConnection({ iceServers: await this.loadIceServers() });

    peer.oniceconnectionstatechange = () => console.log("[call] ICE:", peer.iceConnectionState);
    peer.onsignalingstatechange   = () => console.log("[call] Sig:", peer.signalingState);
    peer.onconnectionstatechange  = () => {
      const state = peer.connectionState;
      console.log("[call] Peer:", state);
      if (state === "connected") {
        this.clearReconnectTimer();
        this.reconnectAttempts = 0;
      } else if (state === "disconnected") {
        // Give the browser a few seconds to recover on its own before we try an ICE restart.
        this.scheduleReconnect(3000);
      } else if (state === "failed") {
        // Failed is definitive — attempt ICE restart immediately.
        this.scheduleReconnect(0);
      }
    };

    for (const track of this.localStream?.getTracks() ?? []) {
      peer.addTrack(track, this.localStream!);
    }

    peer.onicecandidate = (e) => {
      if (!e.candidate || !this.chatId || !this.targetUserId) return;
      this.emitSignal({
        chatId: this.chatId,
        targetUserId: this.targetUserId,
        data: { type: "ice-candidate", candidate: e.candidate.toJSON() },
      });
    };

    peer.ontrack = (e) => {
      const [stream] = e.streams;
      if (!stream) return;
      if (e.track.kind === "audio" && this.remoteAudioEl) {
        this.remoteAudioEl.srcObject = stream;
        this.remoteAudioEl.autoplay = true;
        void this.remoteAudioEl.play().catch(() => undefined);
        this.startSpeakingDetection(stream);
      }
      if (e.track.kind === "video") {
        this.remoteStream = stream;
        this.reattachRemoteVideo();
        // Notify the UI so it can show the video container even if the local
        // side started as audio-only (e.g. remote party enables camera mid-call).
        this.onRemoteVideoTrack?.();
      }
    };

    // onnegotiationneeded is NOT wired. It fires unpredictably (e.g. right after
    // setLocalDescription(answer)) and causes callee-initiated offers that break
    // DTLS role assignment. Renegotiation is triggered explicitly in renegotiate().

    this.peer = peer;
    this.applyMicMutedState();
    this.applyCameraEnabledState();
    this.applySoundDisabledState();
    await this.applyOutputDevice();

    // Replay signals that arrived while getUserMedia was pending.
    // Route them through the signalQueue so they are serialized with any
    // signals that arrive concurrently from the socket during replay.
    const buffered = this.preconnectSignals.splice(0);
    for (const sig of buffered) {
      this.signalQueue = this.signalQueue
        .then(() => this.processSignal(sig))
        .catch(() => undefined);
    }
    await this.signalQueue;
  }

  // ─── Private: signal processing ──────────────────────────────────────────────

  private async processSignal(payload: BufferedSignal) {
    const { chatId, fromUserId, data } = payload;
    const signalType = data.type;

    if (signalType === "offer" && typeof data.sdp === "string") {
      // Ignore if we already have a local offer pending (glare — both sides offered)
      if (this.peer!.signalingState === "have-local-offer") return;

      await this.peer!.setRemoteDescription(
        new RTCSessionDescription({ type: "offer", sdp: data.sdp })
      );
      await this.flushPendingCandidates();
      const answer = await this.peer!.createAnswer();
      await this.peer!.setLocalDescription(answer);
      this.emitSignal({ chatId, targetUserId: fromUserId, data: { type: "answer", sdp: answer.sdp } });
      return;
    }

    if (signalType === "answer" && typeof data.sdp === "string") {
      if (this.peer!.signalingState === "have-local-offer") {
        await this.peer!.setRemoteDescription(
          new RTCSessionDescription({ type: "answer", sdp: data.sdp })
        );
        await this.flushPendingCandidates();
      }
      return;
    }

    if (signalType === "ice-candidate" && data.candidate && typeof data.candidate === "object") {
      const c = data.candidate as RTCIceCandidateInit;
      if (this.peer!.remoteDescription) {
        await this.peer!.addIceCandidate(new RTCIceCandidate(c));
      } else {
        this.pendingCandidates.push(c);
      }
    }
  }

  // ─── Private: renegotiation ───────────────────────────────────────────────────

  private async renegotiate(options?: RTCOfferOptions) {
    if (!this.peer || !this.chatId || !this.targetUserId) return;
    if (this.peer.signalingState !== "stable") return;
    const offer = await this.peer.createOffer(options);
    await this.peer.setLocalDescription(offer);
    this.emitSignal({
      chatId: this.chatId,
      targetUserId: this.targetUserId,
      data: { type: "offer", sdp: offer.sdp },
    });
  }

  private scheduleReconnect(delay: number) {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      const state = this.peer?.connectionState;
      if (state === "disconnected" || state === "failed") {
        void this.attemptReconnect();
      }
    }, delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async attemptReconnect() {
    if (!this.peer || !this.chatId || !this.targetUserId) return;
    if (this.reconnectAttempts >= 5) {
      this.onConnectionFailed?.();
      return;
    }
    this.reconnectAttempts++;
    // Only the offerer (caller) sends the new offer; the callee just waits for it.
    if (!this.isOfferer) return;
    try {
      await this.renegotiate({ iceRestart: true });
      // If still not recovered after another 5s, try again.
      this.scheduleReconnect(5000);
    } catch {
      // Peer may have been closed; nothing to do.
    }
  }

  // ─── Private: stream helpers ──────────────────────────────────────────────────

  private async acquireLocalStream() {
    const isVideo = this.callType === "video";
    let nextSource: MediaStream;

    if (isVideo) {
      try {
        nextSource = await navigator.mediaDevices.getUserMedia({
          audio: this.buildAudioConstraints(),
          video: this.buildVideoConstraints(),
        });
      } catch (err) {
        const isMediaErr = err instanceof DOMException &&
          ["NotFoundError", "NotAllowedError", "DevicesNotFoundError",
           "OverconstrainedError", "NotReadableError"].includes(err.name);
        if (isMediaErr) {
          nextSource = await navigator.mediaDevices.getUserMedia({
            audio: this.buildAudioConstraints(),
            video: false,
          });
          this.callType = "audio";
          this.onVideoUnavailable?.();
        } else {
          throw err;
        }
      }
    } else {
      nextSource = await navigator.mediaDevices.getUserMedia({
        audio: this.buildAudioConstraints(),
        video: false,
      });
    }

    const nextSend = this.settings.voiceEnhancement
      ? this.createEnhancedStream(nextSource)
      : nextSource;

    // If the peer already exists, hot-swap tracks rather than renegotiating
    if (this.peer) {
      const audioTrack = nextSend.getAudioTracks()[0] ?? null;
      if (audioTrack) {
        const sender = this.peer.getSenders().find((s) => s.track?.kind === "audio");
        if (sender) await sender.replaceTrack(audioTrack);
      }
      const videoTrack = nextSend.getVideoTracks()[0] ?? null;
      if (videoTrack) {
        const sender = this.peer.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(videoTrack);
      }
    }

    this.stopStream(this.localStream);
    if (this.localStream !== this.sourceStream) this.stopStream(this.sourceStream);
    this.localStream = nextSend;
    this.sourceStream = nextSource;

    if (this.localVideoEl && this.callType === "video") {
      this.localVideoEl.srcObject = nextSource;
      void this.localVideoEl.play().catch(() => undefined);
    }

    this.applyMicMutedState();
    this.applyCameraEnabledState();
  }

  private reattachRemoteVideo() {
    if (!this.remoteVideoEl || !this.remoteStream) return;
    this.remoteVideoEl.srcObject = this.remoteStream;
    this.remoteVideoEl.muted = true;
    this.remoteVideoEl.autoplay = true;
    void this.remoteVideoEl.play().catch(() => undefined);
  }

  private buildAudioConstraints(): MediaTrackConstraints {
    const c: MediaTrackConstraints = {
      echoCancellation: this.settings.echoCancellation,
      noiseSuppression: this.settings.noiseSuppression,
      autoGainControl: this.settings.autoGainControl,
    };
    if (this.settings.inputDeviceId) c.deviceId = { exact: this.settings.inputDeviceId };
    return c;
  }

  private buildVideoConstraints(): MediaTrackConstraints {
    const c: MediaTrackConstraints = {};
    if (this.settings.videoDeviceId) {
      c.deviceId = { exact: this.settings.videoDeviceId };
    } else {
      c.facingMode = this.settings.cameraFacingMode ?? "user";
    }
    return c;
  }

  private async flushPendingCandidates() {
    const list = this.pendingCandidates.splice(0);
    for (const c of list) {
      await this.peer!.addIceCandidate(new RTCIceCandidate(c)).catch(() => undefined);
    }
  }

  private applyMicMutedState() {
    const on = !this.settings.micMuted;
    for (const t of this.localStream?.getAudioTracks() ?? []) t.enabled = on;
  }

  private applyCameraEnabledState() {
    const on = this.settings.cameraEnabled;
    for (const t of this.localStream?.getVideoTracks() ?? []) t.enabled = on;
  }

  private applySoundDisabledState() {
    if (!this.remoteAudioEl) return;
    this.remoteAudioEl.muted = this.settings.soundDisabled;
    this.remoteAudioEl.volume = this.settings.speakerMode === "small" ? 0.35 : 1;
  }

  private supportsSinkId() {
    if (!this.remoteAudioEl) return false;
    return typeof (this.remoteAudioEl as HTMLAudioElement & { setSinkId?: unknown }).setSinkId === "function";
  }

  private async applyOutputDevice() {
    if (!this.remoteAudioEl || !this.settings.outputDeviceId || !this.supportsSinkId()) return;
    const el = this.remoteAudioEl as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> };
    await el.setSinkId(this.settings.outputDeviceId);
  }

  private async loadIceServers(): Promise<RTCIceServer[]> {
    try {
      const res = await fetch(`${getApiUrl()}/api/calls/ice-servers`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${this.accessToken}` },
        credentials: "include",
      });
      if (res.ok) {
        const payload = (await res.json()) as {
          iceServers?: Array<{ urls?: string[] | string; username?: string; credential?: string }>;
        };
        const servers = (payload.iceServers ?? [])
          .map((s) => ({ urls: s.urls ?? [], username: s.username, credential: s.credential }))
          .filter((s) => (Array.isArray(s.urls) ? s.urls.length > 0 : Boolean(s.urls)));
        if (servers.length > 0) return servers;
      }
    } catch { /* fall through */ }

    const fallback: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
    if (typeof import.meta.env.VITE_STUN_URL === "string" && import.meta.env.VITE_STUN_URL.trim())
      fallback.unshift({ urls: import.meta.env.VITE_STUN_URL.trim() });
    if (typeof import.meta.env.VITE_TURN_URL === "string" && import.meta.env.VITE_TURN_URL.trim())
      fallback.push({
        urls: import.meta.env.VITE_TURN_URL.trim(),
        username: import.meta.env.VITE_TURN_USERNAME,
        credential: import.meta.env.VITE_TURN_PASSWORD,
      });
    return fallback;
  }

  private emitSignal(payload: SignalEnvelope) {
    this.socket.emit("call:signal", payload);
  }

  private createEnhancedStream(input: MediaStream): MediaStream {
    const AudioCtor =
      typeof window === "undefined" ? null :
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).AudioContext ?? (window as any).webkitAudioContext) as (new () => AudioContext) | null | undefined;
    if (!AudioCtor) return input;
    this.closeAudioProcessor();
    this.processorContext = new AudioCtor();
    const src = this.processorContext.createMediaStreamSource(input);
    const hp = this.processorContext.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = this.settings.voiceEnhancementHighpass;
    const comp = this.processorContext.createDynamicsCompressor();
    comp.threshold.value = this.settings.voiceEnhancementThreshold;
    comp.knee.value = 24; comp.ratio.value = 3;
    comp.attack.value = 0.003; comp.release.value = 0.2;
    this.processorDestination = this.processorContext.createMediaStreamDestination();
    src.connect(hp); hp.connect(comp); comp.connect(this.processorDestination);
    for (const t of input.getVideoTracks()) this.processorDestination.stream.addTrack(t);
    return this.processorDestination.stream;
  }

  private closeAudioProcessor() {
    this.processorDestination = null;
    if (this.processorContext) void this.processorContext.close().catch(() => undefined);
    this.processorContext = null;
  }

  private stopStream(stream: MediaStream | null) {
    if (!stream) return;
    for (const t of stream.getTracks()) t.stop();
  }
}
