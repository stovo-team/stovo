import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  readAppearanceSettings
} from "./AppearanceContext";

describe("AppearanceContext default accent migration", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("defaults to brand amber accent when localStorage is empty", () => {
    const settings = readAppearanceSettings();
    expect(settings.accent).toBe("amber");
  });

  it("migrates legacy stored blue and rose accents to brand amber once", () => {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ accent: "blue", themeMode: "dark" })
    );

    const settings = readAppearanceSettings();
    expect(settings.accent).toBe("amber");
    expect(window.localStorage.getItem("familyMessenger.appearance.accentDefaultV3")).toBe("1");
  });

  it("respects user choice of blue after migration flag is set", () => {
    window.localStorage.setItem("familyMessenger.appearance.accentDefaultV3", "1");
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ accent: "blue", themeMode: "dark" })
    );

    const settings = readAppearanceSettings();
    expect(settings.accent).toBe("blue");
  });
});
