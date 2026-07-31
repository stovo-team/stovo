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

  it("ignores a saved browser URL with a route path", () => {
    setApiUrlOverride("https://stovo-cloud.stovo.ru/server-setup");

    expect(getApiUrl()).toBe(window.location.origin);
  });
});
