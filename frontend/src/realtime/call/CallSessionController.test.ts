import { afterEach, describe, expect, it, vi } from "vitest";
import CallSessionController from "./CallSessionController";
import type { MediaEngineFactory } from "./mediaEngineFactory";

describe("CallSessionController call quality", () => {
  it("applies output volume patches to active remote audio playback", async () => {
    const factory = { createMesh: () => ({}), createSFU: () => ({}) } as unknown as MediaEngineFactory;
    const controller = new CallSessionController({} as never, "token", factory);
    const remoteAudio = { muted: false, volume: 1 } as HTMLAudioElement;
    Object.assign(controller, { remoteAudioEl: remoteAudio });

    await controller.applySettings({ outputVolume: 25, speakerMode: "large" });

    expect(remoteAudio.volume).toBe(0.25);
  });

  it("applies independently selected camera and screen-share limits to mesh and LiveKit engines", () => {
    const mesh = { setVideoBitrates: vi.fn() };
    const sfu = { setVideoBitrates: vi.fn() };
    const factory = {
      createMesh: () => mesh,
      createSFU: () => sfu,
    } as unknown as MediaEngineFactory;
    const controller = new CallSessionController({} as never, "token", factory);
    const directQuality = { cameraBitrateKbps: 1_900, screenShareBitrateKbps: 3_500 };
    const groupQuality = { cameraBitrateKbps: 2_000, screenShareBitrateKbps: 6_000 };

    controller.setCallQualityBitrates(directQuality);
    expect(mesh.setVideoBitrates).toHaveBeenLastCalledWith(directQuality);
    expect(sfu.setVideoBitrates).toHaveBeenLastCalledWith(directQuality);

    controller.setCallQualityBitrates(groupQuality);
    expect(mesh.setVideoBitrates).toHaveBeenLastCalledWith(groupQuality);
    expect(sfu.setVideoBitrates).toHaveBeenLastCalledWith(groupQuality);
  });

  it("broadcasts local mute state and applies incoming mute state to later remote media", async () => {
    const socket = { emit: vi.fn() };
    const mesh = {
      setChatId: vi.fn(),
      setRoomId: vi.fn(),
      getPeerIds: () => ["peer"],
      handleSignal: vi.fn(async () => undefined),
    };
    const factory = { createMesh: () => mesh, createSFU: () => ({}) } as unknown as MediaEngineFactory;
    const controller = new CallSessionController(socket as never, "token", factory);
    const onRemoteMediaChange = vi.fn();
    controller.setChatId("chat-1");
    controller.setRoomId("room-1");
    controller.onRemoteMediaChange = onRemoteMediaChange;

    await controller.applySettings({ micMuted: true });
    expect(socket.emit).toHaveBeenCalledWith("call:signal", expect.objectContaining({
      chatId: "chat-1",
      roomId: "room-1",
      targetUserId: "peer",
      data: { type: "microphone-state", muted: true },
    }));

    await controller.handleSignal({ chatId: "chat-1", fromUserId: "peer", data: { type: "microphone-state", muted: true } });
    expect(mesh.handleSignal).not.toHaveBeenCalled();
    const stream = { getAudioTracks: () => [{}], getVideoTracks: () => [] } as unknown as MediaStream;
    mesh.onRemoteStream?.("peer", stream);
    expect(onRemoteMediaChange).toHaveBeenLastCalledWith([expect.objectContaining({ userId: "peer", isMuted: true })]);

    await controller.handleSignal({ chatId: "chat-1", fromUserId: "peer", data: { type: "microphone-state", muted: false } });
    expect(onRemoteMediaChange).toHaveBeenLastCalledWith([expect.objectContaining({ userId: "peer", isMuted: false })]);
    mesh.onRemoteStreamRemoved?.("peer");
    mesh.onRemoteStream?.("peer", stream);
    expect(onRemoteMediaChange).toHaveBeenLastCalledWith([expect.objectContaining({ userId: "peer", isMuted: false })]);
  });

  it("forwards SFU remote microphone mute callbacks into shared remote media", () => {
    const sfu: Record<string, any> = {};
    const factory = { createMesh: () => ({}), createSFU: () => sfu } as unknown as MediaEngineFactory;
    const controller = new CallSessionController({} as never, "token", factory);
    const onRemoteMediaChange = vi.fn();
    controller.onRemoteMediaChange = onRemoteMediaChange;
    controller.setTopology("sfu");

    sfu.onRemoteMicrophoneMuteChange("sfu-peer", true);
    sfu.onRemoteStream("sfu-peer", { getAudioTracks: () => [{}], getVideoTracks: () => [] } as unknown as MediaStream);

    expect(onRemoteMediaChange).toHaveBeenLastCalledWith([expect.objectContaining({ userId: "sfu-peer", isMuted: true })]);
  });

  it("announces an initially muted microphone after mesh peers connect", async () => {
    const socket = { emit: vi.fn() };
    const peerIds = new Set<string>();
    const mesh = {
      setChatId: vi.fn(),
      setRoomId: vi.fn(),
      setLocalUserId: vi.fn(),
      setLocalStream: vi.fn(),
      getPeerIds: () => [...peerIds],
      disconnectPeer: vi.fn((id: string) => peerIds.delete(id)),
      connectPeer: vi.fn(async (id: string) => { peerIds.add(id); }),
      handleSignal: vi.fn(async () => undefined),
    };
    const factory = { createMesh: () => mesh, createSFU: () => ({}) } as unknown as MediaEngineFactory;
    const controller = new CallSessionController(socket as never, "token", factory);
    controller.setLocalUserId("local");
    controller.setChatId("chat-1");
    controller.setRoomId("room-1");
    const stream = { getTracks: () => [], getAudioTracks: () => [], getVideoTracks: () => [] } as unknown as MediaStream;
    Object.assign(controller, { sourceStream: stream, localStream: stream });
    await controller.applySettings({ micMuted: true });

    await controller.syncMeshPeers(["local", "peer"]);

    expect(mesh.connectPeer).toHaveBeenCalledWith("peer", true);
    expect(socket.emit).toHaveBeenCalledWith("call:signal", expect.objectContaining({
      targetUserId: "peer",
      data: { type: "microphone-state", muted: true },
    }));
  });

  it("ignores malformed microphone-state signals and signals from another chat", async () => {
    const socket = { emit: vi.fn() };
    const peerIds = new Set<string>();
    const mesh = {
      setChatId: vi.fn(), setRoomId: vi.fn(), setLocalUserId: vi.fn(), setLocalStream: vi.fn(),
      getPeerIds: () => [...peerIds],
      disconnectPeer: vi.fn((id: string) => peerIds.delete(id)),
      connectPeer: vi.fn(async (id: string) => { peerIds.add(id); }),
      handleSignal: vi.fn(async () => undefined),
      onRemoteStream: undefined as ((id: string, stream: MediaStream) => void) | undefined,
    };
    const factory = { createMesh: () => mesh, createSFU: () => ({}) } as unknown as MediaEngineFactory;
    const controller = new CallSessionController(socket as never, "token", factory);
    const onRemoteMediaChange = vi.fn();
    controller.onRemoteMediaChange = onRemoteMediaChange;
    controller.setLocalUserId("local");
    controller.setChatId("chat-1");
    const stream = { getTracks: () => [], getAudioTracks: () => [], getVideoTracks: () => [] } as unknown as MediaStream;
    Object.assign(controller, { sourceStream: stream, localStream: stream });

    await controller.handleSignal({ chatId: "chat-1", fromUserId: "peer", data: { type: "microphone-state", muted: "true" } });
    await controller.handleSignal({ chatId: "chat-1", data: { type: "microphone-state", muted: true } });
    await controller.handleSignal({ chatId: "other-chat", fromUserId: "peer", data: { type: "microphone-state", muted: true } });
    await controller.syncMeshPeers(["local", "peer"]);
    mesh.onRemoteStream?.("peer", stream);

    expect(mesh.handleSignal).not.toHaveBeenCalled();
    expect(onRemoteMediaChange).toHaveBeenLastCalledWith([expect.objectContaining({ userId: "peer", isMuted: false })]);
  });
});

describe("CallSessionController camera lifecycle", () => {
  it("removes ended camera tracks before reacquiring a 720p, 30fps camera", async () => {
    let readyState: MediaStreamTrackState = "live";
    const oldTrack = {
      id: "old-camera",
      kind: "video",
      get readyState() { return readyState; },
      stop: vi.fn(() => { readyState = "ended"; }),
    } as unknown as MediaStreamTrack;
    const nextTrack = { id: "new-camera", kind: "video", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack;
    let tracks = [oldTrack];
    const stream = {
      getTracks: () => tracks,
      getVideoTracks: () => tracks.filter((track) => track.kind === "video"),
      getAudioTracks: () => [],
      addTrack: vi.fn((track: MediaStreamTrack) => { tracks.push(track); }),
      removeTrack: vi.fn((track: MediaStreamTrack) => { tracks = tracks.filter((item) => item !== track); }),
    } as unknown as MediaStream;
    const mesh = {
      setLocalStream: vi.fn(),
      republishLocalTracks: vi.fn(async () => undefined),
      renegotiateAll: vi.fn(async () => undefined),
    };
    const getUserMedia = vi.fn(async () => ({ getVideoTracks: () => [nextTrack] } as unknown as MediaStream));
    const previousDescriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    const controller = new CallSessionController({} as never, "token", {
      createMesh: () => mesh,
      createSFU: () => ({}),
    } as unknown as MediaEngineFactory);
    Object.assign(controller, { localStream: stream, sourceStream: stream, peerReady: true });

    try {
      await controller.toggleVideo(false);
      await controller.toggleVideo(true);

      expect(oldTrack.stop).toHaveBeenCalledOnce();
      expect(stream.removeTrack).toHaveBeenCalledWith(oldTrack);
      expect(stream.getVideoTracks()).toEqual([nextTrack]);
      expect(getUserMedia).toHaveBeenCalledWith({
        video: expect.objectContaining({
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        }),
      });
      expect(mesh.republishLocalTracks).toHaveBeenLastCalledWith();
    } finally {
      if (previousDescriptor) Object.defineProperty(navigator, "mediaDevices", previousDescriptor);
      else Reflect.deleteProperty(navigator, "mediaDevices");
    }
  });
});


describe("call speech sampling", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("stops speaking after silence and does not publish unchanged peer lists every frame", () => {
    vi.useFakeTimers();
    let frame: FrameRequestCallback = () => undefined;
    let amplitude = 32;
    const analyser = {
      fftSize: 256,
      getByteTimeDomainData: (data: Uint8Array) => { for (let i = 0; i < data.length; i++) data[i] = 128 + (i % 2 ? amplitude : -amplitude); },
      // Frequency energy can remain nonzero for a stationary background hum.
      getByteFrequencyData: (data: Uint8Array) => data.fill(20),
    };
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("AudioContext", class {
      state = "running";
      createMediaStreamSource() { return { connect() {} }; }
      createAnalyser() { return analyser; }
    });
    const controller = new CallSessionController({} as never, { } as never, {
      createMesh: () => ({}), createSFU: () => ({}),
    } as unknown as MediaEngineFactory);
    Object.assign(controller, { sourceStream: { getAudioTracks: () => [{ enabled: true, readyState: "live" }] } });
    const speaking = vi.fn();
    const peers = vi.fn();
    controller.onLocalSpeakingChange(speaking);
    controller.onPeerSpeakingUserIdsChange(peers);
    frame(0);
    expect(speaking).toHaveBeenLastCalledWith(true);
    amplitude = 0;
    frame(16);
    vi.advanceTimersByTime(1_000);
    frame(1_016);
    expect(speaking).toHaveBeenLastCalledWith(false);
    for (let n = 0; n < 60; n++) frame(1_032 + n * 16);
    expect(peers.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

it("does not reopen the SFU after leaving while its token request is pending", async () => {
  let deliver!: (response: Response) => void;
  vi.stubGlobal("fetch", () => new Promise<Response>((resolve) => { deliver = resolve; }));
  const sfu = { connect: vi.fn(), disconnect: vi.fn(async () => undefined) };
  const mesh = { stopAll() {}, setChatId() {}, setRoomId() {} };
  const controller = new CallSessionController({ connected: true, emit: vi.fn() } as never, "token", {
    createMesh: () => mesh, createSFU: () => sfu,
  } as unknown as MediaEngineFactory);
  controller.setRoomId("room-left");
  const joining = controller.switchToSfu();
  const generation = controller.sessionGeneration;
  await controller.cleanup(true);
  expect(controller.sessionGeneration).not.toBe(generation);
  deliver(new Response(JSON.stringify({ url: "wss://calls.example", token: "expired-session" })));
  await joining;
  expect(sfu.connect).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
describe("SFU participant updates", () => {
  it("connects once when promoting mesh and keeps SFU connected on participant updates", async () => {
    const connect = vi.fn(async () => undefined);
    const sfu = { connect, onDisconnected: undefined as (() => void) | undefined };
    const factory = { createMesh: () => ({ setRoomId: vi.fn(), stopAll: vi.fn() }), createSFU: () => sfu } as unknown as MediaEngineFactory;
    const controller = new CallSessionController({} as never, "token", factory);
    controller.setRoomId("room");
    controller.setTopology("sfu");
    Object.assign(controller, { mediaConnected: true });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ url: "wss://example.test", token: "test" }), { status: 200 }));
    try {
      await controller.switchToSfu();
      await controller.switchToSfu();
      expect(connect).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      sfu.onDisconnected?.();
      await controller.switchToSfu();
      expect(connect).toHaveBeenCalledTimes(2);
    } finally { fetchSpy.mockRestore(); }
  });
});
