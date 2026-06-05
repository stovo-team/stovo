import { Socket } from "socket.io-client";
import { getApiUrl } from "../api/client";

type SignalEnvelope = {
  chatId: string;
  targetUserId?: string;
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
};

export default class CallController {
  private socket: Socket;
  private accessToken: string;

  // Element references — attached once at mount (elements always in DOM, not conditional)
  private remoteAudioEl: HTMLAudioElement | null = null;
  private remoteVideoEl: HTMLVideoElement | null = null;
  private localVideoEl: HTMLVideoElement | null = null;

  private peer: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;   // stream added to peer (may be voice-enhanced)
  private sourceStream: MediaStream | null = null;  // raw stream from getUserMedia (for local preview)

  private chatId: string | null = null;
  private targetUserId: string | null = null;
  // Whether this peer is the call initiator (decides who re-offers on renegotiation)
  // Set to true after the initial offer/answer exchange completes.
  // Used to guard callee-side renegotiation in handleSignal.
  private initialOfferSent = false;
  private callType: "audio" | "video" = "audio";
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private settings: CallSettings = { ...DEFAULT_SETTINGS };
  private processorContext: AudioContext | null = null;
  private processorDestination: MediaStreamAudioDestinationNode | null = null;

  /** Called when a video call had no camera — so UI can show a warning and downgrade visuals */
  onVideoUnavailable?: () => void;

  constructor(socket: Socket, accessToken: string) {
    this.socket = socket;
    this.accessToken = accessToken;
  }

  // ─── Element attachment ─────────────────────────────────────────────────────

  attachRemoteAudioElement(element: HTMLAudioElement | null) {
    this.remoteAudioEl = element;
    this.applySoundDisabledState();
    void this.applyOutputDevice().catch(() => undefined);
  }

  attachRemoteVideoElement(element: HTMLVideoElement | null) {
    this.remoteVideoEl = element;
    // If we already have a remote stream with a video track, attach it now
    if (element) this.reattachRemoteVideo();
  }

  attachLocalVideoElement(element: HTMLVideoElement | null) {
    this.localVideoEl = element;
    // If we already acquired a local video stream, show it immediately
    if (element && this.sourceStream && this.callType === "video") {
      element.srcObject = this.sourceStream;
      void element.play().catch(() => undefined);
    }
  }

  // ─── Call lifecycle ─────────────────────────────────────────────────────────

  async startOutgoing(chatId: string, targetUserId: string, callType: "audio" | "video" = "audio") {
    this.chatId = chatId;
    this.targetUserId = targetUserId;
    this.callType = callType;
    this.initialOfferSent = false;
    await this.ensurePeer();
    const offer = await this.peer!.createOffer();
    await this.peer!.setLocalDescription(offer);
    this.initialOfferSent = true;
    this.emitSignal({ chatId, targetUserId, data: { type: "offer", sdp: offer.sdp } });
  }

  async acceptIncoming(chatId: string, targetUserId: string, callType: "audio" | "video" = "audio") {
    this.chatId = chatId;
    this.targetUserId = targetUserId;
    this.callType = callType;
    // Keep initialOfferSent = false — renegotiation must NOT fire until
    // the first offer/answer exchange is complete (set to true in handleSignal
    // after we send our answer). Premature offers cause DTLS role conflicts.
    this.initialOfferSent = false;
    await this.ensurePeer();
  }

  async handleSignal(payload: { chatId: string; fromUserId: string; data: Record<string, unknown> }) {
    if (!payload?.chatId || !payload?.data) return;
    this.chatId = payload.chatId;
    this.targetUserId = payload.fromUserId;
    await this.ensurePeer();

    const signalType = payload.data.type;
    if (signalType === "offer" && typeof payload.data.sdp === "string") {
      // Ignore incoming offer if we already have a local offer pending (glare).
      // The remote side will handle our offer and the exchange will complete.
      if (this.peer!.signalingState === "have-local-offer") return;

      await this.peer!.setRemoteDescription(
        new RTCSessionDescription({ type: "offer", sdp: payload.data.sdp })
      );
      await this.flushPendingCandidates();
      const answer = await this.peer!.createAnswer();
      await this.peer!.setLocalDescription(answer);
      this.emitSignal({
        chatId: payload.chatId,
        targetUserId: payload.fromUserId,
        data: { type: "answer", sdp: answer.sdp },
      });
      // First offer/answer exchange is now complete — enable renegotiation
      this.initialOfferSent = true;
      return;
    }
    if (signalType === "answer" && typeof payload.data.sdp === "string") {
      if (this.peer!.signalingState === "have-local-offer") {
        await this.peer!.setRemoteDescription(
          new RTCSessionDescription({ type: "answer", sdp: payload.data.sdp })
        );
        await this.flushPendingCandidates();
        // Caller side: exchange complete, renegotiation already enabled
      }
      return;
    }
    if (signalType === "ice-candidate" && payload.data.candidate && typeof payload.data.candidate === "object") {
      const candidate = payload.data.candidate as RTCIceCandidateInit;
      if (this.peer!.remoteDescription) {
        await this.peer!.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        this.pendingCandidates.push(candidate);
      }
    }
  }

  // ─── Video toggle mid-call ───────────────────────────────────────────────────

  /**
   * Enable or disable the camera mid-call, triggering WebRTC renegotiation.
   * Safe to call during an audio call (upgrades to video) or a video call (disables camera).
   */
  async toggleVideo(enable: boolean): Promise<void> {
    if (!this.peer) return;

    if (enable) {
      // Try to get a video track; fall back gracefully if no camera
      let videoTrack: MediaStreamTrack | null = null;
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: this.buildVideoConstraints(),
        });
        videoTrack = videoStream.getVideoTracks()[0] ?? null;
      } catch {
        this.onVideoUnavailable?.();
        return;
      }
      if (!videoTrack) { this.onVideoUnavailable?.(); return; }

      // Add to local source stream so preview works
      this.sourceStream?.addTrack(videoTrack);
      if (this.sourceStream !== this.localStream) {
        this.localStream?.addTrack(videoTrack);
      }

      // Show local preview
      if (this.localVideoEl) {
        this.localVideoEl.srcObject = this.sourceStream;
        void this.localVideoEl.play().catch(() => undefined);
      }

      // Add track to peer, then manually renegotiate
      this.peer.addTrack(videoTrack, this.localStream ?? this.sourceStream!);
      this.callType = "video";
      await this.renegotiate();
    } else {
      // Remove video senders
      for (const sender of this.peer.getSenders()) {
        if (sender.track?.kind === "video") {
          sender.track.stop();
          this.peer.removeTrack(sender);
        }
      }
      // Stop local video tracks
      for (const track of this.sourceStream?.getVideoTracks() ?? []) track.stop();
      if (this.localStream !== this.sourceStream) {
        for (const track of this.localStream?.getVideoTracks() ?? []) track.stop();
      }
      // Clear local preview
      if (this.localVideoEl) this.localVideoEl.srcObject = null;
      this.callType = "audio";
      await this.renegotiate();
    }
  }

  /** Explicitly create and send a new offer (used for mid-call renegotiation). */
  private async renegotiate() {
    if (!this.peer || !this.chatId || !this.targetUserId) return;
    if (this.peer.signalingState !== "stable") return;
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);
    this.emitSignal({
      chatId: this.chatId,
      targetUserId: this.targetUserId,
      data: { type: "offer", sdp: offer.sdp },
    });
  }

  // ─── Settings ───────────────────────────────────────────────────────────────

  getSettings(): CallSettings {
    return { ...this.settings };
  }

  getCapabilities(): CallCapabilities {
    const supportsMediaDevices = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices);
    return {
      canSelectInputDevice: supportsMediaDevices,
      canSelectOutputDevice: this.supportsSinkId(),
      canUseNoiseSuppression: supportsMediaDevices,
      canUseEchoCancellation: supportsMediaDevices,
      canUseAutoGainControl: supportsMediaDevices,
      canUseVoiceEnhancement: typeof window !== "undefined" && Boolean(window.AudioContext),
      canUseCamera: supportsMediaDevices,
    };
  }

  async getAvailableDevices(): Promise<CallDevice[]> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "audioinput" || d.kind === "audiooutput" || d.kind === "videoinput")
      .map((d) => ({
        deviceId: d.deviceId,
        kind: d.kind as "audioinput" | "audiooutput" | "videoinput",
        label:
          d.label ||
          (d.kind === "audioinput" ? "Microphone" : d.kind === "audiooutput" ? "Speaker" : "Camera"),
      }));
  }

  async applySettings(patch: Partial<CallSettings>) {
    const previous = this.settings;
    this.settings = { ...this.settings, ...patch };

    if (patch.micMuted !== undefined) this.applyMicMutedState();
    if (patch.cameraEnabled !== undefined) this.applyCameraEnabledState();
    if (patch.soundDisabled !== undefined || patch.speakerMode !== undefined) this.applySoundDisabledState();

    const needsStreamReacquire =
      patch.inputDeviceId !== undefined ||
      patch.videoDeviceId !== undefined ||
      patch.cameraFacingMode !== undefined ||
      patch.echoCancellation !== undefined ||
      patch.noiseSuppression !== undefined ||
      patch.autoGainControl !== undefined ||
      patch.voiceEnhancement !== undefined;

    if (needsStreamReacquire && this.peer) {
      try {
        await this.acquireLocalStream();
      } catch (error) {
        this.settings = previous;
        this.applyMicMutedState();
        this.applySoundDisabledState();
        throw error;
      }
    }

    if (patch.outputDeviceId !== undefined) await this.applyOutputDevice();
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────────

  async cleanup() {
    this.stopStream(this.localStream);
    if (this.localStream !== this.sourceStream) this.stopStream(this.sourceStream);
    this.localStream = null;
    this.sourceStream = null;
    if (this.peer) {
      this.peer.onicecandidate = null;
      this.peer.ontrack = null;
      this.peer.close();
    }
    this.peer = null;
    if (this.remoteAudioEl) {
      this.remoteAudioEl.srcObject = null;
      this.remoteAudioEl.muted = false;
    }
    if (this.remoteVideoEl) this.remoteVideoEl.srcObject = null;
    if (this.localVideoEl) this.localVideoEl.srcObject = null;
    this.closeAudioProcessor();
    this.settings = { ...DEFAULT_SETTINGS };
    this.chatId = null;
    this.targetUserId = null;
    this.callType = "audio";
    this.initialOfferSent = false;
    this.pendingCandidates = [];
  }

  // ─── Private: peer setup ────────────────────────────────────────────────────

  private async ensurePeer() {
    if (this.peer) return;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      throw new Error(
        "Media devices are unavailable. Use HTTPS (or localhost) and grant camera/mic permission."
      );
    }

    await this.acquireLocalStream();

    const peer = new RTCPeerConnection({ iceServers: await this.loadIceServers() });

    peer.oniceconnectionstatechange = () => console.log("[call] ICE:", peer.iceConnectionState);
    peer.onconnectionstatechange = () => console.log("[call] Peer:", peer.connectionState);
    peer.onsignalingstatechange = () => console.log("[call] Signaling:", peer.signalingState);

    for (const track of this.localStream?.getTracks() ?? []) {
      peer.addTrack(track, this.localStream!);
    }

    peer.onicecandidate = (event) => {
      if (!event.candidate || !this.chatId || !this.targetUserId) return;
      this.emitSignal({
        chatId: this.chatId,
        targetUserId: this.targetUserId,
        data: { type: "ice-candidate", candidate: event.candidate.toJSON() },
      });
    };

    peer.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream) return;
      if (event.track.kind === "audio" && this.remoteAudioEl) {
        this.remoteAudioEl.srcObject = remoteStream;
        this.remoteAudioEl.autoplay = true;
        void this.remoteAudioEl.play().catch(() => undefined);
      }
      if (event.track.kind === "video") {
        this.remoteStream = remoteStream;
        this.reattachRemoteVideo();
      }
    };

    // NOTE: onnegotiationneeded is intentionally NOT wired here.
    // It fires unpredictably (including right after setLocalDescription(answer)),
    // causing callee-initiated offers that race with the established DTLS roles
    // and produce m-line order mismatches. Renegotiation is triggered explicitly
    // in toggleVideo() instead.

    this.peer = peer;
    this.applyMicMutedState();
    this.applyCameraEnabledState();
    this.applySoundDisabledState();
    await this.applyOutputDevice();
  }

  // Stored most-recent remote stream that had a video track (for late-attachment)
  private remoteStream: MediaStream | null = null;

  private reattachRemoteVideo() {
    if (!this.remoteVideoEl || !this.remoteStream) return;
    this.remoteVideoEl.srcObject = this.remoteStream;
    this.remoteVideoEl.muted = true; // audio comes from remoteAudioEl
    this.remoteVideoEl.autoplay = true;
    void this.remoteVideoEl.play().catch(() => undefined);
  }

  // ─── Private: stream management ─────────────────────────────────────────────

  private async acquireLocalStream() {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      throw new Error(
        "Media devices are unavailable. Use HTTPS (or localhost) and grant camera/mic permission."
      );
    }

    const isVideo = this.callType === "video";
    let nextSource: MediaStream;

    if (isVideo) {
      try {
        nextSource = await navigator.mediaDevices.getUserMedia({
          audio: this.buildAudioConstraints(),
          video: this.buildVideoConstraints(),
        });
      } catch (videoErr) {
        // If camera is unavailable, fall back to audio-only and notify UI
        const isMediaError = videoErr instanceof DOMException &&
          ["NotFoundError", "NotAllowedError", "DevicesNotFoundError",
           "OverconstrainedError", "NotReadableError"].includes(videoErr.name);
        if (isMediaError) {
          nextSource = await navigator.mediaDevices.getUserMedia({
            audio: this.buildAudioConstraints(),
            video: false,
          });
          this.callType = "audio";
          this.onVideoUnavailable?.();
        } else {
          throw videoErr;
        }
      }
    } else {
      nextSource = await navigator.mediaDevices.getUserMedia({
        audio: this.buildAudioConstraints(),
        video: false,
      });
    }

    const nextSendStream = this.settings.voiceEnhancement
      ? this.createEnhancedStream(nextSource)
      : nextSource;

    if (this.peer) {
      const audioTrack = nextSendStream.getAudioTracks()[0] ?? null;
      if (audioTrack) {
        const sender = this.peer.getSenders().find((s) => s.track?.kind === "audio");
        if (sender) await sender.replaceTrack(audioTrack);
      }
      const videoTrack = nextSendStream.getVideoTracks()[0] ?? null;
      if (videoTrack) {
        const sender = this.peer.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(videoTrack);
      }
    }

    this.stopStream(this.localStream);
    if (this.localStream !== this.sourceStream) this.stopStream(this.sourceStream);
    this.localStream = nextSendStream;
    this.sourceStream = nextSource;

    // Show local preview — works even if element was attached after stream acquired
    if (this.localVideoEl && this.callType === "video") {
      this.localVideoEl.srcObject = nextSource;
      void this.localVideoEl.play().catch(() => undefined);
    }

    this.applyMicMutedState();
    this.applyCameraEnabledState();
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
    // facingMode only makes sense when no specific deviceId is selected
    if (this.settings.videoDeviceId) {
      c.deviceId = { exact: this.settings.videoDeviceId };
    } else {
      c.facingMode = this.settings.cameraFacingMode ?? "user";
    }
    return c;
  }

  private async flushPendingCandidates() {
    const candidates = this.pendingCandidates.splice(0);
    for (const candidate of candidates) {
      await this.peer!.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
    }
  }

  private applyMicMutedState() {
    const enabled = !this.settings.micMuted;
    for (const track of this.localStream?.getAudioTracks() ?? []) track.enabled = enabled;
  }

  private applyCameraEnabledState() {
    const enabled = this.settings.cameraEnabled;
    for (const track of this.localStream?.getVideoTracks() ?? []) track.enabled = enabled;
  }

  private applySoundDisabledState() {
    if (!this.remoteAudioEl) return;
    this.remoteAudioEl.muted = this.settings.soundDisabled;
    this.remoteAudioEl.volume = this.settings.speakerMode === "small" ? 0.35 : 1;
  }

  private supportsSinkId() {
    if (!this.remoteAudioEl) return false;
    return typeof (
      this.remoteAudioEl as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
    ).setSinkId === "function";
  }

  private async applyOutputDevice() {
    if (!this.remoteAudioEl || !this.settings.outputDeviceId || !this.supportsSinkId()) return;
    const el = this.remoteAudioEl as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> };
    await el.setSinkId(this.settings.outputDeviceId);
  }

  private async loadIceServers(): Promise<RTCIceServer[]> {
    try {
      const response = await fetch(`${getApiUrl()}/api/calls/ice-servers`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${this.accessToken}` },
        credentials: "include",
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          iceServers?: Array<{ urls?: string[] | string; username?: string; credential?: string }>;
        };
        const servers = (payload.iceServers ?? [])
          .map((s) => ({ urls: s.urls ?? [], username: s.username, credential: s.credential }))
          .filter((s) => (Array.isArray(s.urls) ? s.urls.length > 0 : Boolean(s.urls)));
        if (servers.length > 0) return servers;
      }
    } catch {
      // fall through to defaults
    }
    const fallback: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
    if (typeof import.meta.env.VITE_STUN_URL === "string" && import.meta.env.VITE_STUN_URL.trim()) {
      fallback.unshift({ urls: import.meta.env.VITE_STUN_URL.trim() });
    }
    if (typeof import.meta.env.VITE_TURN_URL === "string" && import.meta.env.VITE_TURN_URL.trim()) {
      fallback.push({
        urls: import.meta.env.VITE_TURN_URL.trim(),
        username: import.meta.env.VITE_TURN_USERNAME,
        credential: import.meta.env.VITE_TURN_PASSWORD,
      });
    }
    return fallback;
  }

  private emitSignal(payload: SignalEnvelope) {
    this.socket.emit("call:signal", payload);
  }

  private createEnhancedStream(input: MediaStream): MediaStream {
    const AudioCtor =
      typeof window === "undefined"
        ? null
        : window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return input;
    this.closeAudioProcessor();
    this.processorContext = new AudioCtor();
    const source = this.processorContext.createMediaStreamSource(input);
    const highpass = this.processorContext.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = this.settings.voiceEnhancementHighpass;
    const compressor = this.processorContext.createDynamicsCompressor();
    compressor.threshold.value = this.settings.voiceEnhancementThreshold;
    compressor.knee.value = 24;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;
    this.processorDestination = this.processorContext.createMediaStreamDestination();
    source.connect(highpass);
    highpass.connect(compressor);
    compressor.connect(this.processorDestination);
    // Pass video tracks through unchanged
    for (const track of input.getVideoTracks()) {
      this.processorDestination.stream.addTrack(track);
    }
    return this.processorDestination.stream;
  }

  private closeAudioProcessor() {
    this.processorDestination = null;
    if (this.processorContext) void this.processorContext.close().catch(() => undefined);
    this.processorContext = null;
  }

  private stopStream(stream: MediaStream | null) {
    if (!stream) return;
    for (const track of stream.getTracks()) track.stop();
  }
}
