import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockRegisterPlugin = vi.fn();
const mockIsNativePlatform = vi.fn(() => true);
const mockGetPlatform = vi.fn(() => "android");
let originalCaptureStreamDescriptor: PropertyDescriptor | undefined;

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => mockIsNativePlatform(),
    getPlatform: () => mockGetPlatform(),
  },
  registerPlugin: (...args: unknown[]) => mockRegisterPlugin(...args),
}));

describe("screenCapturePlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockIsNativePlatform.mockReturnValue(true);
    mockGetPlatform.mockReturnValue("android");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalCaptureStreamDescriptor) {
      Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", originalCaptureStreamDescriptor);
    } else {
      Reflect.deleteProperty(HTMLCanvasElement.prototype, "captureStream");
    }
    originalCaptureStreamDescriptor = undefined;
  });

  it("identifies native screen capture availability on Android", async () => {
    mockIsNativePlatform.mockReturnValue(true);
    mockGetPlatform.mockReturnValue("android");

    const { isNativeScreenCaptureAvailable } = await import("./screenCapturePlugin");
    expect(isNativeScreenCaptureAvailable()).toBe(true);
  });

  it("returns false on web or non-android platforms", async () => {
    mockIsNativePlatform.mockReturnValue(false);
    mockGetPlatform.mockReturnValue("web");

    const { isNativeScreenCaptureAvailable } = await import("./screenCapturePlugin");
    expect(isNativeScreenCaptureAvailable()).toBe(false);
  });

  it("keeps the permission-pending flag set until Android grants capture, then cleans up the generated track", async () => {
    let finishPermission!: (result: { width: number; height: number }) => void;
    const removeFrameListener = vi.fn(async () => undefined);
    const removeStoppedListener = vi.fn(async () => undefined);
    const stop = vi.fn(async () => ({ active: false }));
    const nativePlugin = {
      start: vi.fn(() => new Promise((resolve) => { finishPermission = resolve; })),
      stop,
      addListener: vi.fn(async (eventName: string) => ({
        remove: eventName === "screenFrame" ? removeFrameListener : removeStoppedListener,
      })),
    };
    mockRegisterPlugin.mockReturnValue(nativePlugin);

    const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
    let onTrackEnded: (() => void) | undefined;
    const track = {
      addEventListener: vi.fn((_event: string, listener: () => void) => { onTrackEnded = listener; }),
      stop: vi.fn(),
    };
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
    originalCaptureStreamDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "captureStream");
    Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {
      configurable: true,
      value: vi.fn(() => stream),
    });

    const { createNativeScreenCaptureStream, isNativeScreenCapturePermissionPending } = await import("./screenCapturePlugin");
    const pendingStream = createNativeScreenCaptureStream();
    expect(isNativeScreenCapturePermissionPending()).toBe(true);

    finishPermission({ width: 640, height: 360 });
    await expect(pendingStream).resolves.toBe(stream);
    expect(isNativeScreenCapturePermissionPending()).toBe(false);
    expect(track.addEventListener).toHaveBeenCalledWith("ended", expect.any(Function));

    onTrackEnded?.();
    await Promise.resolve();
    expect(removeFrameListener).toHaveBeenCalledOnce();
    expect(removeStoppedListener).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it("clears the permission-pending flag when the user denies capture", async () => {
    let denyPermission!: (reason: Error) => void;
    const nativePlugin = {
      start: vi.fn(() => new Promise((_resolve, reject) => { denyPermission = reject; })),
      stop: vi.fn(),
      addListener: vi.fn(),
    };
    mockRegisterPlugin.mockReturnValue(nativePlugin);
    const { createNativeScreenCaptureStream, isNativeScreenCapturePermissionPending } = await import("./screenCapturePlugin");

    const pendingStream = createNativeScreenCaptureStream();
    expect(isNativeScreenCapturePermissionPending()).toBe(true);
    denyPermission(new Error("Screen capture permission was denied by user"));
    await expect(pendingStream).rejects.toThrow("permission was denied");
    expect(isNativeScreenCapturePermissionPending()).toBe(false);
  });
});
