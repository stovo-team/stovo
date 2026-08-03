/**
 * LiveKit SFU media engine.
 * Uses dynamic import of `livekit-client` (official package; `@livekit/client` does not exist on npm).
 */

type RemoteStreamMap = Map<string, MediaStream>;

type LiveKitModule = typeof import("livekit-client");

export default class LiveKitMediaEngine {
  private room: import("livekit-client").Room | null = null;
  private remoteStreams: RemoteStreamMap = new Map();
  private livekit: LiveKitModule | null = null;
  private publishedStream: MediaStream | null = null;

  onRemoteStream?: (userId: string, stream: MediaStream) => void;
  onRemoteStreamRemoved?: (userId: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;

  async connect(opts: { url: string; token: string }): Promise<void> {
    const lk = await this.loadLiveKit();
    if (this.room) {
      await this.disconnect();
    }

    const room = new lk.Room({
      adaptiveStream: true,
      dynacast: true,
    });
    this.room = room;

    room.on(lk.RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      const userId = participant.identity;
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
      const userId = participant.identity;
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
      const userId = participant.identity;
      if (this.remoteStreams.has(userId)) {
        this.remoteStreams.delete(userId);
        this.onRemoteStreamRemoved?.(userId);
      }
    });

    room.on(lk.RoomEvent.Disconnected, () => {
      this.remoteStreams.clear();
      this.onDisconnected?.();
    });

    await room.connect(opts.url, opts.token);
    this.onConnected?.();
  }

  async publishLocalStream(stream: MediaStream): Promise<void> {
    if (!this.room) throw new Error("LiveKit room not connected");
    const lk = await this.loadLiveKit();
    this.publishedStream = stream;

    const local = this.room.localParticipant;
    const audio = stream.getAudioTracks()[0];
    const video = stream.getVideoTracks()[0];

    if (audio) {
      const pub = await local.publishTrack(audio, {
        source: lk.Track.Source.Microphone,
      });
      void pub;
    }
    if (video) {
      const pub = await local.publishTrack(video, {
        source: lk.Track.Source.Camera,
      });
      void pub;
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

  async disconnect(): Promise<void> {
    const room = this.room;
    this.room = null;
    this.publishedStream = null;
    this.remoteStreams.clear();
    if (room) {
      try {
        await room.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  private async loadLiveKit(): Promise<LiveKitModule> {
    if (this.livekit) return this.livekit;
    this.livekit = await import("livekit-client");
    return this.livekit;
  }
}
