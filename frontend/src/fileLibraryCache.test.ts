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
  loadCachedStorageItemsFromLocalStorage,
  saveCachedCanvasPreviews,
  saveCachedFileList,
  saveCachedStorageItems,
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

  it("restores every Storage section synchronously before its refresh request", async () => {
    const canvases = [{ id: "canvas-1", title: "Plan" }];
    const checklists = [{ id: "checklist-1", title: "Groceries" }];
    const collections = [{ id: "collection-1", title: "Docs" }];

    await saveCachedStorageItems("user-1", "canvases", canvases);
    await saveCachedStorageItems("user-1", "checklists", checklists);
    await saveCachedStorageItems("user-1", "collections", collections);

    expect(loadCachedStorageItemsFromLocalStorage<typeof canvases[number]>("user-1", "canvases")).toEqual(canvases);
    expect(loadCachedStorageItemsFromLocalStorage<typeof checklists[number]>("user-1", "checklists")).toEqual(checklists);
    expect(loadCachedStorageItemsFromLocalStorage<typeof collections[number]>("user-1", "collections")).toEqual(collections);
  });
});
