import { beforeEach, describe, expect, it, vi } from "vitest";

const livekit = vi.hoisted(() => {
  const roomInstances: Array<{ localParticipant: any; remoteParticipants: Map<string, any>; connect: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  class Room {
    localParticipant = {
      trackPublications: new Map(),
      publishTrack: vi.fn(async (_track, options) => ({ options, track: _track })),
      unpublishTrack: vi.fn(async () => undefined),
    };
    remoteParticipants = new Map();
    connect = vi.fn(async () => undefined);
    on = vi.fn();
    disconnect = vi.fn(async () => undefined);
    constructor() { roomInstances.push(this); }
  }
  return {
    Room,
    roomInstances,
    RoomEvent: { TrackSubscribed: "subscribed", TrackUnsubscribed: "unsubscribed", ParticipantConnected: "participant-connected", ParticipantDisconnected: "participant-disconnected", TrackMuted: "track-muted", TrackUnmuted: "track-unmuted", Disconnected: "disconnected" },
    Track: { Source: { Microphone: "microphone", Camera: "camera", ScreenShare: "screen-share" } },
  };
});

vi.mock("livekit-client", () => livekit);

import LiveKitMediaEngine from "./LiveKitMediaEngine";

describe("LiveKitMediaEngine video quality", () => {
  beforeEach(() => { livekit.roomInstances.length = 0; });

  it("publishes camera and screen-share tracks with independently configured bitrate caps", async () => {
    const engine = new LiveKitMediaEngine();
    engine.setVideoBitrates({ cameraBitrateKbps: 1_900, screenShareBitrateKbps: 3_500 });
    await engine.connect({ url: "wss://calls.example", token: "token" });
    const room = livekit.roomInstances[0];
    const camera = { kind: "video" } as MediaStreamTrack;
    const stream = { getAudioTracks: () => [], getVideoTracks: () => [camera] } as unknown as MediaStream;
    await engine.publishLocalStream(stream);
    const screen = { kind: "video" } as MediaStreamTrack;
    await engine.publishScreenShare(screen);

    expect(room.localParticipant.publishTrack).toHaveBeenNthCalledWith(1, camera, {
      source: "camera", videoEncoding: { maxBitrate: 1_900_000 },
    });
    expect(room.localParticipant.publishTrack).toHaveBeenNthCalledWith(2, screen, {
      source: "screen-share", screenShareEncoding: { maxBitrate: 3_500_000, maxFramerate: 30 },
    });
    await engine.disconnect();
  });

  it("reports initial and changing remote microphone mute state", async () => {
    const engine = new LiveKitMediaEngine();
    const onRemoteMicrophoneMuteChange = vi.fn();
    engine.onRemoteMicrophoneMuteChange = onRemoteMicrophoneMuteChange;
    await engine.connect({ url: "wss://calls.example", token: "token" });
    const room = livekit.roomInstances[0];
    const participant = { identity: "peer-1", isMicrophoneEnabled: false };
    room.remoteParticipants.set(participant.identity, participant);
    const handlers = Object.fromEntries(room.on.mock.calls.map(([event, handler]) => [event, handler as (...args: any[]) => void]));

    handlers["participant-connected"]?.(participant);
    handlers["track-muted"]?.({ source: "microphone" }, participant);
    handlers["track-unmuted"]?.({ source: "microphone" }, participant);
    handlers["track-muted"]?.({ source: "camera" }, participant);
    handlers["track-unmuted"]?.({ source: "screen-share" }, participant);

    expect(onRemoteMicrophoneMuteChange.mock.calls).toEqual([
      ["peer-1", true],
      ["peer-1", true],
      ["peer-1", false],
    ]);
    await engine.disconnect();
  });
});
