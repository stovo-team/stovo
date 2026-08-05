import { beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ native: false, name: "web" }));
const nativePlugin = vi.hoisted(() => ({
  isAvailable: vi.fn(async () => ({ available: true, biometrics: true, deviceCredential: true })),
  authenticate: vi.fn(async () => ({ authenticated: true }))
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => platform.native,
    getPlatform: () => platform.name
  },
  registerPlugin: () => nativePlugin
}));

import {
  authenticateAppLock,
  getAppLockAvailability,
  isAndroidAppLockAvailablePlatform
} from "./appLockPlugin";

describe("app lock plugin bridge", () => {
  beforeEach(() => {
    platform.native = false;
    platform.name = "web";
    nativePlugin.isAvailable.mockClear();
    nativePlugin.authenticate.mockClear();
  });

  it("is unavailable on web", async () => {
    expect(isAndroidAppLockAvailablePlatform()).toBe(false);
    await expect(getAppLockAvailability()).resolves.toEqual({
      available: false,
      biometrics: false,
      deviceCredential: false
    });
    expect(nativePlugin.isAvailable).not.toHaveBeenCalled();
  });

  it("is available on android native", async () => {
    platform.native = true;
    platform.name = "android";
    expect(isAndroidAppLockAvailablePlatform()).toBe(true);
    await expect(getAppLockAvailability()).resolves.toMatchObject({ available: true });
    await expect(authenticateAppLock()).resolves.toBe(true);
    expect(nativePlugin.authenticate).toHaveBeenCalled();
  });
});
