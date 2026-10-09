import { hashServerUrl, setActiveServerId, upsertServer } from "../api/serverRegistry";
import { clearOutbox } from "../features/chats/outbox/messageOutboxStore";
import { createMockData, DEMO_USER_ID, MOCK_ORIGIN } from "./mockFixtures";

const MOCK_USER_SESSION_KEY = "stovo.localMockUserId";
const fixtureUsers = createMockData().users;

export function isMockMode(dev: boolean, mode: string): boolean {
  return dev && mode === "mock";
}

export function resolveMockUserId(search: string): string {
  const requestedUserId = new URLSearchParams(search).get("mockUser");
  return fixtureUsers.some((user) => user.id === requestedUserId) ? requestedUserId! : DEMO_USER_ID;
}

export function getMockUserId(): string {
  try {
    const selectedUserId = window.sessionStorage.getItem(MOCK_USER_SESSION_KEY);
    return fixtureUsers.some((user) => user.id === selectedUserId) ? selectedUserId! : DEMO_USER_ID;
  } catch {
    return DEMO_USER_ID;
  }
}

export function seedMockSession(origin: string, requestedUserId?: string): void {
  const normalizedOrigin = new URL(origin).origin;
  const expectedOrigin = new URL(MOCK_ORIGIN).origin;
  if (normalizedOrigin !== expectedOrigin) {
    throw new Error(`Local mock mode is bound to ${expectedOrigin}.`);
  }

  const selectedUserId = fixtureUsers.some((user) => user.id === requestedUserId)
    ? requestedUserId!
    : resolveMockUserId(window.location.search);
  const selectedUser = fixtureUsers.find((user) => user.id === selectedUserId)!;
  try {
    window.sessionStorage.setItem(MOCK_USER_SESSION_KEY, selectedUserId);
  } catch {}
  const server = upsertServer({
    id: hashServerUrl(normalizedOrigin),
    url: normalizedOrigin,
    name: "Stovo Demo",
    accessToken: null,
    refreshToken: null,
    user: structuredClone(selectedUser),
    healthStatus: "online",
    unreadCount: 0,
  });
  setActiveServerId(server.id);
}

export async function prepareMockSession(origin: string): Promise<void> {
  seedMockSession(origin, resolveMockUserId(window.location.search));
  await clearOutbox(getMockUserId());
}
