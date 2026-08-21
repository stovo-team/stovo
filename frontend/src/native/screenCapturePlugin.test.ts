import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRegisterPlugin = vi.fn();
const mockIsNativePlatform = vi.fn(() => true);
const mockGetPlatform = vi.fn(() => "android");

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
});
