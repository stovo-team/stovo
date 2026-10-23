/**
 * LiveKit SFU media engine.
 * Uses dynamic import of `livekit-client` (official package; `@livekit/client` does not exist on npm).
 */

import { resolveLiveKitUrl } from "./livekitUrl";
import { DEFAULT_CALL_QUALITY_BITRATES, videoTrackPublishOptions, type CallQualityBitrates } from "./callQuality";

type RemoteStreamMap = Map<string, MediaStream>;

type LiveKitModule = typeof import("livekit-client");

export default class LiveKitMediaEngine {
  private connectionRevision = 0;
  private disconnectPromise: Promise<void> | null = null;
  private room: import("livekit-client").Room | null = null;
  private remoteStreams: RemoteStreamMap = new Map();
  private remoteScreenStreams: RemoteStreamMap = new Map();
  private livekit: LiveKitModule | null = null;
  private videoBitrates: CallQualityBitrates = { ...DEFAULT_CALL_QUALITY_BITRATES };
  private publishedStream: MediaStream | null = null;
  private screenPublication: import("livekit-client").LocalTrackPublication | null = null;

  onRemoteStream?: (userId: string, stream: MediaStream) => void;
  onRemoteScreenStream?: (userId: string, stream: MediaStream | null) => void;
  onRemoteStreamRemoved?: (userId: string) => void;
  onRemoteMicrophoneMuteChange?: (userId: string, muted: boolean) => void;
  onRemoteParticipantDisconnected?: (userId: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;

  async connect(opts: { url: string; token: string }): Promise<void> {
    const revision = ++this.connectionRevision;
    await this.disconnectPromise;
    const lk = await this.loadLiveKit();
    if (revision !== this.connectionRevision) return;
    if (this.room) {
      await this.closeRoom();
      if (revision !== this.connectionRevision) return;
    }

    const room = new lk.Room({
      adaptiveStream: true,
      dynacast: true,
    });
    this.room = room;

    const reportMicrophoneState = (participant: { identity: string; isMicrophoneEnabled: boolean }) => {
      this.onRemoteMicrophoneMuteChange?.(participant.identity, !participant.isMicrophoneEnabled);
    };

    room.on(lk.RoomEvent.ParticipantConnected, (participant) => {
      if (this.room !== room) return;
      reportMicrophoneState(participant);
    });

    room.on(lk.RoomEvent.TrackMuted, (publication, participant) => {
      if (this.room !== room) return;
      if (publication.source === lk.Track.Source.Microphone) {
        this.onRemoteMicrophoneMuteChange?.(participant.identity, true);
      }
    });

    room.on(lk.RoomEvent.TrackUnmuted, (publication, participant) => {
      if (this.room !== room) return;
      if (publication.source === lk.Track.Source.Microphone) {
        this.onRemoteMicrophoneMuteChange?.(participant.identity, false);
      }
    });

    room.on(lk.RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      if (this.room !== room) return;
      const userId = participant.identity;
      if (track.source === lk.Track.Source.ScreenShare) {
        let stream = this.remoteScreenStreams.get(userId);
        if (!stream) {
          stream = new MediaStream();
          this.remoteScreenStreams.set(userId, stream);
        }
        if (track.mediaStreamTrack) {
          const already = stream.getTracks().some((t) => t.id === track.mediaStreamTrack.id);
          if (!already) stream.addTrack(track.mediaStreamTrack);
        }
        this.onRemoteScreenStream?.(userId, stream);
        return;
      }

      let stream = this.remoteStreams.get(userId);
      if (!stream) {
        stream = new MediaStream();
        this.remoteStreams.set(userId, stream);
      }
      if (track.mediaStreamTrack) {
        const already = stream.getTracks().some((t) => t.id === track.mediaStreamTrack.id);
        if (!already) stream.addTrack(track.mediaStreamTrack);
      }
      this.onRemoteStream?.(userId, stream);
    });

    room.on(lk.RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
      if (this.room !== room) return;
      const userId = participant.identity;
      if (track.source === lk.Track.Source.ScreenShare) {
        const stream = this.remoteScreenStreams.get(userId);
        if (stream && track.mediaStreamTrack) {
          stream.removeTrack(track.mediaStreamTrack);
          if (stream.getTracks().length === 0) {
            this.remoteScreenStreams.delete(userId);
            this.onRemoteScreenStream?.(userId, null);
          } else {
            this.onRemoteScreenStream?.(userId, stream);
          }
        }
        return;
      }

      const stream = this.remoteStreams.get(userId);
      if (stream && track.mediaStreamTrack) {
        stream.removeTrack(track.mediaStreamTrack);
        if (stream.getTracks().length === 0) {
          this.remoteStreams.delete(userId);
          this.onRemoteStreamRemoved?.(userId);
        } else {
          this.onRemoteStream?.(userId, stream);
        }
      }
    });

    room.on(lk.RoomEvent.ParticipantDisconnected, (participant) => {
      if (this.room !== room) return;
      const userId = participant.identity;
      this.onRemoteParticipantDisconnected?.(userId);
      if (this.remoteStreams.has(userId)) {
        this.remoteStreams.delete(userId);
        this.onRemoteStreamRemoved?.(userId);
      }
      if (this.remoteScreenStreams.has(userId)) {
        this.remoteScreenStreams.delete(userId);
        this.onRemoteScreenStream?.(userId, null);
      }
    });

    room.on(lk.RoomEvent.Disconnected, () => {
      if (this.room !== room) return;
      for (const participant of room.remoteParticipants.values()) {
        this.onRemoteParticipantDisconnected?.(participant.identity);
      }
      this.remoteStreams.clear();
      this.remoteScreenStreams.clear();
      this.onDisconnected?.();
    });

    await room.connect(resolveLiveKitUrl(opts.url), opts.token);
    if (this.room !== room || revision !== this.connectionRevision) return;
    for (const participant of room.remoteParticipants.values()) reportMicrophoneState(participant);
    this.onConnected?.();
  }

  setVideoBitrates(settings: CallQualityBitrates) {
    this.videoBitrates = settings;
  }

  async publishLocalStream(stream: MediaStream): Promise<void> {
    if (!this.room) throw new Error("LiveKit room not connected");
    const lk = await this.loadLiveKit();
    this.publishedStream = stream;

    const local = this.room.localParticipant;
    const audio = stream.getAudioTracks()[0];
    const video = stream.getVideoTracks().find((track) => track.readyState !== "ended");

    if (audio) {
      try {
        const hasAudio = Array.from(local.trackPublications.values()).some(
          (p) => p.source === lk.Track.Source.Microphone
        );
        if (!hasAudio) {
          await local.publishTrack(audio, {
            source: lk.Track.Source.Microphone,
          });
        }
      } catch (err) {
        console.warn("[LiveKit] publish audio track error:", err);
      }
    }
    if (video) {
      try {
        const cameraPublications = Array.from(local.trackPublications.values()).filter(
          (p) => p.source === lk.Track.Source.Camera
        );
        for (const publication of cameraPublications) {
          const publishedTrack = publication.track;
          if (publishedTrack?.mediaStreamTrack?.readyState === "ended") {
            await local.unpublishTrack(publishedTrack);
          }
        }
        const hasVideo = Array.from(local.trackPublications.values()).some(
          (p) => p.source === lk.Track.Source.Camera && p.track?.mediaStreamTrack?.readyState !== "ended"
        );
        if (!hasVideo) {
          await local.publishTrack(video, {
            source: lk.Track.Source.Camera,
            ...videoTrackPublishOptions(this.videoBitrates.cameraBitrateKbps, "camera"),
          });
        }
      } catch (err) {
        console.warn("[LiveKit] publish video track error:", err);
      }
    }
  }

  async publishScreenShare(track: MediaStreamTrack): Promise<void> {
    if (!this.room) throw new Error("LiveKit room not connected");
    const lk = await this.loadLiveKit();
    await this.unpublishScreenShare();
    this.screenPublication = await this.room.localParticipant.publishTrack(track, {
      source: lk.Track.Source.ScreenShare,
      ...videoTrackPublishOptions(this.videoBitrates.screenShareBitrateKbps, "screenShare"),
    });
  }

  async unpublishScreenShare(): Promise<void> {
    const pub = this.screenPublication;
    this.screenPublication = null;
    if (!pub || !this.room) return;
    try {
      const track = pub.track;
      if (track) {
        await this.room.localParticipant.unpublishTrack(track);
      }
    } catch {
      /* ignore */
    }
  }

  setMicMuted(muted: boolean) {
    const tracks =
      this.publishedStream?.getAudioTracks() ??
      this.room?.localParticipant?.audioTrackPublications;
    if (this.publishedStream) {
      for (const t of this.publishedStream.getAudioTracks()) t.enabled = !muted;
    }
    void this.room?.localParticipant?.setMicrophoneEnabled(!muted).catch(() => undefined);
    void tracks;
  }

  setCameraEnabled(enabled: boolean) {
    if (this.publishedStream) {
      for (const t of this.publishedStream.getVideoTracks()) t.enabled = enabled;
    }
    void this.room?.localParticipant?.setCameraEnabled(enabled).catch(() => undefined);
  }

  getRemoteStreams(): RemoteStreamMap {
    return new Map(this.remoteStreams);
  }

  getRemoteScreenStreams(): RemoteStreamMap {
    return new Map(this.remoteScreenStreams);
  }

  disconnect(): Promise<void> {
    this.connectionRevision++;
    return this.closeRoom();
  }

  private closeRoom(): Promise<void> {
    if (this.disconnectPromise) return this.disconnectPromise;
    const room = this.room;
    this.room = null;
    this.publishedStream = null;
    this.screenPublication = null;
    this.remoteStreams.clear();
    this.remoteScreenStreams.clear();
    const closing = (async () => {
      try { await room?.disconnect(); } catch { /* already closed */ }
    })();
    this.disconnectPromise = closing;
    void closing.finally(() => {
      if (this.disconnectPromise === closing) this.disconnectPromise = null;
    });
    return closing;
  }

  private async loadLiveKit(): Promise<LiveKitModule> {
    if (this.livekit) return this.livekit;
    this.livekit = await import("livekit-client");
    return this.livekit;
  }
}
