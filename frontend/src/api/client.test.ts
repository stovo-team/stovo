import { beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ native: false }));
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => platform.native
  }
}));

import { getApiUrl, setApiUrlOverride } from "./client";
import { getActiveServer } from "./serverRegistry";

describe("getApiUrl", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    platform.native = false;
    window.history.replaceState({}, "", "/");
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

  it("keeps the remote family API URL after native navigation to its visual route", () => {
    setApiUrlOverride("https://stovo-cloud.stovo.ru/s/5ae8bb18", "Stakhov Family");
    platform.native = true;
    window.history.replaceState({}, "", "/s/5ae8bb18/app/chats");

    expect(getApiUrl()).toBe("https://stovo-cloud.stovo.ru/s/5ae8bb18");
  });

  it("uses the family name returned by the server instead of its URL hash", () => {
    setApiUrlOverride("https://stovo-cloud.stovo.ru/s/5ae8bb18", "Stakhov Family");

    expect(getActiveServer()?.name).toBe("Stakhov Family");
  });

  it("registers the routed cluster instead of its root redirector", () => {
    window.history.replaceState({}, "", "/s/5ae8bb18/app/chats");

    expect(getApiUrl()).toBe(`${window.location.origin}/s/5ae8bb18`);
    expect(getActiveServer()?.url).toBe(`${window.location.origin}/s/5ae8bb18`);
  });
});
