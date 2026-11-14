import { describe, expect, it, vi } from "vitest";
import { fitPhotoDimensions, optimizeCameraPhoto, rotateNormalizedPoint } from "./PhotoEditor";

describe("photo editor image sizing and rotation", () => {
  it("bounds large images while preserving their aspect ratio", () => {
    expect(fitPhotoDimensions(12000, 8000)).toEqual({ width: 2048, height: 1365 });
    expect(fitPhotoDimensions(800, 400)).toEqual({ width: 800, height: 400 });
  });

  it.each([
    [0, { x: 0.2, y: 0.3 }],
    [90, { x: 0.7, y: 0.2 }],
    [180, { x: 0.8, y: 0.7 }],
    [270, { x: 0.3, y: 0.8 }]
  ] as const)("rotates a normalized point clockwise by %i degrees", (degrees, expected) => {
    expect(rotateNormalizedPoint({ x: 0.2, y: 0.3 }, degrees)).toEqual(expected);
  });

  it("compresses a large camera capture to a bounded JPEG before queueing", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 6000, height: 4000, close }));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["compressed"], { type: "image/jpeg" })));

    const source = new File([new Uint8Array(5 * 1024 * 1024)], "camera.heic", { type: "image/heic" });
    const result = await optimizeCameraPhoto(source);

    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("camera.jpg");
    expect(result.size).toBeLessThan(source.size);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2048, 1365);
    expect(close).toHaveBeenCalledOnce();
  });
});
