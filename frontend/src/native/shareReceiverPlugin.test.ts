import { beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ native: true, name: "android" }));
const nativePlugin = vi.hoisted(() => ({
  consumePendingShares: vi.fn(),
  releasePendingShares: vi.fn()
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => platform.native,
    getPlatform: () => platform.name,
    convertFileSrc: (path: string) => path
  },
  registerPlugin: () => nativePlugin
}));

import { consumeNativeSharedFiles } from "./shareReceiverPlugin";

describe("share receiver plugin", () => {
  beforeEach(() => {
    platform.native = true;
    platform.name = "android";
    nativePlugin.consumePendingShares.mockReset();
    nativePlugin.releasePendingShares.mockReset();
    nativePlugin.releasePendingShares.mockResolvedValue(undefined);
  });

  it("turns received Android share URLs into Files and releases their native cache entries", async () => {
    nativePlugin.consumePendingShares.mockResolvedValue({
      files: [
        {
          id: "share-1",
          path: "http://localhost/_capacitor_file_/cache/share-1.pdf",
          name: "receipt.pdf",
          mimeType: "application/pdf",
          sizeBytes: 3
        }
      ],
      skippedCount: 1
    });
    const fetcher = vi.fn().mockResolvedValue(
      new Response("pdf", { headers: { "Content-Type": "application/pdf" } })
    );

    const received = await consumeNativeSharedFiles(fetcher);

    expect(received.skippedCount).toBe(1);
    expect(received.files).toHaveLength(1);
    expect(received.files[0].name).toBe("receipt.pdf");
    expect(received.files[0].type).toBe("application/pdf");
    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost/_capacitor_file_/cache/share-1.pdf"
    );
    expect(nativePlugin.releasePendingShares).toHaveBeenCalledWith({ ids: ["share-1"] });
  });

  it("does nothing outside the Android Capacitor app", async () => {
    platform.native = false;

    await expect(consumeNativeSharedFiles()).resolves.toEqual({ files: [], skippedCount: 0 });
    expect(nativePlugin.consumePendingShares).not.toHaveBeenCalled();
  });

  it("keeps files usable when native cache cleanup fails", async () => {
    nativePlugin.consumePendingShares.mockResolvedValue({
      files: [{ id: "share-2", path: "file:///cache/photo.jpg", name: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 1 }],
      skippedCount: 0
    });
    nativePlugin.releasePendingShares.mockRejectedValue(new Error("cleanup failed"));

    const received = await consumeNativeSharedFiles(
      vi.fn().mockResolvedValue(new Response("x", { headers: { "Content-Type": "image/jpeg" } }))
    );

    expect(received.files).toHaveLength(1);
    expect(received.skippedCount).toBe(0);
  });
});
