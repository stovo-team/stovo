import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false
  }
}));

import { getApiUrl, setApiUrlOverride } from "./client";

describe("getApiUrl", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });
  });

  it("uses the same origin for a browser-served local production build", () => {
    expect(getApiUrl()).toBe(window.location.origin);
  });

  it("returns the configured server URL with subpath support", () => {
    setApiUrlOverride("https://stovo-cloud.stovo.ru/server-setup");

    expect(getApiUrl()).toBe("https://stovo-cloud.stovo.ru/server-setup");
  });

  it("switches the active server when a member enters a non-cluster server address", () => {
    setApiUrlOverride("https://stovo-cloud.stovo.ru/s/old-family");
    setApiUrlOverride("https://family.example.com");

    expect(getApiUrl()).toBe("https://family.example.com");
  });
});
