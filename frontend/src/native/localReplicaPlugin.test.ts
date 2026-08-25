import { beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ native: false, name: "web" }));
const nativePlugin = vi.hoisted(() => ({
  getStatus: vi.fn(async () => ({ supported: true, keyReady: true, schemaVersion: 0, replicaReady: false, migrationState: "scaffold" })),
  prepareProfile: vi.fn(async () => ({ supported: true, keyReady: true, schemaVersion: 0, replicaReady: false, migrationState: "scaffold" })),
  clearProfile: vi.fn(async () => ({ supported: true, keyReady: false, schemaVersion: 0, replicaReady: false, migrationState: "scaffold" })),
  getSyncCursor: vi.fn(async () => ({ cursor: "cursor-1", replicaReady: true })),
  listOperations: vi.fn(async () => ({ operations: [], replicaReady: true }))
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => platform.native,
    getPlatform: () => platform.name
  },
  registerPlugin: () => nativePlugin
}));

import {
  clearLocalReplicaProfile,
  getLocalReplicaStatus,
  getNativeReplicaSyncCursor,
  isAndroidLocalReplicaPlatform,
  listNativeReplicaOperations,
  prepareLocalReplicaProfile
} from "./localReplicaPlugin";

describe("local replica plugin bridge", () => {
  beforeEach(() => {
    platform.native = false;
    platform.name = "web";
    vi.clearAllMocks();
  });

  it("does not call the bridge on web", async () => {
    expect(isAndroidLocalReplicaPlatform()).toBe(false);
    await expect(getLocalReplicaStatus("user-1")).resolves.toMatchObject({ supported: false, replicaReady: false });
    await prepareLocalReplicaProfile("user-1");
    await clearLocalReplicaProfile("user-1");
    expect(nativePlugin.getStatus).not.toHaveBeenCalled();
  });

  it("prepares an Android profile without falsely enabling the replica", async () => {
    platform.native = true;
    platform.name = "android";
    await expect(prepareLocalReplicaProfile("user-1")).resolves.toMatchObject({ keyReady: true, replicaReady: false });
    expect(nativePlugin.prepareProfile).toHaveBeenCalledWith({ profileId: "user-1" });
  });

  it("keeps sync cursor and operation queue calls as no-ops while scaffolded", async () => {
    platform.native = true;
    platform.name = "android";

    await expect(getNativeReplicaSyncCursor("user-1")).resolves.toBeNull();
    await expect(listNativeReplicaOperations("user-1")).resolves.toEqual([]);
    expect(nativePlugin.getSyncCursor).not.toHaveBeenCalled();
    expect(nativePlugin.listOperations).not.toHaveBeenCalled();
  });
});
