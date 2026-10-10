import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ native: false }));
const cacheMocks = vi.hoisted(() => ({
  save: vi.fn(async () => undefined),
  load: vi.fn(async () => null),
}));
vi.mock("./apiResponseCache", () => ({
  deduplicateRequest: (_profileId: string | null | undefined, _endpoint: string, factory: () => Promise<unknown>) => factory(),
  loadApiResponseCache: cacheMocks.load,
  saveApiResponseCache: cacheMocks.save,
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => platform.native
  },
  registerPlugin: () => ({})
}));

import { apiRequest, getApiUrl, getClusterPath, getClusterPrefix, isServerUrlConfigured, setApiUrlOverride, storeApiUrlFromInviteLink } from "./client";
import { getActiveServer } from "./serverRegistry";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("returns the routed cluster without mutating the server registry", () => {
    window.history.replaceState({}, "", "/s/5ae8bb18/app/chats");

    expect(getApiUrl()).toBe(`${window.location.origin}/s/5ae8bb18`);
    expect(getActiveServer()).toBeNull();
  });

  it("ignores an API destination supplied by an invite query in the browser", () => {
    window.history.replaceState({}, "", "/invite/inv-123?apiUrl=https%3A%2F%2Fevil.example");

    expect(storeApiUrlFromInviteLink(window.location.search)).toBeNull();
    expect(getApiUrl()).toBe(window.location.origin);
    expect(storage.get("familyMessenger.apiUrl")).toBeUndefined();
  });
});

describe("apiRequest Intelligence cache policy", () => {
  beforeEach(() => {
    cacheMocks.save.mockClear();
    cacheMocks.load.mockClear();
  });

  it("does not cache no-store v2 consent or connection responses in local API caches", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ connections: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/v2/intelligence/connections", { accessToken: "synthetic-session" });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(cacheMocks.save).not.toHaveBeenCalled();
    expect(cacheMocks.load).not.toHaveBeenCalled();
  });
});

describe("isServerUrlConfigured", () => {
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

  it("treats cluster routes as a configured server without prior active server in registry", () => {
    window.history.replaceState({}, "", "/s/5ae8bb18");

    expect(getClusterPrefix()).toBe("/s/5ae8bb18");
    expect(getClusterPath("/app/chats/chat-123")).toBe("/s/5ae8bb18/app/chats/chat-123");
    expect(isServerUrlConfigured()).toBe(true);
  });

  it("preserves the active cluster when building a chat path from the root app route", () => {
    setApiUrlOverride("https://stovo-cloud.stovo.ru/s/5ae8bb18", "Stakhov Family");

    expect(getClusterPath("/app/chats/chat-123")).toBe("/s/5ae8bb18/app/chats/chat-123");
  });

  it("returns false for root without active server", () => {
    window.history.replaceState({}, "", "/");

    expect(isServerUrlConfigured()).toBe(false);
  });
});
