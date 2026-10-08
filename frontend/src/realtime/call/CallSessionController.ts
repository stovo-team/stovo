import { Socket } from "socket.io-client";
import { getApiUrl } from "../../api/client";
import {
  defaultMediaEngineFactory,
  type MediaEngineFactory,
  type MeshMediaEnginePort,
  type SFUMediaEnginePort,
} from "./mediaEngineFactory";
import type { CallQualityBitrates } from "./callQuality";
// createCallSpeakingIndicator centralizes CALL_SPEAKING_THRESHOLD and CALL_SPEAKING_RELEASE_DELAY_MS.
import { createCallSpeakingIndicator, isCallSpeakingActive, type CallSpeakingState } from "../../features/chats/calling/callSpeakingIndicator";
import {
  CallCapabilities,
  CallDevice,
  CallSettings,
  CallTopology,
  DEFAULT_CALL_SETTINGS,
  RemoteMedia,
  shouldOfferToPeer,
} from "./types";
import {
  isNativeScreenCaptureAvailable,
  createNativeScreenCaptureStream,
  stopNativeScreenCapture,
} from "../../native/screenCapturePlugin";

export type { CallSettings, CallDevice, CallCapabilities, RemoteMedia, CallTopology };

/**
 * Multi-party call facade used by UI. Preserves the CallController surface used by ChatsPage
 * while routing media through MeshMediaEngine (1:1 / mesh) or LiveKitMediaEngine (SFU).
 */
export default class CallSessionController {
  private socket: Socket;
  private accessToken: string;

  private remoteAudioEl: HTMLAudioElement | null = null;
  private remoteVideoEl: HTMLVideoElement | null = null;
  private localVideoEl: HTMLVideoElement | null = null;
  /** Extra audio elements for multi-party remotes beyond the primary remoteAudioEl. */
  private extraAudioEls = new Map<string, HTMLAudioElement>();

  private mesh: MeshMediaEnginePort;
  private sfu: SFUMediaEnginePort;
  private sfuConnectPromise: Promise<void> | null = null;

  private localStream: MediaStream | null = null;
  private sourceStream: MediaStream | null = null;
  /** Dedicated display-media stream (simultaneous with camera). */
  private screenStream: MediaStream | null = null;
  /** First remote stream with video (1:1 UI compat). Prefers screen when present. */
  private remoteStream: MediaStream | null = null;
  private remoteMedia = new Map<string, RemoteMedia>();
  private remoteMicrophoneMuted = new Map<string, boolean>();

  chatId: string | null = null;
  roomId: string | null = null;
  localUserId: string | null = null;
  private targetUserId: string | null = null;
  topology: CallTopology = "mesh";
  private callType: "audio" | "video" = "audio";
  private settings: CallSettings = { ...DEFAULT_CALL_SETTINGS };

  private processorContext: AudioContext | null = null;
  private processorDestination: MediaStreamAudioDestinationNode | null = null;
  private tearingDown = false;
  private mediaConnected = false;
  private preconnectSignals: Array<{
    chatId: string;
    fromUserId: string;
    data: Record<string, unknown>;
  }> = [];
  private signalQueue: Promise<void> = Promise.resolve();
  private peerReady = false;

  private speakingCallback: ((isSpeaking: boolean) => void) | null = null;
  private localSpeakingCallback: ((isSpeaking: boolean) => void) | null = null;
  private peerSpeakingUserIdsCallback: ((userIds: string[]) => void) | null = null;
  private speakingAnimFrame: number | null = null;
  private speakingContext: AudioContext | null = null;
  private wasSpeaking = false;
  private wasLocalSpeaking = false;
  private localSpeakingAnalyser: AnalyserNode | null = null;
  private remoteAnalysers = new Map<string, AnalyserNode>();
  private localSpeakingIndicator: ReturnType<typeof createCallSpeakingIndicator> | null = null;
  private remoteSpeakingIndicators = new Map<string, ReturnType<typeof createCallSpeakingIndicator>>();

  onVideoUnavailable?: () => void;
  onConnectionReconnecting?: () => void;
  onConnectionEstablished?: () => void;
  onRemoteVideoTrack?: (stream: MediaStream) => void;
  onLocalStreamReady?: (stream: MediaStream) => void;
  onRemoteMediaChange?: (media: RemoteMedia[]) => void;
  onTopologyChange?: (topology: CallTopology) => void;
  /** Fired when local screen share ends (button stop or browser chrome stop). */
  onScreenShareEnded?: () => void;
  /** Fired when local screen stream starts or ends. */
  onLocalScreenStreamChange?: (stream: MediaStream | null) => void;

  constructor(
    socket: Socket,
    accessToken: string,
    mediaEngines: MediaEngineFactory = defaultMediaEngineFactory,
  ) {
    this.socket = socket;
    this.accessToken = accessToken;
    this.mesh = mediaEngines.createMesh(socket, accessToken);
    this.sfu = mediaEngines.createSFU();
    this.wireMeshCallbacks();
    this.wireSfuCallbacks();
  }

  updateAccessToken(accessToken: string) {
    this.accessToken = accessToken;
    this.mesh.updateAccessToken(accessToken);
  }

  setLocalUserId(id: string) {
    this.localUserId = id;
    this.mesh.setLocalUserId(id);
  }

  setRoomId(id: string) {
    if (this.roomId !== id) this.sfuConnectPromise = null;
    this.roomId = id;
    this.mesh.setRoomId(id);
  }

  setCallQualityBitrates(settings: CallQualityBitrates) {
    this.mesh.setVideoBitrates?.(settings);
    this.sfu.setVideoBitrates?.(settings);
  }

  setChatId(id: string) {
    this.chatId = id;
    this.mesh.setChatId(id);
  }

  setTopology(topology: CallTopology) {
    if (this.topology === topology) return;
    this.topology = topology;
    this.onTopologyChange?.(topology);
  }

  // ─── Element attachment ──────────────────────────────────────────────────────

  attachRemoteAudioElement(element: HTMLAudioElement | null) {
    this.remoteAudioEl = element;
    this.applySoundDisabledState();
    void this.applyOutputDevice().catch(() => undefined);
    this.syncRemoteAudioPlayback();
  }

  attachRemoteVideoElement(element: HTMLVideoElement | null) {
    this.remoteVideoEl = element;
    if (element) this.syncRemoteVideoToUI();
  }

  syncRemoteVideoToUI() {
    const primary = this.pickPrimaryVideoStream() ?? this.remoteStream;
    if (!primary) return;
    this.remoteStream = primary;
    const hasLiveVideo = primary.getVideoTracks().some(
      (track) => track.readyState !== "ended",
    );
    if (!hasLiveVideo) return;
    this.reattachRemoteVideo();
    this.onRemoteVideoTrack?.(primary);
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
    if (!callback && !this.localSpeakingCallback && !this.peerSpeakingUserIdsCallback) {
      this.stopSpeakingDetection();
    }
  }

  onLocalSpeakingChange(callback: ((isSpeaking: boolean) => void) | null) {
    this.localSpeakingCallback = callback;
    if (callback && this.sourceStream) {
      this.registerLocalAudioSpeaking(this.sourceStream);
    }
  }

  onPeerSpeakingUserIdsChange(callback: ((userIds: string[]) => void) | null) {
    this.peerSpeakingUserIdsCallback = callback;
  }

  getRemoteMedia(): RemoteMedia[] {
    return [...this.remoteMedia.values()];
  }

  // ─── Call lifecycle ──────────────────────────────────────────────────────────

  async prepareForCall(callType: "audio" | "video") {
    this.callType = callType;
    const hasVideo = this.hasLiveVideoTrack(this.sourceStream);
    if (this.sourceStream && (callType === "audio" || hasVideo)) return;
    await this.acquireLocalStream();
  }

  async startOutgoing(
    chatId: string,
    targetUserId: string,
    callType: "audio" | "video" = "audio",
  ) {
    this.chatId = chatId;
    this.targetUserId = targetUserId;
    this.callType = callType;
    this.mesh.setChatId(chatId);
    await this.ensureLocalMedia();
    if (this.tearingDown || !this.chatId) {
      throw new Error("Call peer connection failed to initialize");
    }
    // Caller always creates the offer on the 1:1 accept path. Mesh glare avoidance
    // for N-party is handled in syncMeshPeers via shouldOfferToPeer.
    await this.mesh.connectPeer(targetUserId, true);
    this.peerReady = true;
    this.broadcastMicrophoneState(targetUserId);
    await this.flushPreconnectSignals();
  }

  async acceptIncoming(
    chatId: string,
    targetUserId: string,
    callType: "audio" | "video" = "audio",
  ) {
    this.chatId = chatId;
    this.targetUserId = targetUserId;
    this.callType = callType;
    this.mesh.setChatId(chatId);
    await this.ensureLocalMedia();
    // Callee waits for the caller's offer on the classic 1:1 path.
    await this.mesh.connectPeer(targetUserId, false);
    this.peerReady = true;
    this.broadcastMicrophoneState(targetUserId);
    await this.flushPreconnectSignals();
  }

  async resumeSignaling(
    chatId: string,
    targetUserId: string,
    callType: "audio" | "video",
    asOfferer: boolean,
  ) {
    if (this.mediaConnected) return;
    this.chatId = chatId;
    this.targetUserId = targetUserId;
    this.callType = callType;
    this.mesh.setChatId(chatId);
    if (!this.mesh.hasPeer(targetUserId)) {
      if (asOfferer) await this.startOutgoing(chatId, targetUserId, callType);
      else await this.acceptIncoming(chatId, targetUserId, callType);
      return;
    }
    if (asOfferer) {
      await this.mesh.renegotiatePeer(targetUserId, { iceRestart: true });
    }
    this.broadcastMicrophoneState(targetUserId);
  }

  handleSignal(payload: {
    chatId: string;
    fromUserId: string;
    data: Record<string, unknown>;
  }): Promise<void> {
    if (!payload?.chatId || !payload?.data) return Promise.resolve();
    if (this.chatId && payload.chatId !== this.chatId) return Promise.resolve();
    if (this.topology === "sfu") return Promise.resolve();
    if (payload.data.type === "microphone-state") {
      if (typeof payload.data.muted !== "boolean" || !payload.fromUserId) return Promise.resolve();
      this.remoteMicrophoneMuted.set(payload.fromUserId, payload.data.muted);
      if (this.remoteMedia.has(payload.fromUserId)) {
        this.upsertRemoteMedia(payload.fromUserId, { isMuted: payload.data.muted });
      }
      return Promise.resolve();
    }

    if (!this.peerReady) {
      this.preconnectSignals.push(payload);
      return Promise.resolve();
    }

    this.signalQueue = this.signalQueue
      .then(() => this.mesh.handleSignal(payload))
      .catch((err) => {
        console.error("[call] processSignal failed:", err);
      });
    return this.signalQueue;
  }

  /**
   * Ensure mesh connections for all remote participants; disconnect removed peers.
   */
	async syncMeshPeers(participantUserIds: string[]): Promise<void> {
    if (this.topology !== "mesh") return;
    if (this.chatId) this.mesh.setChatId(this.chatId);
    if (this.roomId) this.mesh.setRoomId(this.roomId);
    const localId = this.localUserId;
    const remotes = new Set(
      participantUserIds.filter((id) => id && id !== localId),
    );

    const existingPeerIds = this.mesh.getPeerIds();
    const trackedRemoteIds = new Set([...existingPeerIds, ...this.remoteMicrophoneMuted.keys(), ...this.remoteMedia.keys()]);
    for (const id of trackedRemoteIds) {
      if (!remotes.has(id)) {
        if (existingPeerIds.includes(id)) this.mesh.disconnectPeer(id);
        this.remoteMicrophoneMuted.delete(id);
        if (this.remoteMedia.delete(id)) this.notifyRemoteMediaChange();
        this.unregisterRemoteAudioSpeaking(id);
      }
    }

    await this.ensureLocalMedia();
    this.peerReady = true;
    if (this.localStream) {
      this.markMediaConnected();
    }

    for (const remoteId of remotes) {
      const asOfferer = localId ? shouldOfferToPeer(localId, remoteId) : false;
      await this.mesh.connectPeer(remoteId, asOfferer);
      this.broadcastMicrophoneState(remoteId);
    }
    await this.flushPreconnectSignals();
  }

  // Reuse the successful join until the room disconnects, including participant updates.
  async switchToSfu(): Promise<void> {
    if (this.sfuConnectPromise) return this.sfuConnectPromise;
    const connection = this.connectToSfu();
    this.sfuConnectPromise = connection;
    try {
      await connection;
    } catch (error) {
      if (this.sfuConnectPromise === connection) this.sfuConnectPromise = null;
      throw error;
    }
  }

  private async connectToSfu(): Promise<void> {
    if (!this.roomId) throw new Error("roomId required for SFU");
    const res = await fetch(`${getApiUrl()}/api/calls/${this.roomId}/sfu-token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
      credentials: "include",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(detail || `SFU token request failed (${res.status})`);
    }
    const payload = (await res.json()) as { url?: string; token?: string };
    if (!payload.url || !payload.token) {
      throw new Error("SFU token response missing url/token");
    }

    this.mesh.stopAll();
    this.peerReady = false;
    this.clearExtraAudio();

    await this.sfu.connect({ url: payload.url, token: payload.token });
    if (this.localStream) {
      await this.sfu.publishLocalStream(this.localStream);
      this.sfu.setMicMuted(this.settings.micMuted);
      this.sfu.setCameraEnabled(this.settings.cameraEnabled);
    }
    const screenTrack = this.screenStream?.getVideoTracks().find((t) => t.readyState !== "ended");
    if (screenTrack) {
      await this.sfu.publishScreenShare(screenTrack);
    }
    this.setTopology("sfu");
    this.markMediaConnected();
  }

  inviteUsers(userIds: string[]) {
    if (!this.chatId || !userIds.length) return;
    this.socket.emit("call:invite", {
      chatId: this.chatId,
      roomId: this.roomId ?? undefined,
      inviteUserIds: userIds,
    });
  }

  leaveCall() {
    if (!this.chatId) return;
    this.socket.emit("call:leave", {
      chatId: this.chatId,
      roomId: this.roomId ?? undefined,
    });
  }

  // ─── Video toggle mid-call ───────────────────────────────────────────────────

  async toggleVideo(enable: boolean): Promise<void> {
    if (enable && !this.peerReady && this.topology === "mesh") {
      this.callType = "video";
      await this.acquireLocalStream();
      return;
    }

    if (enable) {
      let videoTrack: MediaStreamTrack | null = null;
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: this.buildVideoConstraints(),
        });
        videoTrack = s.getVideoTracks()[0] ?? null;
      } catch (err) {
        const name = (err as DOMException)?.name ?? "";
        if (
          name === "NotAllowedError" ||
          name === "NotFoundError" ||
          name === "PermissionDeniedError" ||
          name === "OverconstrainedError"
        ) {
          try {
            const s = await navigator.mediaDevices.getUserMedia({
              video:
                name === "OverconstrainedError"
                  ? { facingMode: this.settings.cameraFacingMode ?? "user" }
                  : true,
            });
            videoTrack = s.getVideoTracks()[0] ?? null;
          } catch {
            this.onVideoUnavailable?.();
            return;
          }
        } else {
          this.onVideoUnavailable?.();
          return;
        }
      }
      if (!videoTrack) {
        this.onVideoUnavailable?.();
        return;
      }

      this.sourceStream?.addTrack(videoTrack);
      if (this.sourceStream !== this.localStream) this.localStream?.addTrack(videoTrack);

      if (this.localVideoEl) {
        this.localVideoEl.srcObject = this.sourceStream;
        void this.localVideoEl.play().catch(() => undefined);
      }
      this.notifyLocalStreamReady();
      this.callType = "video";

      if (this.topology === "sfu") {
        if (this.localStream) await this.sfu.publishLocalStream(this.localStream);
        this.sfu.setCameraEnabled(true);
      } else {
        this.mesh.setLocalStream(this.localStream);
        await this.mesh.republishLocalTracks();
        await this.mesh.renegotiateAll();
      }
    } else {
      for (const t of this.sourceStream?.getVideoTracks() ?? []) t.stop();
      if (this.localStream !== this.sourceStream) {
        for (const t of this.localStream?.getVideoTracks() ?? []) t.stop();
      }
      if (this.localVideoEl) this.localVideoEl.srcObject = null;
      this.callType = "audio";

      if (this.topology === "sfu") {
        this.sfu.setCameraEnabled(false);
        if (this.localStream) await this.sfu.publishLocalStream(this.localStream);
      } else {
        this.mesh.setLocalStream(this.localStream);
        await this.mesh.republishLocalTracks();
        await this.mesh.renegotiateAll();
      }
    }
  }

  async toggleScreenShare(enable: boolean): Promise<void> {
    if (!enable) {
      await this.stopScreenShare(true);
      return;
    }

    let display: MediaStream;
    if (isNativeScreenCaptureAvailable()) {
      display = await createNativeScreenCaptureStream();
    } else {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
        throw new Error("Screen sharing is not supported in this browser");
      }

      try {
        display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      } catch (err) {
        const name = (err as DOMException)?.name ?? "";
        if (
          name === "NotAllowedError" ||
          name === "PermissionDeniedError" ||
          name === "NotFoundError" ||
          name === "AbortError"
        ) {
          throw err;
        }
        throw err;
      }
    }

    const track = display.getVideoTracks()[0];
    if (!track) {
      this.stopStream(display);
      throw new Error("No screen video track available");
    }

    try {
      track.contentHint = "detail";
    } catch {
      /* ignore unsupported contentHint */
    }

    // Stop any previous share without notifying (we're replacing).
    await this.stopScreenShare(false);

    this.screenStream = display;
    this.settings = { ...this.settings, screenSharing: true };
    this.onLocalScreenStreamChange?.(display);
    track.onended = () => {
      void this.stopScreenShare(true);
    };

    if (this.topology === "sfu") {
      await this.sfu.publishScreenShare(track);
    } else {
      await this.mesh.setScreenTrack(track, display);
    }
  }

  // ─── Settings ────────────────────────────────────────────────────────────────

  getSettings(): CallSettings {
    return { ...this.settings };
  }

  getCapabilities(): CallCapabilities {
    const has = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices);
    return {
      canSelectInputDevice: has,
      canSelectOutputDevice: this.supportsSinkId(),
      canUseNoiseSuppression: has,
      canUseEchoCancellation: has,
      canUseAutoGainControl: has,
      canUseVoiceEnhancement: typeof window !== "undefined" && ("AudioContext" in window || "webkitAudioContext" in window),
      canUseCamera: has,
      canShareScreen: isNativeScreenCaptureAvailable() || (has && typeof navigator.mediaDevices?.getDisplayMedia === "function"),
    };
  }

  async getAvailableDevices(): Promise<CallDevice[]> {
    return this.listDevices();
  }

  async listDevices(): Promise<CallDevice[]> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return [];
    }
    const list = await navigator.mediaDevices.enumerateDevices();
    return list
      .filter((d) => ["audioinput", "audiooutput", "videoinput"].includes(d.kind))
      .map((d) => ({
        deviceId: d.deviceId,
        kind: d.kind as CallDevice["kind"],
        label:
          d.label ||
          (d.kind === "audioinput"
            ? "Microphone"
            : d.kind === "audiooutput"
              ? "Speaker"
              : "Camera"),
      }));
  }

  async applySettings(patch: Partial<CallSettings>) {
    const previous = this.settings;
    this.settings = { ...this.settings, ...patch };

    if (patch.micMuted !== undefined) this.applyMicMutedState();
    if (patch.cameraEnabled !== undefined) this.applyCameraEnabledState();
    if (patch.soundDisabled !== undefined || patch.speakerMode !== undefined || patch.outputVolume !== undefined) {
      this.applySoundDisabledState();
      if (patch.speakerMode === "large" && !this.settings.outputDeviceId) {
        void this.applyOutputDevice();
      }
    }

    const needsReacquire =
      patch.inputDeviceId !== undefined ||
      patch.inputGain !== undefined ||
      patch.videoDeviceId !== undefined ||
      patch.cameraFacingMode !== undefined ||
      patch.echoCancellation !== undefined ||
      patch.noiseSuppression !== undefined ||
      patch.autoGainControl !== undefined ||
      patch.voiceEnhancement !== undefined;

    if (needsReacquire && (this.peerReady || this.topology === "sfu")) {
      // Blank local preview immediately so facing/mirror CSS can change during
      // the black gap instead of visibly un-mirroring the old camera frame.
      if (patch.cameraFacingMode !== undefined && this.localVideoEl) {
        this.localVideoEl.srcObject = null;
      }
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

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  async cleanup(serverAlreadyNotified = false) {
    if (this.tearingDown) return;
    this.tearingDown = true;
    this.mediaConnected = false;
    this.peerReady = false;

    const endingChatId = this.chatId;

    this.mesh.stopAll();
    this.sfuConnectPromise = null;
    await this.sfu.disconnect();

    if (!serverAlreadyNotified && endingChatId && this.socket.connected) {
      this.socket.emit("call:end", { chatId: endingChatId });
    }

    this.stopStream(this.localStream);
    if (this.localStream !== this.sourceStream) this.stopStream(this.sourceStream);
    this.stopStream(this.screenStream);
    this.localStream = null;
    this.sourceStream = null;
    this.screenStream = null;
    this.onLocalScreenStreamChange?.(null);
    this.remoteStream = null;
    this.remoteMedia.clear();
    this.remoteMicrophoneMuted.clear();
    this.onRemoteMediaChange?.([]);

    if (this.remoteAudioEl) {
      this.remoteAudioEl.srcObject = null;
      this.remoteAudioEl.muted = false;
    }
    if (this.remoteVideoEl) this.remoteVideoEl.srcObject = null;
    if (this.localVideoEl) this.localVideoEl.srcObject = null;
    this.clearExtraAudio();
    this.closeAudioProcessor();
    this.stopSpeakingDetection();
    this.speakingCallback = null;

    this.settings = { ...DEFAULT_CALL_SETTINGS };
    this.chatId = null;
    this.roomId = null;
    this.targetUserId = null;
    this.callType = "audio";
    this.topology = "mesh";
    this.preconnectSignals = [];
    this.signalQueue = Promise.resolve();
    this.mesh.setChatId(null);
    this.mesh.setRoomId(null);
    this.tearingDown = false;
  }

  // ─── Private: wiring ─────────────────────────────────────────────────────────

  private wireMeshCallbacks() {
    this.mesh.onRemoteStream = (userId, stream) => {
      this.upsertRemoteMedia(userId, { stream });
      this.syncRemoteAudioPlayback();
      this.refreshPrimaryRemoteVideo();
      if (stream.getAudioTracks().length > 0) {
        this.registerRemoteAudioSpeaking(userId, stream);
      }
    };
    this.mesh.onRemoteScreenStream = (userId, screenStream) => {
      this.upsertRemoteMedia(userId, { screenStream });
      this.refreshPrimaryRemoteVideo();
    };
    this.mesh.onRemoteStreamRemoved = (userId) => {
      this.remoteMedia.delete(userId);
      this.removeExtraAudio(userId);
      this.unregisterRemoteAudioSpeaking(userId);
      this.notifyRemoteMediaChange();
      this.refreshPrimaryRemoteVideo();
    };
    this.mesh.onIceConnected = () => this.markMediaConnected();
    this.mesh.onConnectionState = (_userId, state) => {
      if (state === "connected") this.markMediaConnected();
      else if (state === "disconnected" || state === "failed") {
        this.onConnectionReconnecting?.();
      }
    };
  }

  private wireSfuCallbacks() {
    this.sfu.onRemoteStream = (userId, stream) => {
      this.upsertRemoteMedia(userId, { stream });
      this.syncRemoteAudioPlayback();
      this.refreshPrimaryRemoteVideo();
    };
    this.sfu.onRemoteScreenStream = (userId, screenStream) => {
      this.upsertRemoteMedia(userId, { screenStream });
      this.refreshPrimaryRemoteVideo();
    };
    this.sfu.onRemoteStreamRemoved = (userId) => {
      this.remoteMedia.delete(userId);
      this.removeExtraAudio(userId);
      this.notifyRemoteMediaChange();
      this.refreshPrimaryRemoteVideo();
    };
    this.sfu.onRemoteMicrophoneMuteChange = (userId, muted) => {
      this.remoteMicrophoneMuted.set(userId, muted);
      if (this.remoteMedia.has(userId)) this.upsertRemoteMedia(userId, { isMuted: muted });
    };
    this.sfu.onRemoteParticipantDisconnected = (userId) => {
      this.remoteMicrophoneMuted.delete(userId);
      this.remoteMedia.delete(userId);
      this.removeExtraAudio(userId);
      this.unregisterRemoteAudioSpeaking(userId);
      this.notifyRemoteMediaChange();
      this.refreshPrimaryRemoteVideo();
    };
    this.sfu.onConnected = () => this.markMediaConnected();
    this.sfu.onDisconnected = () => {
      this.sfuConnectPromise = null;
      this.remoteMicrophoneMuted.clear();
      this.remoteMedia.clear();
      this.notifyRemoteMediaChange();
      this.onConnectionReconnecting?.();
    };
  }

  private upsertRemoteMedia(
    userId: string,
    patch: { stream?: MediaStream; screenStream?: MediaStream | null; isMuted?: boolean },
  ) {
    const prev = this.remoteMedia.get(userId);
    const stream = patch.stream ?? prev?.stream ?? new MediaStream();
    const screenStream =
      patch.screenStream !== undefined ? patch.screenStream : (prev?.screenStream ?? null);
    const liveScreen =
      screenStream?.getVideoTracks().some((t) => t.readyState !== "ended") ?? false;
    this.remoteMedia.set(userId, {
      userId,
      stream,
      screenStream: liveScreen ? screenStream : null,
      hasVideo: stream.getVideoTracks().some((t) => t.readyState !== "ended"),
      hasAudio: stream.getAudioTracks().length > 0,
      hasScreenShare: liveScreen,
      isMuted: patch.isMuted ?? this.remoteMicrophoneMuted.get(userId) ?? prev?.isMuted ?? false,
    });
    this.notifyRemoteMediaChange();
  }

  private notifyRemoteMediaChange() {
    this.onRemoteMediaChange?.(this.getRemoteMedia());
  }

  private refreshPrimaryRemoteVideo() {
    this.remoteStream = this.pickPrimaryVideoStream();
    if (this.remoteStream) {
      this.syncRemoteVideoToUI();
    } else if (this.remoteVideoEl) {
      this.remoteVideoEl.srcObject = null;
    }
  }

  private pickPrimaryVideoStream(): MediaStream | null {
    for (const m of this.remoteMedia.values()) {
      if (m.hasScreenShare && m.screenStream) return m.screenStream;
    }
    for (const m of this.remoteMedia.values()) {
      if (m.hasVideo) return m.stream;
    }
    const first = this.remoteMedia.values().next().value as RemoteMedia | undefined;
    return first?.stream ?? null;
  }

  private async stopScreenShare(notifyUi: boolean): Promise<void> {
    const wasSharing = Boolean(this.screenStream) || this.settings.screenSharing;
    // Starting native capture creates a stream before this method clears a
    // previous share. Do not stop that fresh capture when no share was active,
    // otherwise we publish an ended track and remotes only see a grey tile.
    if (wasSharing && isNativeScreenCaptureAvailable()) {
      void stopNativeScreenCapture().catch(() => undefined);
    }
    if (this.topology === "sfu") {
      await this.sfu.unpublishScreenShare();
    } else {
      await this.mesh.clearScreenTrack();
    }
    this.stopStream(this.screenStream);
    this.screenStream = null;
    this.settings = { ...this.settings, screenSharing: false };
    this.onLocalScreenStreamChange?.(null);
    if (wasSharing && notifyUi) {
      this.onScreenShareEnded?.();
    }
  }

  getLocalScreenStream(): MediaStream | null {
    return this.screenStream;
  }

  /**
   * Returns the active call media stream so features such as AI notes can
   * record the microphone already acquired for an audio-only call.
   */
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  private markMediaConnected() {
    if (this.mediaConnected) return;
    this.mediaConnected = true;
    this.syncRemoteVideoToUI();
    this.onConnectionEstablished?.();
  }

  private async ensureLocalMedia() {
    await this.acquireLocalStream();
    if (this.localStream) this.mesh.setLocalStream(this.localStream);
  }

  private async flushPreconnectSignals() {
    const buffered = this.preconnectSignals.splice(0);
    for (const sig of buffered) {
      this.signalQueue = this.signalQueue
        .then(() => this.mesh.handleSignal(sig))
        .catch(() => undefined);
    }
    await this.signalQueue;
  }

  // ─── Private: streams / settings helpers ─────────────────────────────────────

  private hasLiveVideoTrack(stream: MediaStream | null): boolean {
    return stream?.getVideoTracks().some((t) => t.readyState !== "ended") ?? false;
  }

  private notifyLocalStreamReady() {
    if (this.sourceStream && this.hasLiveVideoTrack(this.sourceStream)) {
      this.onLocalStreamReady?.(this.sourceStream);
    }
  }

  private async acquireLocalStream() {
    if (this.sourceStream && !this.peerReady && this.topology === "mesh") {
      const needsVideo = this.callType === "video";
      if (!needsVideo || this.hasLiveVideoTrack(this.sourceStream)) {
        if (this.localVideoEl && this.callType === "video") {
          this.localVideoEl.srcObject = this.sourceStream;
          void this.localVideoEl.play().catch(() => undefined);
        }
        this.notifyLocalStreamReady();
        this.applyMicMutedState();
        this.applyCameraEnabledState();
        if (this.localStream) this.mesh.setLocalStream(this.localStream);
        return;
      }
      this.stopStream(this.localStream);
      if (this.localStream !== this.sourceStream) this.stopStream(this.sourceStream);
      this.localStream = null;
      this.sourceStream = null;
    }

    const isVideo = this.callType === "video";
    let nextSource: MediaStream;

    if (isVideo) {
      try {
        nextSource = await this.acquireVideoStream();
      } catch (err) {
        const isMediaErr =
          err instanceof DOMException &&
          [
            "NotFoundError",
            "NotAllowedError",
            "DevicesNotFoundError",
            "OverconstrainedError",
            "NotReadableError",
          ].includes(err.name);
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

    let nextSend: MediaStream;
    if (this.settings.voiceEnhancement || this.settings.inputGain !== 100) {
      nextSend = this.createEnhancedStream(nextSource);
    } else {
      this.closeAudioProcessor();
      nextSend = nextSource;
    }

    this.stopStream(this.localStream);
    if (this.localStream !== this.sourceStream) this.stopStream(this.sourceStream);
    this.localStream = nextSend;
    this.sourceStream = nextSource;

    if (this.localVideoEl && this.callType === "video") {
      this.localVideoEl.srcObject = nextSource;
      void this.localVideoEl.play().catch(() => undefined);
    }

    this.notifyLocalStreamReady();
    this.applyMicMutedState();
    this.applyCameraEnabledState();
    this.registerLocalAudioSpeaking(nextSource);

    if (this.topology === "sfu") {
      await this.sfu.publishLocalStream(nextSend);
      this.sfu.setMicMuted(this.settings.micMuted);
      this.sfu.setCameraEnabled(this.settings.cameraEnabled);
    } else {
      this.mesh.setLocalStream(nextSend);
      if (this.peerReady) {
        await this.mesh.republishLocalTracks();
      }
    }
  }

  private async acquireVideoStream(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: this.buildAudioConstraints(),
        video: this.buildVideoConstraints(),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "OverconstrainedError") {
        return navigator.mediaDevices.getUserMedia({
          audio: this.buildAudioConstraints(),
          video: { facingMode: this.settings.cameraFacingMode ?? "user" },
        });
      }
      throw err;
    }
  }

  private reattachRemoteVideo() {
    if (!this.remoteVideoEl || !this.remoteStream) return;
    this.remoteVideoEl.srcObject = this.remoteStream;
    this.remoteVideoEl.muted = true;
    this.remoteVideoEl.autoplay = true;
    void this.remoteVideoEl.play().catch(() => undefined);
  }

  private syncRemoteAudioPlayback() {
    const entries = [...this.remoteMedia.entries()].filter(([, m]) => m.hasAudio);
    if (entries.length === 0) return;

    const [firstId, first] = entries[0];
    if (this.remoteAudioEl) {
      this.remoteAudioEl.srcObject = first.stream;
      this.remoteAudioEl.autoplay = true;
      void this.remoteAudioEl.play().catch(() => undefined);
    }

    for (const [userId, media] of entries) {
      this.registerRemoteAudioSpeaking(userId, media.stream);
    }

    for (const [userId, media] of entries.slice(1)) {
      let el = this.extraAudioEls.get(userId);
      if (!el) {
        el = document.createElement("audio");
        el.autoplay = true;
        el.style.display = "none";
        document.body.appendChild(el);
        this.extraAudioEls.set(userId, el);
      }
      if (el.srcObject !== media.stream) {
        el.srcObject = media.stream;
        void el.play().catch(() => undefined);
      }
      el.muted = this.settings.soundDisabled;
      el.volume = this.getOutputVolume();
    }

    // Drop extras for peers no longer present (except first which uses remoteAudioEl).
    for (const id of [...this.extraAudioEls.keys()]) {
      if (id === firstId) continue;
      if (!entries.some(([uid]) => uid === id)) this.removeExtraAudio(id);
    }

    this.applySoundDisabledState();
  }

  private removeExtraAudio(userId: string) {
    const el = this.extraAudioEls.get(userId);
    if (!el) return;
    el.srcObject = null;
    el.remove();
    this.extraAudioEls.delete(userId);
  }

  private clearExtraAudio() {
    for (const id of [...this.extraAudioEls.keys()]) this.removeExtraAudio(id);
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
      c.deviceId = { ideal: this.settings.videoDeviceId };
    } else {
      c.facingMode = this.settings.cameraFacingMode ?? "user";
    }
    return c;
  }

  private applyMicMutedState() {
    const on = !this.settings.micMuted;
    for (const t of this.localStream?.getAudioTracks() ?? []) t.enabled = on;
    if (this.topology === "sfu") this.sfu.setMicMuted(this.settings.micMuted);
    else this.broadcastMicrophoneState();
    if (this.settings.micMuted && this.wasLocalSpeaking) {
      this.wasLocalSpeaking = false;
      this.localSpeakingCallback?.(false);
    }
  }

  private broadcastMicrophoneState(targetUserId?: string) {
    if (this.tearingDown || !this.chatId || this.topology !== "mesh") return;
    const targets = targetUserId ? [targetUserId] : this.mesh.getPeerIds();
    for (const userId of targets) {
      if (!userId || userId === this.localUserId) continue;
      this.socket.emit("call:signal", {
        chatId: this.chatId,
        roomId: this.roomId ?? undefined,
        targetUserId: userId,
        data: { type: "microphone-state", muted: this.settings.micMuted },
      });
    }
  }

  private applyCameraEnabledState() {
    const on = this.settings.cameraEnabled;
    for (const t of this.localStream?.getVideoTracks() ?? []) t.enabled = on;
    if (this.topology === "sfu") this.sfu.setCameraEnabled(on);
  }

  private applySoundDisabledState() {
    if (this.remoteAudioEl) {
      this.remoteAudioEl.muted = this.settings.soundDisabled;
      this.remoteAudioEl.volume = this.getOutputVolume();
    }
    for (const el of this.extraAudioEls.values()) {
      el.muted = this.settings.soundDisabled;
      el.volume = this.getOutputVolume();
    }
  }

  private getOutputVolume() {
    return Math.max(0, Math.min(1, this.settings.outputVolume / 100)) * (this.settings.speakerMode === "small" ? 0.35 : 1);
  }

  private supportsSinkId() {
    if (!this.remoteAudioEl) return false;
    return (
      typeof (this.remoteAudioEl as HTMLAudioElement & { setSinkId?: unknown }).setSinkId ===
      "function"
    );
  }

  private async applyOutputDevice() {
    if (!this.settings.outputDeviceId) return;
    const apply = async (el: HTMLAudioElement | null) => {
      if (!el) return;
      if (typeof (el as HTMLAudioElement & { setSinkId?: unknown }).setSinkId !== "function") {
        return;
      }
      await (el as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(
        this.settings.outputDeviceId,
      );
    };
    await apply(this.remoteAudioEl);
    for (const el of this.extraAudioEls.values()) await apply(el);
  }

  private getOrCreateSpeakingContext(): AudioContext | null {
    if (this.speakingContext && this.speakingContext.state !== "closed") {
      return this.speakingContext;
    }
    const AudioCtor =
      typeof window === "undefined"
        ? null
        : window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;
    try {
      this.speakingContext = new AudioCtor();
      return this.speakingContext;
    } catch {
      return null;
    }
  }

  private registerLocalAudioSpeaking(stream: MediaStream) {
    this.localSpeakingIndicator?.dispose();
    this.localSpeakingIndicator = createCallSpeakingIndicator((state: CallSpeakingState) => {
      const isSpeaking = isCallSpeakingActive(state);
      if (isSpeaking !== this.wasLocalSpeaking) {
        this.wasLocalSpeaking = isSpeaking;
        this.localSpeakingCallback?.(isSpeaking);
      }
    });
    if (stream.getAudioTracks().length === 0) {
      this.localSpeakingAnalyser = null;
      return;
    }
    const ctx = this.getOrCreateSpeakingContext();
    if (!ctx) return;
    try {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      this.localSpeakingAnalyser = analyser;
      this.ensureSpeakingPolling();
    } catch {
      // Ignored
    }
  }

  private registerRemoteAudioSpeaking(userId: string, stream: MediaStream) {
    this.remoteSpeakingIndicators.get(userId)?.dispose();
    this.remoteSpeakingIndicators.set(userId, createCallSpeakingIndicator(() => undefined));
    if (stream.getAudioTracks().length === 0) return;
    const ctx = this.getOrCreateSpeakingContext();
    if (!ctx) return;
    try {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      this.remoteAnalysers.set(userId, analyser);
      this.ensureSpeakingPolling();
    } catch {
      // Ignored
    }
  }

  private unregisterRemoteAudioSpeaking(userId: string) {
    this.remoteAnalysers.delete(userId);
    this.remoteSpeakingIndicators.get(userId)?.dispose();
    this.remoteSpeakingIndicators.delete(userId);
  }

  private ensureSpeakingPolling() {
    if (this.speakingAnimFrame !== null) return;
    const data = new Uint8Array(128);

    const poll = (now: number) => {
      // 1. Local speaking
      if (this.localSpeakingAnalyser && !this.settings.micMuted) {
        this.localSpeakingAnalyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        this.localSpeakingIndicator?.update({ microphoneEnabled: true, level: avg, threshold: this.settings.speakingSensitivity });
      } else {
        this.localSpeakingIndicator?.update({ microphoneEnabled: false, level: 0 });
      }

      // 2. Remote peer speaking
      const activeSpeakingUserIds: string[] = [];
      for (const [uid, analyser] of this.remoteAnalysers.entries()) {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        const indicator = this.remoteSpeakingIndicators.get(uid);
        indicator?.update({ microphoneEnabled: true, level: avg, threshold: this.settings.speakingSensitivity });
        if (indicator && isCallSpeakingActive(indicator.state)) activeSpeakingUserIds.push(uid);
      }

      const anySpeaking = activeSpeakingUserIds.length > 0;
      if (anySpeaking !== this.wasSpeaking) {
        this.wasSpeaking = anySpeaking;
        this.speakingCallback?.(anySpeaking);
      }
      this.peerSpeakingUserIdsCallback?.(activeSpeakingUserIds);

      this.speakingAnimFrame = requestAnimationFrame(poll);
    };

    this.speakingAnimFrame = requestAnimationFrame(poll);
  }

  private stopSpeakingDetection() {
    if (this.speakingAnimFrame !== null) {
      cancelAnimationFrame(this.speakingAnimFrame);
      this.speakingAnimFrame = null;
    }
    this.localSpeakingAnalyser = null;
    this.remoteAnalysers.clear();
    this.localSpeakingIndicator?.dispose();
    this.localSpeakingIndicator = null;
    for (const indicator of this.remoteSpeakingIndicators.values()) indicator.dispose();
    this.remoteSpeakingIndicators.clear();
    if (this.speakingContext) {
      void this.speakingContext.close().catch(() => undefined);
      this.speakingContext = null;
    }
    this.wasSpeaking = false;
    this.wasLocalSpeaking = false;
    this.localSpeakingCallback?.(false);
    this.speakingCallback?.(false);
    this.peerSpeakingUserIdsCallback?.([]);
  }

  private createEnhancedStream(input: MediaStream): MediaStream {
    const AudioCtor =
      typeof window === "undefined"
        ? null
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((window as any).AudioContext ??
            (window as any).webkitAudioContext) as (new () => AudioContext) | null | undefined;
    if (!AudioCtor) return input;
    this.closeAudioProcessor();
    this.processorContext = new AudioCtor();
    if (this.processorContext.state === "suspended") {
      void this.processorContext.resume().catch(() => undefined);
    }
    const src = this.processorContext.createMediaStreamSource(input);
    const gain = this.processorContext.createGain();
    gain.gain.value = this.settings.inputGain / 100;
    this.processorDestination = this.processorContext.createMediaStreamDestination();
    src.connect(gain);
    if (this.settings.voiceEnhancement) {
      const hp = this.processorContext.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = this.settings.voiceEnhancementHighpass;
      const comp = this.processorContext.createDynamicsCompressor();
      comp.threshold.value = this.settings.voiceEnhancementThreshold;
      comp.knee.value = 24;
      comp.ratio.value = 3;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      gain.connect(hp);
      hp.connect(comp);
      comp.connect(this.processorDestination);
    } else {
      gain.connect(this.processorDestination);
    }
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
