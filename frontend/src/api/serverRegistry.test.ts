import { beforeEach, describe, expect, it } from "vitest";

import {
  getActiveServer,
  getSocketConfigForUrl,
  hashServerUrl,
  loadServerState,
  normalizeApiUrl,
  removeServerById,
  saveServerState,
  setActiveServerId,
  upsertServer
} from "./serverRegistry";

class MockStorage implements Storage {
  private store: Record<string, string> = {};
  get length() { return Object.keys(this.store).length; }
  clear() { this.store = {}; }
  getItem(key: string) { return this.store[key] ?? null; }
  key(index: number) { return Object.keys(this.store)[index] ?? null; }
  removeItem(key: string) { delete this.store[key]; }
  setItem(key: string, value: string) { this.store[key] = String(value); }
}

const mockStorage = new MockStorage();
if (typeof window === "undefined") {
  (global as any).window = { localStorage: mockStorage };
} else {
  Object.defineProperty(window, "localStorage", { value: mockStorage });
}

describe("serverRegistry", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("normalizes API URLs correctly", () => {
    expect(normalizeApiUrl("  https://stovo.mydomain.com/s/family/  ")).toBe("https://stovo.mydomain.com/s/family");
    expect(normalizeApiUrl("http://192.168.1.50:8000")).toBe("http://192.168.1.50:8000");
    expect(normalizeApiUrl("invalid-url")).toBeNull();
  });

  it("extracts Socket.IO origin and subpath correctly", () => {
    expect(getSocketConfigForUrl("https://stovo.mydomain.com/s/family")).toEqual({
      origin: "https://stovo.mydomain.com",
      path: "/s/family/socket.io"
    });

    expect(getSocketConfigForUrl("http://localhost:8000")).toEqual({
      origin: "http://localhost:8000",
      path: "/socket.io"
    });
  });

  it("migrates a legacy server without retaining its refresh token in a browser", () => {
    mockStorage.setItem("familyMessenger.apiUrl", "https://legacy.stovo.net");
    mockStorage.setItem("familyMessenger.refreshToken", "legacy-token-123");

    const state = loadServerState();
    expect(state.activeServerId).toBeTruthy();

    const activeServer = getActiveServer();
    expect(activeServer?.url).toBe("https://legacy.stovo.net");
    expect(activeServer?.refreshToken).toBeNull();
    expect(mockStorage.getItem("familyMessenger.refreshToken")).toBeNull();
  });

  it("removes the cluster redirector root from saved servers", () => {
    mockStorage.setItem("stovo.multiServerState", JSON.stringify({
      activeServerId: "redirector",
      servers: {
        redirector: { id: "redirector", url: "https://stovo-cloud.stovo.ru", name: "Wrong server", healthStatus: "online", unreadCount: 0 },
        cluster: { id: "cluster", url: "https://stovo-cloud.stovo.ru/s/5ae8bb18", name: "Stakhov Family", healthStatus: "online", unreadCount: 0 }
      }
    }));

    const state = loadServerState();
    expect(state.activeServerId).toBe("cluster");
    expect(state.servers.redirector).toBeUndefined();
    expect(getActiveServer()?.name).toBe("Stakhov Family");
  });

  it("supports adding and hot-swapping multiple servers", () => {
    const s1 = upsertServer({
      id: "srv_family",
      url: "https://stovo.mydomain.com/s/family",
      name: "Family Server",
      accessToken: "token-family",
      refreshToken: "refresh-family",
      healthStatus: "online",
      unreadCount: 0
    });

    const s2 = upsertServer({
      id: "srv_work",
      url: "https://stovo.mydomain.com/s/work",
      name: "Work Server",
      accessToken: "token-work",
      refreshToken: "refresh-work",
      healthStatus: "online",
      unreadCount: 2
    });

    expect(getActiveServer()?.id).toBe("srv_family");

    setActiveServerId("srv_work");
    expect(getActiveServer()?.id).toBe("srv_work");
    expect(getActiveServer()?.name).toBe("Work Server");
    expect(mockStorage.getItem("familyMessenger.apiUrl")).toBe("https://stovo.mydomain.com/s/work");
  });

  it("removes server and falls back to remaining server", () => {
    upsertServer({
      id: "s1",
      url: "https://s1.test",
      name: "S1",
      accessToken: null,
      refreshToken: null,
      healthStatus: "online",
      unreadCount: 0
    });
    upsertServer({
      id: "s2",
      url: "https://s2.test",
      name: "S2",
      accessToken: null,
      refreshToken: null,
      healthStatus: "online",
      unreadCount: 0
    });

    setActiveServerId("s1");
    removeServerById("s1");

    expect(getActiveServer()?.id).toBe("s2");
  });
});
