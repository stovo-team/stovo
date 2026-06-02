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
};

export default class AudioCallController {
  private socket: Socket;
  private accessToken: string;

  private remoteAudioEl: HTMLAudioElement | null = null;

  private peer: RTCPeerConnection | null = null;

  private localStream: MediaStream | null = null;
  private sourceStream: MediaStream | null = null;

  private chatId: string | null = null;

  private targetUserId: string | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private settings: CallAudioSettings = { ...DEFAULT_CALL_AUDIO_SETTINGS };
  private processorContext: AudioContext | null = null;
  private processorDestination: MediaStreamAudioDestinationNode | null = null;

  constructor(socket: Socket, accessToken: string) {
    this.socket = socket;
    this.accessToken = accessToken;
  }

  attachRemoteAudioElement(element: HTMLAudioElement | null) {
    this.remoteAudioEl = element;
    this.applySoundDisabledState();
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
    if (patch.soundDisabled !== undefined) {
      this.applySoundDisabledState();
    }

    const needsStreamReacquire =
      patch.inputDeviceId !== undefined ||
      patch.echoCancellation !== undefined ||
      patch.noiseSuppression !== undefined ||
      patch.autoGainControl !== undefined ||
      patch.voiceEnhancement !== undefined;

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

    if (patch.outputDeviceId !== undefined) {
      await this.applyOutputDevice();
    }
  }

  async cleanup() {
    this.stopStream(this.localStream);
    this.stopStream(this.sourceStream);
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
    this.closeAudioProcessor();
    this.settings = { ...DEFAULT_CALL_AUDIO_SETTINGS };
    this.chatId = null;
    this.targetUserId = null;
    this.pendingCandidates = [];
  }

  private async ensurePeer() {
    if (this.peer) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      throw new Error("Microphone is unavailable in this browser context. Use HTTPS (or localhost) and grant mic permission.");
    }

    await this.acquireLocalAudioStream();

    const peer = new RTCPeerConnection({
      iceServers: await this.loadIceServers()
    });

    peer.oniceconnectionstatechange = () => {
      console.log("ICE state:", peer.iceConnectionState);
    };

    peer.onconnectionstatechange = () => {
      console.log("Peer state:", peer.connectionState);
    };

    peer.onsignalingstatechange = () => {
      console.log("Signaling state:", peer.signalingState);
    };

    for (const track of this.localStream?.getTracks() ?? []) {
      peer.addTrack(track, this.localStream!);
    }

    peer.onicecandidate = (event) => {
      if (!event.candidate || !this.chatId || !this.targetUserId) {
        return;
      }

      this.emitSignal({
        chatId: this.chatId,
        targetUserId: this.targetUserId,
        data: {
          type: "ice-candidate",
          candidate: event.candidate.toJSON()
        }
      });
    };

    peer.ontrack = (event) => {
      if (!this.remoteAudioEl) {
        return;
      }

      const [remoteStream] = event.streams;
      if (remoteStream) {
        this.remoteAudioEl.srcObject = remoteStream;
        this.remoteAudioEl.autoplay = true;
        void this.remoteAudioEl.play().catch(() => undefined);
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
    const constraints: MediaTrackConstraints = {
      echoCancellation: this.settings.echoCancellation,
      noiseSuppression: this.settings.noiseSuppression,
      autoGainControl: this.settings.autoGainControl
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

    const nextSource = await navigator.mediaDevices.getUserMedia({
      audio: this.buildAudioConstraints(),
      video: false
    });
    const nextSendStream = this.settings.voiceEnhancement
      ? this.createEnhancedStream(nextSource)
      : nextSource;

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
    if (this.remoteAudioEl) {
      this.remoteAudioEl.muted = this.settings.soundDisabled;
      this.remoteAudioEl.volume = this.settings.speakerMode === "small" ? 0.35 : 1;
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

  private createEnhancedStream(input: MediaStream): MediaStream {
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
    const source = this.processorContext.createMediaStreamSource(input);
    const highpass = this.processorContext.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 120;
    const compressor = this.processorContext.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 24;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;
    this.processorDestination = this.processorContext.createMediaStreamDestination();
    source.connect(highpass);
    highpass.connect(compressor);
    compressor.connect(this.processorDestination);
    return this.processorDestination.stream;
  }

  private closeAudioProcessor() {
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
