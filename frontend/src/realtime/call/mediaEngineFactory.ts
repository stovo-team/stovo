import type { Socket } from "socket.io-client";
import MeshMediaEngine from "./MeshMediaEngine";
import LiveKitMediaEngine from "./LiveKitMediaEngine";
import type { CallQualityBitrates } from "./callQuality";

export type CallSignalPayload = {
  chatId: string;
  fromUserId: string;
  data: Record<string, unknown>;
};

// MeshMediaEnginePort is intentionally topology-specific. A shared interface
// containing every mesh and SFU operation would violate interface segregation.
export interface MeshMediaEnginePort {
  onRemoteStream?: (userId: string, stream: MediaStream) => void;
  onRemoteScreenStream?: (userId: string, stream: MediaStream | null) => void;
  onRemoteStreamRemoved?: (userId: string) => void;
  onConnectionState?: (userId: string, state: RTCPeerConnectionState) => void;
  onIceConnected?: () => void;
  updateAccessToken(accessToken: string): void;
  setChatId(chatId: string | null): void;
  setRoomId(roomId: string | null): void;
  setLocalUserId(userId: string | null): void;
  setLocalStream(stream: MediaStream | null): void;
  setVideoBitrates?(settings: CallQualityBitrates): void;
  setScreenTrack(track: MediaStreamTrack, stream: MediaStream): Promise<void>;
  clearScreenTrack(): Promise<void>;
  connectPeer(userId: string, asOfferer: boolean): Promise<void>;
  handleSignal(payload: CallSignalPayload): Promise<void>;
  disconnectPeer(userId: string): void;
  stopAll(): void;
  republishLocalTracks(): Promise<void>;
  renegotiateAll(options?: RTCOfferOptions): Promise<void>;
  renegotiatePeer(userId: string, options?: RTCOfferOptions): Promise<void>;
  hasPeer(userId: string): boolean;
  getPeerIds(): string[];
}

export interface SFUMediaEnginePort {
  onRemoteStream?: (userId: string, stream: MediaStream) => void;
  onRemoteScreenStream?: (userId: string, stream: MediaStream | null) => void;
  onRemoteStreamRemoved?: (userId: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  connect(options: { url: string; token: string }): Promise<void>;
  setVideoBitrates?(settings: CallQualityBitrates): void;
  publishLocalStream(stream: MediaStream): Promise<void>;
  publishScreenShare(track: MediaStreamTrack): Promise<void>;
  unpublishScreenShare(): Promise<void>;
  setMicMuted(muted: boolean): void;
  setCameraEnabled(enabled: boolean): void;
  disconnect(): Promise<void>;
}

// MediaEngineFactory is the controller's single construction seam. Tests can
// inject lightweight ports and future transports can be added without changing
// controller construction logic.
export interface MediaEngineFactory {
  createMesh(socket: Socket, accessToken: string): MeshMediaEnginePort;
  createSFU(): SFUMediaEnginePort;
}

export const defaultMediaEngineFactory: MediaEngineFactory = {
  createMesh: (socket, accessToken) => new MeshMediaEngine(socket, accessToken),
  createSFU: () => new LiveKitMediaEngine(),
};
