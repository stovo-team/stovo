import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_DEVICE_PREFERENCES,
  isWithinQuietHours,
  readDevicePreferences,
  writeDevicePreferences
} from "./devicePreferences";

const memoryStorage = new Map<string, string>();

beforeEach(() => {
  memoryStorage.clear();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memoryStorage.get(key) ?? null,
      setItem: (key: string, value: string) => memoryStorage.set(key, value),
      removeItem: (key: string) => memoryStorage.delete(key),
      clear: () => memoryStorage.clear()
    }
  });
});

describe("device preferences", () => {
  it("uses quiet hours and notifications defaults for a new device", () => {
    expect(readDevicePreferences()).toEqual(DEFAULT_DEVICE_PREFERENCES);
  });

  it("persists a partial device preference update including language", () => {
    writeDevicePreferences({ messagePreview: false, quietHoursStart: "21:30", appLockEnabled: true, language: "ru" });

    expect(readDevicePreferences()).toMatchObject({
      messagePreview: false,
      quietHoursStart: "21:30",
      quietHoursEnd: "07:00",
      appLockEnabled: true,
      language: "ru"
    });
  });

  it("treats an overnight quiet-hours range as active across midnight", () => {
    expect(isWithinQuietHours("22:00", "07:00", new Date(2026, 0, 1, 23, 30))).toBe(true);
    expect(isWithinQuietHours("22:00", "07:00", new Date(2026, 0, 2, 6, 59))).toBe(true);
    expect(isWithinQuietHours("22:00", "07:00", new Date(2026, 0, 2, 12, 0))).toBe(false);
  });
});

