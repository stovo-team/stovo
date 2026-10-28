import { beforeEach, describe, expect, it } from "vitest";
import { loadServerState } from "../api/serverRegistry";
import { DEMO_USER_ID } from "./mockFixtures";
import { getMockUserId, isMockMode, isMockSignedOut, prepareMockSession, resolveMockUserId, seedMockSession } from "./mockBootstrap";

beforeEach(() => {
  localStorage.clear();
});

describe("local mock session bootstrap", () => {
  it("recognizes the explicit signed-out visual fixture", () => {
    expect(isMockSignedOut("?mockSignedOut=1")).toBe(true);
    expect(isMockSignedOut("")).toBe(false);
  });
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

  it("allows a separate loopback preview port to run its own synchronized mock tabs", () => {
    expect(() => seedMockSession("http://127.0.0.1:5175", "user-alex-rivera")).not.toThrow();
    const state = loadServerState();
    expect(Object.values(state.servers).find((server) => server.url === "http://127.0.0.1:5175")).toMatchObject({
      url: "http://127.0.0.1:5175",
      user: { id: "user-alex-rivera", displayName: "Alex Rivera" },
    });
  });

  it("enables mock behavior only in Vite development mode named mock", () => {
    expect(isMockMode(true, "mock")).toBe(true);
    expect(isMockMode(true, "development")).toBe(false);
    expect(isMockMode(false, "mock")).toBe(false);
    expect(isMockMode(false, "production")).toBe(false);
  });

  it("keeps the selected demo identity in this tab's session", () => {
    const selectedUserId = resolveMockUserId("?mockUser=user-alex-rivera");

    seedMockSession("http://127.0.0.1:5174", selectedUserId);

    expect(getMockUserId()).toBe("user-alex-rivera");
    const state = loadServerState();
    expect(state.servers[state.activeServerId!]).toMatchObject({ user: { id: "user-alex-rivera", displayName: "Alex Rivera" } });
  });

  it("falls back to the default demo identity for unknown user IDs", () => {
    expect(resolveMockUserId("?mockUser=not-a-fixture-user")).toBe(DEMO_USER_ID);
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

  it("leaves a signed-out state for login page visual scenarios", async () => {
    window.history.replaceState({}, "", "/login?mockSignedOut=1");
    await prepareMockSession("http://127.0.0.1:5174");
    expect(loadServerState()).toEqual({ activeServerId: null, servers: {} });
    window.history.replaceState({}, "", "/");
  });
});
