import { afterEach, describe, expect, it, vi } from "vitest";
import MeshMediaEngine from "./MeshMediaEngine";

describe("MeshMediaEngine video quality", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("caps camera and screen-share senders separately when a peer is connected", async () => {
    const senders: Array<{ track: MediaStreamTrack; parameters: RTCRtpSendParameters; getParameters: ReturnType<typeof vi.fn>; setParameters: ReturnType<typeof vi.fn>; replaceTrack: ReturnType<typeof vi.fn> }> = [];
    class FakePeerConnection {
      addTrack(track: MediaStreamTrack) {
        const parameters = { encodings: [{}] } as RTCRtpSendParameters;
        const sender = {
          track, parameters,
          getParameters: vi.fn(() => parameters),
          setParameters: vi.fn(async () => undefined),
          replaceTrack: vi.fn(async (replacement: MediaStreamTrack) => { sender.track = replacement; }),
        };
        senders.push(sender);
        return sender as unknown as RTCRtpSender;
      }
      getSenders() { return senders as unknown as RTCRtpSender[]; }
      close() {}
    }
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    const socket = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
    const engine = new MeshMediaEngine(socket as never, "token");
    engine.setChatId("chat");
    engine.setLocalUserId("self");
    engine.setVideoBitrates({ cameraBitrateKbps: 2_100, screenShareBitrateKbps: 4_600 });
    const camera = { kind: "video", id: "camera" } as MediaStreamTrack;
    engine.setLocalStream({ getTracks: () => [camera], getAudioTracks: () => [], getVideoTracks: () => [camera] } as unknown as MediaStream);
    const screen = { kind: "video", id: "screen" } as MediaStreamTrack;
    await engine.setScreenTrack(screen, { id: "screen-stream" } as MediaStream);
    await engine.connectPeer("peer", false);

    expect(senders).toHaveLength(2);
    expect(senders[0].parameters.encodings[0].maxBitrate).toBe(2_100_000);
    expect(senders[1].parameters.encodings[0].maxBitrate).toBe(4_600_000);
    engine.stopAll();
  });
});
