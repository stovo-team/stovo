import { describe, expect, it, vi } from "vitest";
import CallSessionController from "./CallSessionController";
import type { MediaEngineFactory } from "./mediaEngineFactory";

describe("CallSessionController call quality", () => {
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
});
