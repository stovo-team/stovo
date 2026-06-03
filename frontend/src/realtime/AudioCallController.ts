import { Socket } from "socket.io-client";
import { getApiUrl } from "../api/client";

type SignalEnvelope = {
  chatId: string;
  targetUserId?: string;
  data: Record<string, unknown>;
};

export type CallAudioSettings = {
  micMuted: boolean;
  soundDisabled: boolean;
  speakerMode: "small" | "large";
  inputDeviceId: string;
  outputDeviceId: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  voiceEnhancement: boolean;
  inputGain: number;
  outputVolume: number;
  voiceEnhancementThreshold: number;
  voiceEnhancementHighpass: number;
};

export type CallAudioDevice = {
  deviceId: string;
  kind: "audioinput" | "audiooutput";
  label: string;
};

export type CallAudioCapabilities = {
  canSelectInputDevice: boolean;
  canSelectOutputDevice: boolean;
  canUseNoiseSuppression: boolean;
  canUseEchoCancellation: boolean;
  canUseAutoGainControl: boolean;
  canUseVoiceEnhancement: boolean;
};

export const DEFAULT_CALL_AUDIO_SETTINGS: CallAudioSettings = {
  micMuted: false,
  soundDisabled: false,
  speakerMode: "large",
  inputDeviceId: "",
  outputDeviceId: "",
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  voiceEnhancement: false,
  inputGain: 100,
  outputVolume: 80,
  voiceEnhancementThreshold: -24,
  voiceEnhancementHighpass: 120,
};

export default class AudioCallController {
  private socket: Socket;
  private accessToken: string;

  private remoteAudioEl: HTMLAudioElement | null = null;

  private peer: RTCPeerConnection | null = null;

  private localStream: MediaStream | null = null;
  private sourceStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;

  // AudioContext path used for loudspeaker routing on mobile
  private remoteAudioCtx: AudioContext | null = null;
  private remoteStreamSource: MediaStreamAudioSourceNode | null = null;
  private remoteGainNode: GainNode | null = null;

  private chatId: string | null = null;
  private targetUserId: string | null = null;

  // Serialises concurrent ensurePeer() calls so only one RTCPeerConnection is ever created.
  private ensurePeerPromise: Promise<void> | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private settings: CallAudioSettings = { ...DEFAULT_CALL_AUDIO_SETTINGS };
  private processorContext: AudioContext | null = null;
  private processorDestination: MediaStreamAudioDestinationNode | null = null;
  private gainNode: GainNode | null = null;

  constructor(socket: Socket, accessToken: string) {
    this.socket = socket;
    this.accessToken = accessToken;
  }

  attachRemoteAudioElement(element: HTMLAudioElement | null) {
    this.remoteAudioEl = element;
    // If we already have a remote stream (late attach), start routing immediately.
    // Not a user gesture — use the plain audio element path.
    if (this.remoteStream) {
      this.applyRemoteAudioRouting(false);
    } else {
      this.applySoundDisabledState();
    }
    void this.applyOutputDevice().catch(() => undefined);
  }

  async startOutgoing(chatId: string, targetUserId: string) {
    this.chatId = chatId;
    this.targetUserId = targetUserId;
    await this.ensurePeer();
    const offer = await this.peer!.createOffer();
    await this.peer!.setLocalDescription(offer);
    this.emitSignal({ chatId, targetUserId, data: { type: "offer", sdp: offer.sdp } });
  }

  async acceptIncoming(chatId: string, targetUserId: string) {
    this.chatId = chatId;
    this.targetUserId = targetUserId;
    await this.ensurePeer();
  }

  async handleSignal(payload: { chatId: string; fromUserId: string; data: Record<string, unknown> }) {
    if (!payload?.chatId || !payload?.data) {
      return;
    }
    this.chatId = payload.chatId;
    this.targetUserId = payload.fromUserId;
    await this.ensurePeer();

    const signalType = payload.data.type;
    if (signalType === "offer" && typeof payload.data.sdp === "string") {
      await this.peer!.setRemoteDescription(
        new RTCSessionDescription({ type: "offer", sdp: payload.data.sdp })
      );
      await this.flushPendingCandidates();
      const answer = await this.peer!.createAnswer();
      await this.peer!.setLocalDescription(answer);
      this.emitSignal({
        chatId: payload.chatId,
        targetUserId: payload.fromUserId,
        data: { type: "answer", sdp: answer.sdp }
      });
      return;
    }
    if (signalType === "answer" && typeof payload.data.sdp === "string") {
      await this.peer!.setRemoteDescription(
        new RTCSessionDescription({ type: "answer", sdp: payload.data.sdp })
      );
      await this.flushPendingCandidates();
      return;
    }
    if (
      signalType === "ice-candidate" &&
      payload.data.candidate &&
      typeof payload.data.candidate === "object"
    ) {
      const candidate = payload.data.candidate as RTCIceCandidateInit;
      if (this.peer!.remoteDescription) {
        await this.peer!.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        this.pendingCandidates.push(candidate);
      }
    }
  }

  private async flushPendingCandidates() {
    const candidates = this.pendingCandidates.splice(0);
    for (const candidate of candidates) {
      await this.peer!.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
    }
  }

  getAudioSettings() {
    return { ...this.settings };
  }

  getCapabilities(): CallAudioCapabilities {
    const supportsMediaDevices = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices);
    return {
      canSelectInputDevice: supportsMediaDevices,
      canSelectOutputDevice: this.supportsSinkId(),
      canUseNoiseSuppression: supportsMediaDevices,
      canUseEchoCancellation: supportsMediaDevices,
      canUseAutoGainControl: supportsMediaDevices,
      canUseVoiceEnhancement: typeof window !== "undefined" && Boolean(window.AudioContext)
    };
  }

  getTrackConstraintStatus(): {
    echoCancellation: boolean | null;
    noiseSuppression: boolean | null;
    autoGainControl: boolean | null;
  } {
    const track = this.sourceStream?.getAudioTracks()[0] ?? null;
    if (!track) {
      return { echoCancellation: null, noiseSuppression: null, autoGainControl: null };
    }
    const s = track.getSettings() as MediaTrackSettings & {
      echoCancellation?: boolean;
      noiseSuppression?: boolean;
      autoGainControl?: boolean;
    };
    return {
      echoCancellation: s.echoCancellation ?? null,
      noiseSuppression: s.noiseSuppression ?? null,
      autoGainControl: s.autoGainControl ?? null,
    };
  }

  async getAvailableDevices(): Promise<CallAudioDevice[]> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return [];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === "audioinput" || device.kind === "audiooutput")
      .map((device) => ({
        deviceId: device.deviceId,
        kind: device.kind as "audioinput" | "audiooutput",
        label:
          device.label ||
          (device.kind === "audioinput" ? "Microphone device" : "Speaker device")
      }));
  }

  async setInputDevice(deviceId: string) {
    await this.applyAudioSettings({ inputDeviceId: deviceId });
  }

  async setOutputDevice(deviceId: string) {
    await this.applyAudioSettings({ outputDeviceId: deviceId });
  }

  async setProcessingOptions(
    patch: Pick<
      CallAudioSettings,
      "echoCancellation" | "noiseSuppression" | "autoGainControl" | "voiceEnhancement"
    >
  ) {
    await this.applyAudioSettings(patch);
  }

  async applyAudioSettings(patch: Partial<CallAudioSettings>) {
    const previous = this.settings;
    this.settings = { ...this.settings, ...patch };

    if (patch.micMuted !== undefined) {
      this.applyMicMutedState();
    }
    if (patch.speakerMode !== undefined) {
      // speakerMode is only ever changed via the speaker button — that IS a user gesture,
      // so the AudioContext path is allowed here.
      this.applyRemoteAudioRouting(true);
    } else if (patch.soundDisabled !== undefined || patch.outputVolume !== undefined) {
      this.applySoundDisabledState();
    }

    const needsStreamReacquire =
      patch.inputDeviceId !== undefined ||
      patch.echoCancellation !== undefined ||
      patch.noiseSuppression !== undefined ||
      patch.autoGainControl !== undefined ||
      patch.voiceEnhancement !== undefined ||
      (patch.voiceEnhancementThreshold !== undefined && this.settings.voiceEnhancement) ||
      (patch.voiceEnhancementHighpass !== undefined && this.settings.voiceEnhancement);

    if (needsStreamReacquire && this.peer) {
      try {
        await this.acquireLocalAudioStream();
      } catch (error) {
        this.settings = previous;
        this.applyMicMutedState();
        this.applySoundDisabledState();
        throw error;
      }
    }

    // Hot-update gain without stream re-acquire
    if (patch.inputGain !== undefined && this.gainNode) {
      this.gainNode.gain.value = this.settings.inputGain / 100;
    }

    if (patch.outputDeviceId !== undefined) {
      await this.applyOutputDevice();
    }
  }

  async cleanup() {
    this.stopStream(this.localStream);
    this.stopStream(this.sourceStream);
    this.localStream = null;
    this.sourceStream = null;
    this.remoteStream = null;
    if (this.peer) {
      this.peer.onicecandidate = null;
      this.peer.ontrack = null;
      this.peer.close();
    }
    this.peer = null;
    this.ensurePeerPromise = null;
    this.closeRemoteAudioCtx();
    if (this.remoteAudioEl) {
      this.remoteAudioEl.srcObject = null;
      this.remoteAudioEl.muted = false;
    }
    this.closeAudioProcessor();
    this.settings = { ...DEFAULT_CALL_AUDIO_SETTINGS };
    this.chatId = null;
    this.targetUserId = null;
    this.pendingCandidates = [];
  }

  /**
   * Pre-acquire the microphone while still inside a user-gesture handler.
   * Call this immediately on button tap (before any await / socket round-trip).
   * `ensurePeer` will reuse the stream instead of calling getUserMedia again.
   */
  async primeLocalStream(): Promise<void> {
    if (this.localStream) return;
    try {
      await this.acquireLocalAudioStream();
    } catch {
      // Swallow – ensurePeer will try again and surface the error properly.
    }
  }

  private async ensurePeer() {
    if (this.peer) return;

    // If a peer creation is already in flight, wait for it instead of creating a second one.
    if (this.ensurePeerPromise) {
      return this.ensurePeerPromise;
    }

    this.ensurePeerPromise = this.createPeer().finally(() => {
      this.ensurePeerPromise = null;
    });

    return this.ensurePeerPromise;
  }

  private async createPeer() {
    // Double-check: another concurrent caller may have finished first.
    if (this.peer) return;

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      throw new Error("Microphone is unavailable in this browser context. Use HTTPS (or localhost) and grant mic permission.");
    }

    // Only call getUserMedia if not already primed from a user-gesture handler.
    if (!this.localStream) {
      await this.acquireLocalAudioStream();
    }

    const peer = new RTCPeerConnection({
      iceServers: await this.loadIceServers()
    });

    peer.oniceconnectionstatechange = () => {
      console.log("[call] ICE:", peer.iceConnectionState);
    };
    peer.onconnectionstatechange = () => {
      console.log("[call] connection:", peer.connectionState);
    };
    peer.onsignalingstatechange = () => {
      console.log("[call] signaling:", peer.signalingState);
    };

    for (const track of this.localStream?.getTracks() ?? []) {
      console.log("[call] addTrack", track.kind, track.label, "enabled=", track.enabled, "readyState=", track.readyState);
      peer.addTrack(track, this.localStream!);
    }

    peer.onicecandidate = (event) => {
      if (!event.candidate || !this.chatId || !this.targetUserId) return;
      this.emitSignal({
        chatId: this.chatId,
        targetUserId: this.targetUserId,
        data: { type: "ice-candidate", candidate: event.candidate.toJSON() }
      });
    };

    peer.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        this.remoteStream = remoteStream;
        // ontrack is a WebRTC callback, not a user gesture — use the audio element path.
        // AudioContext creation outside a user gesture triggers autoplay policy warnings
        // and the context starts suspended (silent).
        this.applyRemoteAudioRouting(false);
      }
    };

    this.peer = peer;
    this.applyMicMutedState();
    this.applySoundDisabledState();
    await this.applyOutputDevice();
  }

  private async loadIceServers(): Promise<RTCIceServer[]> {
    try {
      const response = await fetch(`${getApiUrl()}/api/calls/ice-servers`, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.accessToken}`
        },
        credentials: "include"
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          iceServers?: Array<{ urls?: string[] | string; username?: string; credential?: string }>;
        };
        const servers = (payload.iceServers ?? [])
          .map((server) => ({
            urls: server.urls ?? [],
            username: server.username,
            credential: server.credential
          }))
          .filter((server) =>
            Array.isArray(server.urls) ? server.urls.length > 0 : Boolean(server.urls)
          );
        if (servers.length > 0) {
          return servers;
        }
      }
    } catch {
      // Fallback is handled below when the ICE endpoint is unreachable.
    }

    const fallback: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
    if (typeof import.meta.env.VITE_STUN_URL === "string" && import.meta.env.VITE_STUN_URL.trim()) {
      fallback.unshift({ urls: import.meta.env.VITE_STUN_URL.trim() });
    }
    if (typeof import.meta.env.VITE_TURN_URL === "string" && import.meta.env.VITE_TURN_URL.trim()) {
      fallback.push({
        urls: import.meta.env.VITE_TURN_URL.trim(),
        username: import.meta.env.VITE_TURN_USERNAME,
        credential: import.meta.env.VITE_TURN_PASSWORD
      });
    }
    return fallback;
  }

  private emitSignal(payload: SignalEnvelope) {
    this.socket.emit("call:signal", payload);
  }

  private buildAudioConstraints(): MediaTrackConstraints {
    // Use `ideal` rather than exact booleans so the browser can satisfy the
    // request even when a particular constraint isn't supported (e.g. some
    // mobile browsers reject exact noiseSuppression/echoCancellation).
    const constraints: MediaTrackConstraints = {
      echoCancellation: { ideal: this.settings.echoCancellation },
      noiseSuppression: { ideal: this.settings.noiseSuppression },
      autoGainControl:  { ideal: this.settings.autoGainControl  },
    };
    if (this.settings.inputDeviceId) {
      constraints.deviceId = { exact: this.settings.inputDeviceId };
    }
    return constraints;
  }

  private async acquireLocalAudioStream() {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      throw new Error("Microphone is unavailable in this browser context. Use HTTPS (or localhost) and grant mic permission.");
    }

    // Try with preferred constraints first; fall back to bare audio if the
    // browser/device rejects the constrained request (common on some mobile).
    let nextSource: MediaStream;
    try {
      nextSource = await navigator.mediaDevices.getUserMedia({
        audio: this.buildAudioConstraints(),
        video: false,
      });
    } catch {
      nextSource = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
    const nextSendStream = await this.createProcessedStream(nextSource);

    const nextTrack = nextSendStream.getAudioTracks()[0] ?? null;
    if (this.peer && nextTrack) {
      const sender = this.peer.getSenders().find((candidate) => candidate.track?.kind === "audio");
      if (sender) {
        await sender.replaceTrack(nextTrack);
      }
    }

    this.stopStream(this.localStream);
    this.stopStream(this.sourceStream);
    this.localStream = nextSendStream;
    this.sourceStream = nextSource;
    this.applyMicMutedState();
  }

  private applyMicMutedState() {
    const enabled = !this.settings.micMuted;
    for (const track of this.localStream?.getAudioTracks() ?? []) {
      track.enabled = enabled;
    }
  }

  private applySoundDisabledState() {
    const muted = this.settings.soundDisabled;
    const vol = this.settings.outputVolume / 100;

    // Audio-element route (earpiece / output-device)
    if (this.remoteAudioEl) {
      this.remoteAudioEl.muted = muted;
      this.remoteAudioEl.volume = vol;
    }

    // AudioContext route (loudspeaker on mobile)
    if (this.remoteGainNode) {
      this.remoteGainNode.gain.value = muted ? 0 : vol;
    }
  }

  /**
   * Routes the remote stream.
   *   fromUserGesture=true  → AudioContext path allowed (loudspeaker on mobile)
   *   fromUserGesture=false → always use plain <audio> element (safe outside gesture)
   */
  private applyRemoteAudioRouting(fromUserGesture: boolean) {
    if (fromUserGesture && this.settings.speakerMode === "large") {
      void this.routeRemoteViaAudioContext();
    } else {
      this.routeRemoteViaElement();
    }
  }

  private async routeRemoteViaAudioContext() {
    // Silence the audio element so there's no double-play
    if (this.remoteAudioEl) {
      this.remoteAudioEl.srcObject = null;
      this.remoteAudioEl.pause();
    }

    // Already routed through AudioContext with the same stream — just re-apply volume
    if (this.remoteAudioCtx && this.remoteStreamSource && this.remoteStream) {
      this.applySoundDisabledState();
      return;
    }

    this.closeRemoteAudioCtx();

    const AudioCtor =
      typeof window === "undefined"
        ? null
        : (window.AudioContext ||
            (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);

    if (!AudioCtor || !this.remoteStream) {
      this.routeRemoteViaElement();
      return;
    }

    try {
      const ctx = new AudioCtor();
      await ctx.resume();

      // If the context didn't actually start (autoplay policy), fall back to element.
      if (ctx.state !== "running") {
        void ctx.close().catch(() => undefined);
        this.routeRemoteViaElement();
        return;
      }

      this.remoteAudioCtx = ctx;
      this.remoteStreamSource = ctx.createMediaStreamSource(this.remoteStream);
      this.remoteGainNode = ctx.createGain();
      const vol = this.settings.outputVolume / 100;
      this.remoteGainNode.gain.value = this.settings.soundDisabled ? 0 : vol;
      this.remoteStreamSource.connect(this.remoteGainNode);
      this.remoteGainNode.connect(ctx.destination);
    } catch {
      // AudioContext not available or failed — fall back to element
      this.closeRemoteAudioCtx();
      this.routeRemoteViaElement();
    }
  }

  private routeRemoteViaElement() {
    this.closeRemoteAudioCtx();

    if (this.remoteAudioEl && this.remoteStream) {
      this.remoteAudioEl.srcObject = this.remoteStream;
      this.remoteAudioEl.autoplay = true;
      this.applySoundDisabledState();
      void this.remoteAudioEl.play().catch(() => undefined);
    }
  }

  private closeRemoteAudioCtx() {
    if (this.remoteStreamSource) {
      this.remoteStreamSource.disconnect();
      this.remoteStreamSource = null;
    }
    this.remoteGainNode = null;
    if (this.remoteAudioCtx) {
      void this.remoteAudioCtx.close().catch(() => undefined);
      this.remoteAudioCtx = null;
    }
  }

  private supportsSinkId() {
    if (!this.remoteAudioEl) {
      return false;
    }
    return typeof (this.remoteAudioEl as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId === "function";
  }

  private async applyOutputDevice() {
    if (!this.remoteAudioEl || !this.settings.outputDeviceId || !this.supportsSinkId()) {
      return;
    }
    const audioEl = this.remoteAudioEl as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> };
    await audioEl.setSinkId(this.settings.outputDeviceId);
  }

  private async createProcessedStream(input: MediaStream): Promise<MediaStream> {
    const needsProcessing =
      this.settings.voiceEnhancement ||
      Math.abs(this.settings.inputGain - 100) >= 1;

    // Fast-path: no processing needed → return the raw getUserMedia stream directly.
    // This is the default case and avoids AudioContext on mobile (suspended context = silent mic).
    if (!needsProcessing) {
      this.closeAudioProcessor();
      return input;
    }

    const AudioCtor =
      typeof window === "undefined"
        ? null
        : (
            window.AudioContext ||
            (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          );
    if (!AudioCtor) {
      return input;
    }

    this.closeAudioProcessor();
    this.processorContext = new AudioCtor();

    // Mobile browsers (iOS Safari, Android Chrome) start AudioContext suspended.
    // We must resume it before connecting nodes or the output track is silent.
    try {
      await this.processorContext.resume();
    } catch {
      // If resume fails, fall back to the raw stream.
      this.closeAudioProcessor();
      return input;
    }

    const source = this.processorContext.createMediaStreamSource(input);
    this.gainNode = this.processorContext.createGain();
    this.gainNode.gain.value = this.settings.inputGain / 100;
    this.processorDestination = this.processorContext.createMediaStreamDestination();

    if (this.settings.voiceEnhancement) {
      const highpass = this.processorContext.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = this.settings.voiceEnhancementHighpass;
      const compressor = this.processorContext.createDynamicsCompressor();
      compressor.threshold.value = this.settings.voiceEnhancementThreshold;
      compressor.knee.value = 24;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.2;
      source.connect(highpass);
      highpass.connect(compressor);
      compressor.connect(this.gainNode);
    } else {
      source.connect(this.gainNode);
    }

    this.gainNode.connect(this.processorDestination);
    return this.processorDestination.stream;
  }

  private closeAudioProcessor() {
    this.gainNode = null;
    this.processorDestination = null;
    if (this.processorContext) {
      void this.processorContext.close().catch(() => undefined);
    }
    this.processorContext = null;
  }

  private stopStream(stream: MediaStream | null) {
    if (!stream) {
      return;
    }
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }
}
