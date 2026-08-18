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

import { fetchNativeMediaFileUrl, isNativeMediaLibraryAvailable, nativeMediaPreviewUrl, selectNativeMediaFiles } from "./mediaLibraryPlugin";

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
    const fetcher = vi.fn().mockResolvedValue(new Response("photo", { headers: { "Content-Type": "image/jpeg" } }));

    const files = await selectNativeMediaFiles(["42"], fetcher);

    expect(nativePlugin.copyMedia).toHaveBeenCalledWith({ ids: ["42"] });
    expect(fetcher).toHaveBeenCalledWith("webview://file:///cache/photo.jpg");
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ name: "photo.jpg", type: "image/jpeg" });
  });

  it("fetches full resolution native media file url", async () => {
    nativePlugin.copyMedia.mockResolvedValue({
      files: [{ path: "file:///cache/highres-photo.jpg", name: "highres-photo.jpg", mimeType: "image/jpeg" }]
    });

    const url = await fetchNativeMediaFileUrl("42");

    expect(nativePlugin.copyMedia).toHaveBeenCalledWith({ ids: ["42"] });
    expect(url).toBe("webview://file:///cache/highres-photo.jpg");
  });

  it("uses a Capacitor-safe URL for native gallery previews", () => {
    expect(nativeMediaPreviewUrl({ id: "1", uri: "content://media/image/1", name: "photo.jpg", mimeType: "image/jpeg", durationMs: 0, thumbnailPath: "file:///cache/preview.jpg" })).toBe("webview://file:///cache/preview.jpg");
  });
});
