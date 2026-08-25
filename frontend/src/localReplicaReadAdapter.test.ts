import { describe, expect, it, vi } from "vitest";

import { createMigrationSafeReadAdapter, type LocalReplicaReadAdapter, type ReplicaMigrationStore } from "./localReplicaReadAdapter";

type Message = { id: string; body: string };
type Chat = { id: string; title: string };

function store(): LocalReplicaReadAdapter<Chat, Message> {
  return {
    loadChats: vi.fn(async () => [{ id: "legacy", title: "Legacy" }]),
    saveChats: vi.fn(async () => undefined),
    loadMessages: vi.fn(async () => [{ id: "legacy-message", body: "Legacy" }]),
    saveMessages: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined)
  };
}

function nativeStore(ready: boolean): ReplicaMigrationStore<Chat, Message> {
  return {
    ...store(),
    isReady: vi.fn(async () => ready)
  };
}

describe("migration-safe local replica adapter", () => {
  it("uses the legacy cache when the native replica is not ready", async () => {
    const legacy = store();
    const native = nativeStore(false);
    const adapter = createMigrationSafeReadAdapter(legacy, native);

    await expect(adapter.loadChats("user-1")).resolves.toEqual([{ id: "legacy", title: "Legacy" }]);
    expect(legacy.loadChats).toHaveBeenCalledWith("user-1");
    expect(native.loadChats).not.toHaveBeenCalled();
  });

  it("falls back when a ready native replica has no migrated value", async () => {
    const legacy = store();
    const native = nativeStore(true);
    vi.mocked(native.loadChats).mockResolvedValue(null);
    const adapter = createMigrationSafeReadAdapter(legacy, native);

    await expect(adapter.loadChats("user-1")).resolves.toEqual([{ id: "legacy", title: "Legacy" }]);
    expect(native.loadChats).toHaveBeenCalledWith("user-1");
    expect(legacy.loadChats).toHaveBeenCalledWith("user-1");
  });

  it("clears both stores during account cleanup", async () => {
    const legacy = store();
    const native = nativeStore(true);
    const adapter = createMigrationSafeReadAdapter(legacy, native);

    await adapter.clear("user-1");
    expect(native.clear).toHaveBeenCalledWith("user-1");
    expect(legacy.clear).toHaveBeenCalledWith("user-1");
  });
});
