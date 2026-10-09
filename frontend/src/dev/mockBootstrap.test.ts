import { beforeEach, describe, expect, it } from "vitest";
import { loadServerState } from "../api/serverRegistry";
import { isMockMode, seedMockSession } from "./mockBootstrap";

beforeEach(() => {
  localStorage.clear();
});

describe("local mock session bootstrap", () => {
  it("adds the demo account for the mock origin without replacing a normal dev account", () => {
    localStorage.setItem("stovo.multiServerState", JSON.stringify({
      activeServerId: "local-dev",
      servers: {
        "local-dev": {
          id: "local-dev",
          url: "https://dev.stovo.test",
          name: "Local Dev",
          addedAt: "2026-01-01T00:00:00.000Z",
          lastActiveAt: "2026-01-01T00:00:00.000Z",
          accessToken: null,
          refreshToken: null,
          user: null,
          healthStatus: "offline",
          unreadCount: 0,
        },
      },
    }));

    seedMockSession("http://127.0.0.1:5174");

    const state = loadServerState();
    const active = state.activeServerId ? state.servers[state.activeServerId] : null;
    expect(Object.values(state.servers).map((server) => server.url)).toContain("https://dev.stovo.test");
    expect(active).toMatchObject({ url: "http://127.0.0.1:5174", name: "Stovo Demo", user: { displayName: "Stovo Demo" } });
  });

  it("enables mock behavior only in Vite development mode named mock", () => {
    expect(isMockMode(true, "mock")).toBe(true);
    expect(isMockMode(true, "development")).toBe(false);
    expect(isMockMode(false, "mock")).toBe(false);
    expect(isMockMode(false, "production")).toBe(false);
  });
});
