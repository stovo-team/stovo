import { describe, expect, it, vi } from "vitest";
import type { Socket } from "socket.io-client";
import type { MediaEngineFactory, MeshMediaEnginePort, SFUMediaEnginePort } from "./mediaEngineFactory";

describe("MediaEngineFactory", () => {
  it("allows topology-specific engines to be injected", () => {
    const mesh = {} as MeshMediaEnginePort;
    const sfu = {} as SFUMediaEnginePort;
    const factory: MediaEngineFactory = {
      createMesh: vi.fn(() => mesh),
      createSFU: vi.fn(() => sfu),
    };

    expect(factory.createMesh({} as Socket, "token")).toBe(mesh);
    expect(factory.createSFU()).toBe(sfu);
  });
});
