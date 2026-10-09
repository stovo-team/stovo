import { beforeEach, describe, expect, it } from "vitest";
import { loadServerState } from "../api/serverRegistry";
import { DEMO_USER_ID } from "./mockFixtures";
import { isMockMode, prepareMockSession, seedMockSession } from "./mockBootstrap";

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

  it("clears only the demo account outbox before starting the mock session", async () => {
    const demoQueueKey = "stovo_outbox_queue_" + DEMO_USER_ID;
    const otherQueueKey = "stovo_outbox_queue_local-dev";
    localStorage.setItem(demoQueueKey, JSON.stringify([{ id: "scheduled-demo" }]));
    localStorage.setItem(otherQueueKey, JSON.stringify([{ id: "unrelated-dev-message" }]));

    await prepareMockSession("http://127.0.0.1:5174");

    expect(localStorage.getItem(demoQueueKey)).toBeNull();
    expect(localStorage.getItem(otherQueueKey)).toBe(JSON.stringify([{ id: "unrelated-dev-message" }]));
    const state = loadServerState();
    expect(state.servers[state.activeServerId!]).toMatchObject({ user: { displayName: "Stovo Demo" } });
  });
});
