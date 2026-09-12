import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nativeReplica = vi.hoisted(() => ({
  load: vi.fn(async () => null),
  save: vi.fn(async () => false),
}));

vi.mock("./native/localReplicaPlugin", () => ({
  isAndroidLocalReplicaPlatform: () => true,
  loadNativeReplicaValue: nativeReplica.load,
  saveNativeReplicaValue: nativeReplica.save,
}));

import {
  loadCachedCanvasPreviews,
  loadCachedFileList,
  saveCachedCanvasPreviews,
  saveCachedFileList,
} from "./fileLibraryCache";

describe("file-library WebView cache", () => {
  const originalIndexedDB = globalThis.indexedDB;

  beforeEach(() => {
    localStorage.clear();
    nativeReplica.load.mockResolvedValue(null);
    nativeReplica.save.mockResolvedValue(false);
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: originalIndexedDB });
  });

  it("uses localStorage when the Android replica is not ready", async () => {
    const files = [{ id: "file-1", originalName: "photo.jpg" }];

    await saveCachedFileList("user-1", files);

    expect(localStorage.getItem("stovo_cached_files_user-1")).toBe(JSON.stringify(files));
    nativeReplica.load.mockClear();
    await expect(loadCachedFileList<typeof files[number]>("user-1")).resolves.toEqual(files);
    expect(nativeReplica.load).not.toHaveBeenCalled();
  });

  it("persists canvas preview metadata in localStorage for WebView startup", async () => {
    const previews = {
      "canvas-1": { updatedAt: "2026-09-12T12:00:00Z", updates: [{ id: "update-1" }] },
    };

    await saveCachedCanvasPreviews("user-1", previews);

    expect(localStorage.getItem("stovo_cached_canvas_previews_user-1")).toBe(JSON.stringify(previews));
    nativeReplica.load.mockClear();
    await expect(loadCachedCanvasPreviews<{ id: string }>("user-1")).resolves.toEqual(previews);
    expect(nativeReplica.load).not.toHaveBeenCalled();
  });
});
