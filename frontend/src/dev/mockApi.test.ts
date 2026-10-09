import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthResponse } from "../api/auth";
import type { Family } from "../api/family";
import type { Chat, Message, MessageHistoryPage, PinnedMessage } from "../api/chats";
import { installMockApi, resetMockData } from "./mockApi";

const MOCK_ORIGIN = "http://127.0.0.1:5174";
const FIRST_CHAT_ID = "chat-planning-team";
const INITIAL_MESSAGE = "Kickoff notes are ready for review.";
let restoreMockApi: (() => void) | null = null;
let originalFetch: typeof fetch;

async function request<T>(path: string, init?: RequestInit): Promise<{ response: Response; body: T }> {
  const response = await fetch(`${MOCK_ORIGIN}${path}`, init);
  return { response, body: await response.json() as T };
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
  resetMockData();
  restoreMockApi = installMockApi({ origin: MOCK_ORIGIN });
});

afterEach(() => {
  restoreMockApi?.();
  restoreMockApi = null;
  vi.unstubAllGlobals();
});

describe("local mock chat API", () => {
  it("returns a refresh session for the synthetic Stovo Demo user", async () => {
    const { response, body } = await request<AuthResponse>("/api/auth/refresh", { method: "POST" });

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      accessToken: expect.any(String),
      tokenType: "Bearer",
      expiresInSeconds: expect.any(Number),
      user: { id: expect.any(String), displayName: "Stovo Demo" },
    });
  });

  it("serves typed overview and selected chat data for the real chats route", async () => {
    const [familyResponse, membersResponse, chatsResponse, detailResponse, historyResponse, pinsResponse, manifestResponse] = await Promise.all([
      request<Family>("/api/family"),
      request<Array<{ id: string; username: string; displayName: string; familyId: string; isActive: boolean; publicKey: string | null }>>("/api/family/members"),
      request<Chat[]>("/api/chats"),
      request<Chat>(`/api/chats/${FIRST_CHAT_ID}`),
      request<MessageHistoryPage>(`/api/chats/${FIRST_CHAT_ID}/messages?limit=50`),
      request<PinnedMessage[]>(`/api/chats/${FIRST_CHAT_ID}/pins`),
      request<{ profile: string; display_name: string; screens: { chats: boolean }; features: { end_to_end_encryption: boolean }; active_plugins: string[] }>("/api/v1/config/manifest"),
    ]);

    expect(familyResponse.body).toMatchObject({ id: expect.any(String), name: "Stovo Demo", minimizedChatLayout: expect.any(Boolean) });
    expect(membersResponse.body.length).toBeGreaterThanOrEqual(3);
    expect(membersResponse.body[0]).toMatchObject({ id: expect.any(String), username: expect.any(String), displayName: expect.any(String), familyId: expect.any(String), isActive: true, publicKey: null });
    expect(chatsResponse.body.map((chat) => chat.title)).toContain("Planning Team");
    expect(chatsResponse.body[0]).toMatchObject({ id: expect.any(String), familyId: expect.any(String), type: expect.stringMatching(/^(family|direct|group|channel)$/), members: expect.any(Array), unreadCount: expect.any(Number) });
    expect(detailResponse.body).toMatchObject({ id: FIRST_CHAT_ID, title: "Planning Team", type: "group", members: expect.any(Array) });
    expect(historyResponse.body).toMatchObject({ messages: expect.any(Array), nextBefore: expect.any(String), hasMore: false });
    expect(historyResponse.body.messages[0]).toMatchObject({ id: expect.any(String), chatId: FIRST_CHAT_ID, senderId: expect.any(String), type: "text", content: INITIAL_MESSAGE, statuses: expect.any(Array), reactions: expect.any(Array), attachments: expect.any(Array) });
    expect(pinsResponse.body).toEqual(expect.arrayContaining([
      expect.objectContaining({
        chatId: FIRST_CHAT_ID,
        messageId: expect.any(String),
        pinnedBy: expect.any(String),
        pinnedAt: expect.any(String),
        message: expect.objectContaining({ id: expect.any(String), chatId: FIRST_CHAT_ID }),
      }),
    ]));
    expect(manifestResponse.body).toMatchObject({ profile: "family", display_name: "Stovo Demo", screens: { chats: true }, features: { end_to_end_encryption: true }, active_plugins: expect.any(Array) });
  });

  it("marks a fixture message read and returns its updated message shape", async () => {
    const { response, body } = await request<Message>("/api/messages/msg-planning-kickoff/read", { method: "PATCH" });

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ id: "msg-planning-kickoff", chatId: FIRST_CHAT_ID, statuses: expect.any(Array) });
  });

  it("keeps sent messages in page memory and restores fixtures after reset", async () => {
    const sentText = "A local-only draft from the composer.";
    const sent = await request<Message>(`/api/chats/${FIRST_CHAT_ID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "text", content: sentText }),
    });
    const changedHistory = await request<MessageHistoryPage>(`/api/chats/${FIRST_CHAT_ID}/messages?limit=50`);

    expect(sent.response.status).toBe(201);
    expect(sent.body).toMatchObject({ chatId: FIRST_CHAT_ID, content: sentText, type: "text" });
    expect(changedHistory.body.messages.map((message) => message.content)).toContain(sentText);

    resetMockData();
    const baselineHistory = await request<MessageHistoryPage>(`/api/chats/${FIRST_CHAT_ID}/messages?limit=50`);
    expect(baselineHistory.body.messages.map((message) => message.content)).not.toContain(sentText);
    expect(baselineHistory.body.messages.map((message) => message.content)).toContain(INITIAL_MESSAGE);
  });

  it("returns unknown API routes locally without calling the previous fetch", async () => {
    restoreMockApi?.();
    restoreMockApi = null;
    const networkFetch = vi.fn().mockResolvedValue(new Response("network", { status: 404 }));
    vi.stubGlobal("fetch", networkFetch);
    restoreMockApi = installMockApi({ origin: MOCK_ORIGIN });

    const { response, body } = await request<{ error: string }>("/api/route-not-in-the-mock");

    expect(response.status).toBe(501);
    expect(body.error).toMatch(/not implemented/i);
    expect(networkFetch).not.toHaveBeenCalled();
  });

  it("restores the previous fetch implementation during cleanup", () => {
    const interceptedFetch = globalThis.fetch;
    expect(interceptedFetch).not.toBe(originalFetch);

    restoreMockApi?.();
    restoreMockApi = null;

    expect(globalThis.fetch).toBe(originalFetch);
  });
});
