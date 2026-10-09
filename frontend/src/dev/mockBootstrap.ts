import { hashServerUrl, setActiveServerId, upsertServer } from "../api/serverRegistry";
import { clearOutbox } from "../features/chats/outbox/messageOutboxStore";
import { DEMO_USER_ID, demoUser, MOCK_ORIGIN } from "./mockFixtures";

export function isMockMode(dev: boolean, mode: string): boolean {
  return dev && mode === "mock";
}

export function seedMockSession(origin: string): void {
  const normalizedOrigin = new URL(origin).origin;
  const expectedOrigin = new URL(MOCK_ORIGIN).origin;
  if (normalizedOrigin !== expectedOrigin) {
    throw new Error(`Local mock mode is bound to ${expectedOrigin}.`);
  }

  const server = upsertServer({
    id: hashServerUrl(normalizedOrigin),
    url: normalizedOrigin,
    name: "Stovo Demo",
    accessToken: null,
    refreshToken: null,
    user: structuredClone(demoUser),
    healthStatus: "online",
    unreadCount: 0,
  });
  setActiveServerId(server.id);
}

export async function prepareMockSession(origin: string): Promise<void> {
  seedMockSession(origin);
  await clearOutbox(DEMO_USER_ID);
}
