import { beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ native: true, name: "android" }));
const nativePlugin = vi.hoisted(() => ({
  listMedia: vi.fn(),
  copyMedia: vi.fn()
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => platform.native,
    getPlatform: () => platform.name,
    convertFileSrc: (path: string) => `webview://${path}`
  },
  registerPlugin: () => nativePlugin
}));

import { isNativeMediaLibraryAvailable, selectNativeMediaFiles } from "./mediaLibraryPlugin";

describe("media library plugin", () => {
  beforeEach(() => {
    platform.native = true;
    platform.name = "android";
    vi.clearAllMocks();
  });

  it("is only available on Android native builds", () => {
    expect(isNativeMediaLibraryAvailable()).toBe(true);
    platform.name = "ios";
    expect(isNativeMediaLibraryAvailable()).toBe(false);
    platform.name = "android";
    platform.native = false;
    expect(isNativeMediaLibraryAvailable()).toBe(false);
  });

  it("copies selected media into uploadable Files", async () => {
    nativePlugin.copyMedia.mockResolvedValue({
      files: [{ path: "file:///cache/photo.jpg", name: "photo.jpg", mimeType: "image/jpeg" }]
    });
    const fetcher = vi.fn().mockResolvedValue(new Response(new Blob(["photo"], { type: "image/jpeg" })));

    const files = await selectNativeMediaFiles(["42"], fetcher);

    expect(nativePlugin.copyMedia).toHaveBeenCalledWith({ ids: ["42"] });
    expect(fetcher).toHaveBeenCalledWith("webview://file:///cache/photo.jpg");
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ name: "photo.jpg", type: "image/jpeg" });
  });
});
