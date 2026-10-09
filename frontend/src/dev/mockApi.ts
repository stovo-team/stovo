import type { AuthResponse } from "../api/auth";
import type { Chat, Message, MessageHistoryPage } from "../api/chats";
import { createMockData, createMockManifest } from "./mockFixtures";
import type { MockData } from "./mockFixtures";
import { getMockUserId } from "./mockBootstrap";

const MOCK_API_STATE_KEY = Symbol.for("stovo.localMockApi.installation");
type FetchInput = RequestInfo | URL;
type MockApiInstallation = {
  origin: string;
  previousFetch: typeof fetch;
  wrappedFetch: typeof fetch;
  cleanup: () => void;
};
type GlobalWithMockApi = typeof globalThis & { [MOCK_API_STATE_KEY]?: MockApiInstallation };

const mockGlobal = globalThis as GlobalWithMockApi;
let mockData: MockData = createMockData();
let nextLocalMessageId = 1;

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function errorResponse(status: number, detail: string): Response {
  return jsonResponse({ detail }, status);
}

function findMessage(messageId: string): Message | undefined {
  return Object.values(mockData.messages).flat().find((message) => message.id === messageId);
}

function responseForRefresh(): AuthResponse {
  const currentUserId = getMockUserId();
  return {
    accessToken: "local-mock-access-token",
    tokenType: "Bearer",
    expiresInSeconds: 3600,
    user: structuredClone(mockData.users.find((user) => user.id === currentUserId)!),
  };
}

async function requestBody(input: FetchInput, init?: RequestInit): Promise<Record<string, unknown>> {
  const body = init?.body ?? (typeof Request !== "undefined" && input instanceof Request ? await input.clone().text() : null);
  if (typeof body !== "string" || body.length === 0) return {};
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function handleMockRequest(url: URL, method: string, input: FetchInput, init?: RequestInit): Promise<Response> {
  const path = decodeURI(url.pathname);
  if (method === "POST" && path === "/api/auth/refresh") {
    return jsonResponse(responseForRefresh());
  }
  if (method === "GET" && path === "/api/auth/setup-status") {
    return jsonResponse({ setupRequired: false, setupComplete: true, familyName: mockData.family.name, navTabs: mockData.family.navTabs });
  }
  if (method === "GET" && path === "/api/family") {
    return jsonResponse(mockData.family);
  }
  if (method === "GET" && path === "/api/family/members") {
    return jsonResponse(mockData.users);
  }
  if (method === "GET" && path === "/api/v1/config/manifest") {
    return jsonResponse(createMockManifest());
  }
  if (method === "GET" && path === "/api/chats") {
    return jsonResponse(mockData.chats);
  }

  const chatMessageMatch = path.match(/^\/api\/chats\/([^/]+)\/messages$/);
  if (chatMessageMatch) {
    const chatId = chatMessageMatch[1];
    if (!mockData.chats.some((chat) => chat.id === chatId)) return errorResponse(404, "Mock chat not found.");
    if (method === "GET") {
      const allMessages = mockData.messages[chatId] ?? [];
      const before = url.searchParams.get("before");
      const filtered = before ? allMessages.filter((message) => message.createdAt < before) : allMessages;
      const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
      const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50;
      const pageMessages = filtered.slice(-limit);
      const page: MessageHistoryPage = {
        messages: pageMessages,
        nextBefore: pageMessages[0]?.createdAt ?? "",
        hasMore: false,
      };
      return jsonResponse(page);
    }
    if (method === "POST") {
      const body = await requestBody(input, init);
      const chat = mockData.chats.find((item) => item.id === chatId)!;
      const sentAt = new Date().toISOString();
      const currentUserId = getMockUserId();
      const content = typeof body.content === "string" ? body.content : null;
      const message: Message = {
        id: `msg-local-${nextLocalMessageId++}`,
        chatId,
        senderId: currentUserId,
        senderDisplayName: mockData.users.find((user) => user.id === currentUserId)?.displayName ?? "Stovo Demo",
        type: body.type === "mixed" ? "mixed" : "text",
        content,
        encryptionProtocol: "legacy_plaintext",
        ciphertext: null,
        nonce: null,
        keyVersion: null,
        encryptionMetadata: null,
        replyToMessageId: typeof body.replyToMessageId === "string" ? body.replyToMessageId : null,
        threadRootMessageId: typeof body.threadRootMessageId === "string" ? body.threadRootMessageId : null,
        messageKind: body.threadRootMessageId ? "thread" : "chat",
        createdAt: sentAt,
        updatedAt: sentAt,
        deletedAt: null,
        isEdited: false,
        forwardedFrom: null,
        statuses: [{ userId: currentUserId, status: "sent", createdAt: sentAt }],
        reactions: [],
        attachments: [],
        ...(typeof body.clientMessageId === "string" ? { clientMessageId: body.clientMessageId } : {}),
      };
      mockData.messages[chatId] = [...(mockData.messages[chatId] ?? []), message];
      chat.lastMessageId = message.id;
      chat.lastMessageSenderId = currentUserId;
      chat.lastMessageSenderDisplayName = message.senderDisplayName;
      chat.lastMessageContent = content;
      chat.lastMessageType = message.type;
      chat.lastMessageCreatedAt = sentAt;
      chat.updatedAt = sentAt;
      return jsonResponse(message, 201);
    }
  }

  const pinsMatch = path.match(/^\/api\/chats\/([^/]+)\/pins$/);
  if (method === "GET" && pinsMatch) {
    return jsonResponse(mockData.pins[pinsMatch[1]] ?? []);
  }

  const readMessageMatch = path.match(/^\/api\/messages\/([^/]+)\/read$/);
  if (method === "PATCH" && readMessageMatch) {
    const message = findMessage(readMessageMatch[1]);
    if (!message) return errorResponse(404, "Mock message not found.");
    const currentUserId = getMockUserId();
    const existing = message.statuses.find((status) => status.userId === currentUserId);
    const readAt = new Date().toISOString();
    if (existing) {
      existing.status = "read";
      existing.createdAt = readAt;
    } else {
      message.statuses.push({ userId: currentUserId, status: "read", createdAt: readAt });
    }
    return jsonResponse(message);
  }

  if (method === "PATCH" && path === "/api/auth/me") {
    const body = await requestBody(input, init);
    const publicKey = typeof body.publicKey === "string" ? body.publicKey : null;
    const currentUserId = getMockUserId();
    const currentUser = mockData.users.find((user) => user.id === currentUserId)!;
    currentUser.publicKey = publicKey;
    for (const chat of mockData.chats) {
      for (const member of chat.members) {
        if (member.id === currentUserId) member.publicKey = publicKey;
      }
    }
    return jsonResponse(currentUser);
  }

  const chatDetailMatch = path.match(/^\/api\/chats\/([^/]+)$/);
  if (method === "GET" && chatDetailMatch) {
    const chat = mockData.chats.find((item) => item.id === chatDetailMatch[1]);
    return chat ? jsonResponse(chat) : errorResponse(404, "Mock chat not found.");
  }

  return errorResponse(501, `Mock API route not implemented: ${method} ${path}`);
}

export function resetMockData(): void {
  mockData = createMockData();
  nextLocalMessageId = 1;
}

export function installMockApi(options: { origin?: string } = {}): () => void {
  const origin = new URL(options.origin ?? window.location.origin).origin;
  const existing = mockGlobal[MOCK_API_STATE_KEY];
  if (existing?.origin === origin && globalThis.fetch === existing.wrappedFetch) {
    return existing.cleanup;
  }
  if (existing) existing.cleanup();

  const previousFetch = globalThis.fetch;
  const wrappedFetch: typeof fetch = async (input: FetchInput, init?: RequestInit): Promise<Response> => {
    let url: URL;
    try {
      const rawUrl = typeof Request !== "undefined" && input instanceof Request ? input.url : String(input);
      url = new URL(rawUrl, origin);
    } catch {
      return previousFetch(input, init);
    }
    const isApiPath = url.pathname === "/api" || url.pathname.startsWith("/api/");
    if (url.origin !== origin || !isApiPath) return previousFetch(input, init);
    const method = (init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
    return handleMockRequest(url, method, input, init);
  };

  const installation: MockApiInstallation = {
    origin,
    previousFetch,
    wrappedFetch,
    cleanup: () => {
      if (mockGlobal[MOCK_API_STATE_KEY] !== installation) return;
      if (globalThis.fetch === wrappedFetch) globalThis.fetch = previousFetch;
      delete mockGlobal[MOCK_API_STATE_KEY];
    },
  };
  mockGlobal[MOCK_API_STATE_KEY] = installation;
  globalThis.fetch = wrappedFetch;
  return installation.cleanup;
}
