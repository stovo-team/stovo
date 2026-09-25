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
});
