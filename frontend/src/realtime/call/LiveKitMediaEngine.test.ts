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

  it("publishes the live camera when an ended camera track is still in the stream", async () => {
    const engine = new LiveKitMediaEngine();
    await engine.connect({ url: "wss://calls.example", token: "token" });
    const room = livekit.roomInstances[0];
    const ended = { id: "ended-camera", kind: "video", readyState: "ended" } as MediaStreamTrack;
    const live = { id: "live-camera", kind: "video", readyState: "live" } as MediaStreamTrack;
    const stream = { getAudioTracks: () => [], getVideoTracks: () => [ended, live] } as unknown as MediaStream;

    await engine.publishLocalStream(stream);

    expect(room.localParticipant.publishTrack).toHaveBeenCalledWith(live, expect.objectContaining({ source: "camera" }));
    await engine.disconnect();
  });

  it("replaces an ended published camera track when a new live track is supplied", async () => {
    const engine = new LiveKitMediaEngine();
    await engine.connect({ url: "wss://calls.example", token: "token" });
    const room = livekit.roomInstances[0];
    const endedMediaTrack = { id: "ended-camera", kind: "video", readyState: "ended" } as MediaStreamTrack;
    const stalePublicationTrack = { mediaStreamTrack: endedMediaTrack };
    room.localParticipant.trackPublications.set("camera", {
      source: "camera",
      track: stalePublicationTrack,
    });
    const live = { id: "replacement-camera", kind: "video", readyState: "live" } as MediaStreamTrack;
    const stream = { getAudioTracks: () => [], getVideoTracks: () => [live] } as unknown as MediaStream;

    await engine.publishLocalStream(stream);

    expect(room.localParticipant.unpublishTrack).toHaveBeenCalledWith(stalePublicationTrack);
    expect(room.localParticipant.publishTrack).toHaveBeenCalledWith(
      live,
      expect.objectContaining({ source: "camera" }),
    );
    await engine.disconnect();
  });
});


describe("LiveKit reconnect isolation", () => {
  it("waits for the previous websocket to close before joining again", async () => {
    const engine = new LiveKitMediaEngine();
    await engine.connect({ url: "wss://calls.example", token: "first" });
    const old = livekit.roomInstances.at(-1)!;
    let finish!: () => void;
    old.disconnect.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const leaving = engine.disconnect();
    const rejoining = engine.connect({ url: "wss://calls.example", token: "second" });
    await Promise.resolve(); await Promise.resolve();
    expect(livekit.roomInstances.at(-1)).toBe(old);
    finish();
    await leaving; await rejoining;
    expect(livekit.roomInstances.at(-1)).not.toBe(old);
    await engine.disconnect();
  });

  it("ignores a delayed disconnect event from a room already left", async () => {
    const engine = new LiveKitMediaEngine();
    const disconnected = vi.fn();
    engine.onDisconnected = disconnected;
    await engine.connect({ url: "wss://calls.example", token: "first" });
    const old = livekit.roomInstances.at(-1)!;
    await engine.disconnect();
    await engine.connect({ url: "wss://calls.example", token: "second" });
    const handler = old.on.mock.calls.find(([event]) => event === "disconnected")![1];
    handler();
    expect(disconnected).not.toHaveBeenCalled();
    await engine.disconnect();
  });
});

it("does not report connected after leaving a room with a pending handshake", async () => {
  const engine = new LiveKitMediaEngine();
  const connected = vi.fn(); engine.onConnected = connected;
  await engine.connect({ url: "wss://calls.example", token: "initial" });
  connected.mockClear();
  await engine.disconnect();
  let finish!: () => void;
  // Delay the transport boundary, keeping room creation and engine logic real.
  const create = vi.spyOn(engine as never, 'loadLiveKit' as never).mockImplementation(async () => ({
    ...livekit,
    Room: class extends livekit.Room {
      constructor() { super(); this.connect = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })); }
    },
  }) as never);
  const joining = engine.connect({ url: "wss://calls.example", token: "pending" });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  await engine.disconnect(); finish(); await joining;
  expect(connected).not.toHaveBeenCalled();
  create.mockRestore();
});
