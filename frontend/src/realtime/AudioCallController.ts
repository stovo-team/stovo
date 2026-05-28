import { Socket } from "socket.io-client";

type SignalEnvelope = {
  chatId: string;
  targetUserId?: string;
  data: Record<string, unknown>;
};

export default class AudioCallController {
  private socket: Socket;

  private remoteAudioEl: HTMLAudioElement | null = null;

  private peer: RTCPeerConnection | null = null;

  private localStream: MediaStream | null = null;

  private chatId: string | null = null;

  private targetUserId: string | null = null;

  constructor(socket: Socket) {
    this.socket = socket;
  }

  attachRemoteAudioElement(element: HTMLAudioElement | null) {
    this.remoteAudioEl = element;
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
      return;
    }
    if (
      signalType === "ice-candidate" &&
      payload.data.candidate &&
      typeof payload.data.candidate === "object"
    ) {
      await this.peer!.addIceCandidate(new RTCIceCandidate(payload.data.candidate as RTCIceCandidateInit));
    }
  }

  setMuted(muted: boolean) {
    for (const track of this.localStream?.getAudioTracks() ?? []) {
      track.enabled = !muted;
    }
  }

  setSpeakerEnabled(enabled: boolean) {
    if (this.remoteAudioEl) {
      this.remoteAudioEl.muted = !enabled;
    }
  }

  async cleanup() {
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
    }
    this.localStream = null;
    if (this.peer) {
      this.peer.onicecandidate = null;
      this.peer.ontrack = null;
      this.peer.close();
    }
    this.peer = null;
    if (this.remoteAudioEl) {
      this.remoteAudioEl.srcObject = null;
    }
    this.chatId = null;
    this.targetUserId = null;
  }

  private async ensurePeer() {
    if (this.peer) {
      return;
    }

    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });

    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: import.meta.env.VITE_STUN_URL },
        {
          urls: import.meta.env.VITE_TURN_URL,
          username: import.meta.env.VITE_TURN_USERNAME,
          credential: import.meta.env.VITE_TURN_PASSWORD
        }
      ]
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

    for (const track of this.localStream.getTracks()) {
      peer.addTrack(track,this.localStream);
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
  }

  private emitSignal(payload: SignalEnvelope) {
    this.socket.emit("call:signal", payload);
  }
}
