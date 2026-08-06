import { Socket } from "socket.io-client";
import { getApiUrl } from "../../api/client";

type SignalData = Record<string, unknown>;

type SignalPayload = {
  chatId: string;
  fromUserId: string;
  data: SignalData;
};

type PeerState = {
  pc: RTCPeerConnection;
  pendingCandidates: RTCIceCandidateInit[];
  signalQueue: Promise<void>;
  remoteStream: MediaStream | null;
  screenStream: MediaStream | null;
  expectedScreenStreamId: string | null;
  screenSender: RTCRtpSender | null;
};

/**
 * Full-mesh WebRTC engine: one RTCPeerConnection per remote peerUserId.
 */
export default class MeshMediaEngine {
  private socket: Socket;
  private accessToken: string;
  private chatId: string | null = null;
  private roomId: string | null = null;
  private localUserId: string | null = null;
  private localStream: MediaStream | null = null;
  private localScreenStream: MediaStream | null = null;
  private localScreenTrack: MediaStreamTrack | null = null;
  private peers = new Map<string, PeerState>();
  private iceServersCache: RTCIceServer[] | null = null;
  private globalSignalQueue: Promise<void> = Promise.resolve();
  private tearingDown = false;

  onRemoteStream?: (userId: string, stream: MediaStream) => void;
  onRemoteScreenStream?: (userId: string, stream: MediaStream | null) => void;
  onRemoteStreamRemoved?: (userId: string) => void;
  onConnectionState?: (userId: string, state: RTCPeerConnectionState) => void;
  onIceConnected?: () => void;

  constructor(socket: Socket, accessToken: string) {
    this.socket = socket;
    this.accessToken = accessToken;
  }

  updateAccessToken(accessToken: string) {
    this.accessToken = accessToken;
  }

  setChatId(chatId: string | null) {
    this.chatId = chatId;
  }

  setRoomId(roomId: string | null) {
    this.roomId = roomId;
  }

  setLocalUserId(userId: string | null) {
    this.localUserId = userId;
  }

  setLocalStream(stream: MediaStream | null) {
    const previous = this.localStream;
    this.localStream = stream;
    if (!stream) return;

    for (const [peerId, state] of this.peers) {
      void this.replaceTracksOnPeer(state.pc, stream, state).catch((err) => {
        console.error("[mesh] replaceTracks failed for", peerId, err);
      });
    }

    // Keep previous stream ownership with the caller; mesh only publishes tracks.
    void previous;
  }

  async setScreenTrack(track: MediaStreamTrack, stream: MediaStream): Promise<void> {
    this.localScreenTrack = track;
    this.localScreenStream = stream;
    // Announce stream id before renegotiation so remotes can classify ontrack.
    this.broadcastScreenShareSignal(true, stream.id);
    for (const [userId, state] of this.peers) {
      await this.applyScreenTrackToPeer(userId, state);
    }
    await this.renegotiateAll();
  }

  async clearScreenTrack(): Promise<void> {
    const hadScreen = Boolean(this.localScreenTrack) || [...this.peers.values()].some((p) => p.screenSender);
    for (const [userId, state] of this.peers) {
      await this.removeScreenTrackFromPeer(userId, state);
    }
    this.localScreenTrack = null;
    this.localScreenStream = null;
    if (hadScreen) {
      this.broadcastScreenShareSignal(false, null);
      await this.renegotiateAll();
    }
  }

  broadcastScreenShareSignal(active: boolean, streamId: string | null) {
    for (const peerId of this.peers.keys()) {
      this.emitSignal(peerId, {
        type: "screen-share",
        active,
        streamId: streamId ?? undefined,
      });
    }
  }

  getRemoteStreams(): Map<string, MediaStream> {
    const out = new Map<string, MediaStream>();
    for (const [userId, state] of this.peers) {
      if (state.remoteStream) out.set(userId, state.remoteStream);
    }
    return out;
  }

  async connectPeer(userId: string, asOfferer: boolean): Promise<void> {
    if (!userId || userId === this.localUserId) return;
    if (this.peers.has(userId)) {
      if (asOfferer) {
        const state = this.peers.get(userId)!;
        await this.enqueuePeer(userId, () => this.createAndSendOffer(userId, state));
      }
      return;
    }

    const pc = await this.createPeerConnection(userId);
    const state: PeerState = {
      pc,
      pendingCandidates: [],
      signalQueue: Promise.resolve(),
      remoteStream: null,
      screenStream: null,
      expectedScreenStreamId: null,
      screenSender: null,
    };
    this.peers.set(userId, state);

    if (this.localScreenTrack && this.localScreenStream) {
      await this.applyScreenTrackToPeer(userId, state);
    }

    if (asOfferer) {
      await this.enqueuePeer(userId, () => this.createAndSendOffer(userId, state));
    }

    if (this.localScreenTrack && this.localScreenStream) {
      this.emitSignal(userId, {
        type: "screen-share",
        active: true,
        streamId: this.localScreenStream.id,
      });
    }
  }

  handleSignal(payload: SignalPayload): Promise<void> {
    if (!payload?.chatId || !payload?.data || !payload.fromUserId) {
      return Promise.resolve();
    }
    if (this.chatId && payload.chatId !== this.chatId) return Promise.resolve();
    if (this.tearingDown) return Promise.resolve();

    const peerId = payload.fromUserId;
    this.globalSignalQueue = this.globalSignalQueue
      .then(async () => {
        if (!this.peers.has(peerId)) {
          await this.connectPeer(peerId, false);
        }
        const state = this.peers.get(peerId);
        if (!state) return;
        await this.enqueuePeer(peerId, () => this.processSignal(peerId, state, payload));
      })
      .catch((err) => {
        console.error("[mesh] handleSignal failed:", err);
      });
    return this.globalSignalQueue;
  }

  disconnectPeer(userId: string) {
    const state = this.peers.get(userId);
    if (!state) return;
    this.teardownPeer(userId, state);
    this.peers.delete(userId);
    this.onRemoteStreamRemoved?.(userId);
  }

  stopAll() {
    this.tearingDown = true;
    for (const [userId, state] of this.peers) {
      this.teardownPeer(userId, state);
    }
    this.peers.clear();
    this.localStream = null;
    this.localScreenTrack = null;
    this.localScreenStream = null;
    this.globalSignalQueue = Promise.resolve();
    this.tearingDown = false;
  }

  /** Hot-swap outgoing tracks on all peers (e.g. after toggleVideo). */
  async republishLocalTracks(): Promise<void> {
    if (!this.localStream) return;
    for (const [, state] of this.peers) {
      await this.replaceTracksOnPeer(state.pc, this.localStream, state);
    }
  }

  /** Create offers on all existing peers (used after adding a video track). */
  async renegotiateAll(options?: RTCOfferOptions): Promise<void> {
    for (const [userId, state] of this.peers) {
      await this.enqueuePeer(userId, () => this.createAndSendOffer(userId, state, options));
    }
  }

  async renegotiatePeer(userId: string, options?: RTCOfferOptions): Promise<void> {
    const state = this.peers.get(userId);
    if (!state) return;
    await this.enqueuePeer(userId, () => this.createAndSendOffer(userId, state, options));
  }

  hasPeer(userId: string): boolean {
    return this.peers.has(userId);
  }

  getPeerIds(): string[] {
    return [...this.peers.keys()];
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private enqueuePeer(userId: string, work: () => Promise<void>): Promise<void> {
    const state = this.peers.get(userId);
    if (!state) return Promise.resolve();
    state.signalQueue = state.signalQueue.then(work).catch((err) => {
      console.error("[mesh] peer signal queue error:", userId, err);
    });
    return state.signalQueue;
  }

  private async createPeerConnection(userId: string): Promise<RTCPeerConnection> {
    const iceServers = await this.loadIceServers();
    const pc = new RTCPeerConnection({ iceServers });

    for (const track of this.localStream?.getTracks() ?? []) {
      pc.addTrack(track, this.localStream!);
    }

    pc.onicecandidate = (e) => {
      if (!e.candidate || !this.chatId || this.tearingDown) return;
      this.emitSignal(userId, {
        type: "ice-candidate",
        candidate: e.candidate.toJSON(),
      });
    };

    pc.ontrack = (e) => {
      const state = this.peers.get(userId);
      if (!state) return;
      this.handleRemoteTrack(userId, state, e);
    };

    pc.onconnectionstatechange = () => {
      this.onConnectionState?.(userId, pc.connectionState);
      if (pc.connectionState === "connected") {
        this.onIceConnected?.();
      }
    };

    pc.oniceconnectionstatechange = () => {
      const ice = pc.iceConnectionState;
      if (ice === "connected" || ice === "completed") {
        this.onIceConnected?.();
      }
    };

    return pc;
  }

  private handleRemoteTrack(userId: string, state: PeerState, e: RTCTrackEvent) {
    this.onIceConnected?.();
    const inboundStream = e.streams[0];
    const isScreenVideo =
      e.track.kind === "video" &&
      Boolean(
        state.expectedScreenStreamId &&
          inboundStream &&
          inboundStream.id === state.expectedScreenStreamId,
      );

    if (isScreenVideo) {
      if (!state.screenStream) {
        state.screenStream = new MediaStream();
      }
      if (!state.screenStream.getTracks().some((t) => t.id === e.track.id)) {
        state.screenStream.addTrack(e.track);
      }
      if (inboundStream && inboundStream.getTracks().length >= state.screenStream.getTracks().length) {
        state.screenStream = inboundStream;
      }
      this.onRemoteScreenStream?.(userId, state.screenStream);
      return;
    }

    if (!state.remoteStream) {
      state.remoteStream = new MediaStream();
    }
    const existing = state.remoteStream.getTracks().find((t) => t.id === e.track.id);
    if (!existing) {
      state.remoteStream.addTrack(e.track);
    }
    if (inboundStream && inboundStream.getTracks().length >= state.remoteStream.getTracks().length) {
      // Avoid overwriting camera/audio stream with a dedicated screen stream.
      if (
        !(
          state.expectedScreenStreamId &&
          inboundStream.id === state.expectedScreenStreamId
        )
      ) {
        state.remoteStream = inboundStream;
      }
    }
    this.onRemoteStream?.(userId, state.remoteStream);
  }

  private async createAndSendOffer(
    userId: string,
    state: PeerState,
    options?: RTCOfferOptions,
  ): Promise<void> {
    if (!this.chatId || this.tearingDown) return;
    const sig = state.pc.signalingState;
    const iceRestart = Boolean(options?.iceRestart);
    if (sig !== "stable" && !(iceRestart && sig === "have-local-offer")) return;

    const offer = await state.pc.createOffer(options);
    await state.pc.setLocalDescription(offer);
    this.emitSignal(userId, { type: "offer", sdp: offer.sdp });
  }

  private async processSignal(
    userId: string,
    state: PeerState,
    payload: SignalPayload,
  ): Promise<void> {
    const { chatId, data } = payload;
    const signalType = data.type;

    if (signalType === "screen-share") {
      const active = Boolean(data.active);
      const streamId = typeof data.streamId === "string" ? data.streamId : null;
      state.expectedScreenStreamId = active ? streamId : null;
      if (!active) {
        state.screenStream = null;
        this.onRemoteScreenStream?.(userId, null);
      } else if (streamId && state.remoteStream) {
        // Track may have arrived before the signal; reclassify matching video.
        const match = state.remoteStream
          .getVideoTracks()
          .find((_t) => {
            // Remote MediaStreamTrack ids differ; rely on stream association only.
            return false;
          });
        void match;
        // If remoteStream was replaced wholesale with the screen inbound stream,
        // move it when ids match.
        if (state.remoteStream.id === streamId) {
          state.screenStream = state.remoteStream;
          state.remoteStream = new MediaStream(
            state.screenStream.getAudioTracks().length
              ? state.screenStream.getAudioTracks()
              : [],
          );
          // Screen streams should be video-only; keep audio on remoteStream if any leaked.
          for (const t of state.screenStream.getAudioTracks()) {
            state.screenStream.removeTrack(t);
            if (!state.remoteStream.getTracks().some((x) => x.id === t.id)) {
              state.remoteStream.addTrack(t);
            }
          }
          this.onRemoteScreenStream?.(userId, state.screenStream);
          if (state.remoteStream.getTracks().length > 0) {
            this.onRemoteStream?.(userId, state.remoteStream);
          }
        }
      }
      return;
    }

    if (signalType === "offer" && typeof data.sdp === "string") {
      if (state.pc.signalingState === "have-local-offer") return;
      await state.pc.setRemoteDescription(
        new RTCSessionDescription({ type: "offer", sdp: data.sdp }),
      );
      await this.flushPendingCandidates(state);
      const answer = await state.pc.createAnswer();
      await state.pc.setLocalDescription(answer);
      this.emitSignal(userId, { type: "answer", sdp: answer.sdp });
      void chatId;
      return;
    }

    if (signalType === "answer" && typeof data.sdp === "string") {
      if (state.pc.signalingState === "have-local-offer") {
        await state.pc.setRemoteDescription(
          new RTCSessionDescription({ type: "answer", sdp: data.sdp }),
        );
        await this.flushPendingCandidates(state);
      }
      return;
    }

    if (signalType === "ice-candidate" && data.candidate && typeof data.candidate === "object") {
      const c = data.candidate as RTCIceCandidateInit;
      if (state.pc.remoteDescription) {
        await state.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => undefined);
      } else {
        state.pendingCandidates.push(c);
      }
    }
  }

  private async flushPendingCandidates(state: PeerState) {
    const list = state.pendingCandidates.splice(0);
    for (const c of list) {
      await state.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => undefined);
    }
  }

  private async applyScreenTrackToPeer(userId: string, state: PeerState): Promise<void> {
    const track = this.localScreenTrack;
    const stream = this.localScreenStream;
    if (!track || !stream) return;

    if (state.screenSender) {
      await state.screenSender.replaceTrack(track);
      return;
    }

    const existing = state.pc
      .getSenders()
      .find((s) => s.track?.id === track.id);
    if (existing) {
      state.screenSender = existing;
      return;
    }

    state.screenSender = state.pc.addTrack(track, stream);
    void userId;
  }

  private async removeScreenTrackFromPeer(_userId: string, state: PeerState): Promise<void> {
    if (!state.screenSender) {
      const screenId = this.localScreenTrack?.id;
      const sender = state.pc
        .getSenders()
        .find((s) => s.track?.kind === "video" && s.track.id === screenId);
      if (sender) {
        state.pc.removeTrack(sender);
      }
      state.screenSender = null;
      return;
    }
    state.pc.removeTrack(state.screenSender);
    state.screenSender = null;
  }

  private async replaceTracksOnPeer(
    pc: RTCPeerConnection,
    stream: MediaStream,
    state: PeerState,
  ) {
    const audioTrack = stream.getAudioTracks()[0] ?? null;
    const videoTrack = stream.getVideoTracks()[0] ?? null;
    const screenTrackId = this.localScreenTrack?.id ?? state.screenSender?.track?.id;

    const audioSender = pc.getSenders().find((s) => s.track?.kind === "audio");
    if (audioTrack) {
      if (audioSender) await audioSender.replaceTrack(audioTrack);
      else pc.addTrack(audioTrack, stream);
    }

    const cameraSender = pc
      .getSenders()
      .find(
        (s) =>
          s.track?.kind === "video" &&
          s !== state.screenSender &&
          s.track.id !== screenTrackId,
      );

    if (videoTrack) {
      if (cameraSender) await cameraSender.replaceTrack(videoTrack);
      else pc.addTrack(videoTrack, stream);
    } else if (cameraSender) {
      // Do not stop the track here — ownership stays with CallSessionController.
      pc.removeTrack(cameraSender);
    }
  }

  private teardownPeer(_userId: string, state: PeerState) {
    state.pc.onicecandidate = null;
    state.pc.ontrack = null;
    state.pc.onconnectionstatechange = null;
    state.pc.oniceconnectionstatechange = null;
    state.pc.close();
    state.pendingCandidates = [];
    state.remoteStream = null;
    state.screenStream = null;
    state.expectedScreenStreamId = null;
    state.screenSender = null;
    state.signalQueue = Promise.resolve();
  }

  private emitSignal(targetUserId: string, data: SignalData) {
    if (this.tearingDown || !this.chatId) return;
    this.socket.emit("call:signal", {
      chatId: this.chatId,
      roomId: this.roomId ?? undefined,
      targetUserId,
      data,
    });
  }

  private async loadIceServers(): Promise<RTCIceServer[]> {
    if (this.iceServersCache) return this.iceServersCache;
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
        if (servers.length > 0) {
          this.iceServersCache = servers;
          return servers;
        }
      }
    } catch {
      /* fall through */
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
    this.iceServersCache = fallback;
    return fallback;
  }
}
