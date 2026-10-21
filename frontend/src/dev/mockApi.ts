import { mockCanvasResponse } from "./mockCanvas";
import type { AuthResponse } from "../api/auth";
import type { Chat, Message, MessageHistoryPage } from "../api/chats";
import { createMockData, createMockManifest } from "./mockFixtures";
import type { MockData } from "./mockFixtures";
import { getMockUserId } from "./mockBootstrap";
import { handleMockCanvasRequest, resetMockCanvases } from "./mockCanvasStore";
import {
  associateMockFileWithMessage,
  completeMockFileUpload,
  deleteMockFile,
  downloadMockFile,
  getMockFile,
  getMockFileUpload,
  listMockFiles,
  reserveMockFileUpload,
  seedMockPreviewFiles,
  transferMockFileUpload,
  updateMockFilePreferences,
} from "./mockFileStore";

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

resetMockCanvases(mockData.family.id, mockData.users[0]?.id);

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
const errorResponse = (status: number, detail: string): Response => jsonResponse({ detail }, status);

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

async function requestBlob(input: FetchInput, init?: RequestInit): Promise<Blob | null> {
  const body = init?.body ?? (typeof Request !== "undefined" && input instanceof Request ? input.body : null);
  if (typeof Blob !== "undefined" && body instanceof Blob) return body;
  if (typeof Request !== "undefined" && input instanceof Request) {
    try { return await input.clone().blob(); } catch { return null; }
  }
  return null;
}

async function blobResponse(blob: Blob, mimeType: string, fileName?: string): Promise<Response> {
  const headers = new Headers({
    "Content-Type": mimeType,
    "Cache-Control": "no-store",
  });
  if (fileName) headers.set("Content-Disposition", "attachment; filename*=UTF-8''" + encodeURIComponent(fileName));
  return new Response(await blob.arrayBuffer(), { status: 200, headers });
}

async function handleMockRequest(url: URL, method: string, input: FetchInput, init?: RequestInit): Promise<Response> {
  const path = decodeURI(url.pathname);
  if (method === "POST" && path === "/api/auth/refresh") return jsonResponse(responseForRefresh());
  if (method === "GET" && path === "/api/auth/setup-status") {
    return jsonResponse({ setupRequired: false, setupComplete: true, familyName: mockData.family.name, navTabs: mockData.family.navTabs });
  }
  if (path.startsWith("/api/v1/plugins/canvas/")) return mockCanvasResponse(path, method, mockData.family.id, getMockUserId(), await requestBody(input, init));
  if (method === "GET" && path === "/api/family") {
    return jsonResponse(mockData.family);
  }
  if (method === "GET" && path === "/api/family/members") {
    return jsonResponse(mockData.users);
  }
  if (method === "GET" && path === "/api/plans") return jsonResponse([]);
  if (method === "GET" && path === "/api/family/roles") return jsonResponse([]);
  if (method === "GET" && path === "/api/v1/config/manifest") return jsonResponse(createMockManifest());
  if (method === "GET" && path === "/api/chats") return jsonResponse(mockData.chats);
  const canvasResponse = await handleMockCanvasRequest(
    path,
    method,
    () => requestBody(input, init),
    {
      chats: mockData.chats,
      familyId: mockData.family.id,
      userId: getMockUserId(),
    }
  );
  if (canvasResponse) return canvasResponse;

  if (method === "GET" && path === "/api/collections") return jsonResponse([]);
  if (method === "GET" && path === "/api/files") { await seedMockPreviewFiles(mockData.family.id, getMockUserId()); return jsonResponse(await listMockFiles()); }

  if (method === "POST" && path === "/api/files/uploads") {
    const body = await requestBody(input, init);
    const originalName = typeof body.originalName === "string" ? body.originalName.trim() : "";
    const mimeType = typeof body.mimeType === "string" && body.mimeType ? body.mimeType : "application/octet-stream";
    const sizeBytes = typeof body.sizeBytes === "number" ? body.sizeBytes : -1;
    if (!originalName || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
      return errorResponse(422, "A file name and non-negative file size are required.");
    }
    const chatId = typeof body.chatId === "string" ? body.chatId : null;
    const chat = chatId ? mockData.chats.find((item) => item.id === chatId) : null;
    if (chatId && !chat) return errorResponse(404, "Mock chat not found.");
    const idempotencyKey = new Headers(
      init?.headers ?? (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined),
    ).get("Idempotency-Key");
    let upload;
    try {
      upload = await reserveMockFileUpload({
        originalName,
        mimeType,
        sizeBytes,
        checksum: typeof body.checksum === "string" ? body.checksum : null,
        idempotencyKey,
        chatId,
        uploadedBy: getMockUserId(),
        familyId: mockData.family.id,
        chatTitle: chat?.title ?? null,
        chatType: chat?.type ?? null,
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Idempotency key")) {
        return errorResponse(409, error.message);
      }
      throw error;
    }
    return jsonResponse(upload, 201);
  }

  const transferMatch = path.match(/^\/api\/files\/uploads\/([^/]+)\/content$/);
  if (method === "PUT" && transferMatch) {
    const blob = await requestBlob(input, init);
    if (!blob) return errorResponse(400, "Local file transfer did not include a file body.");
    const transferred = await transferMockFileUpload(transferMatch[1], blob);
    return transferred ? new Response(null, { status: 204 }) : errorResponse(409, "Upload reservation is missing or file size does not match.");
  }

  const completeUploadMatch = path.match(/^\/api\/files\/uploads\/([^/]+)\/complete$/);
  if (method === "POST" && completeUploadMatch) {
    const upload = await completeMockFileUpload(completeUploadMatch[1]);
    return upload ? jsonResponse(upload) : errorResponse(409, "Transfer the complete file before finishing this upload.");
  }

  const uploadStatusMatch = path.match(/^\/api\/files\/uploads\/([^/]+)$/);
  if (method === "GET" && uploadStatusMatch) {
    const upload = await getMockFileUpload(uploadStatusMatch[1]);
    return upload ? jsonResponse(upload) : errorResponse(404, "Mock upload not found.");
  }

  const directAccessMatch = path.match(/^\/api\/files\/([^/]+)\/access$/);
  if (method === "POST" && directAccessMatch) {
    const file = await getMockFile(directAccessMatch[1]);
    return file
      ? jsonResponse({
        fileId: file.id,
        url: "/api/files/" + encodeURIComponent(file.id) + "/download",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        checksum: file.checksum ?? undefined,
      })
      : errorResponse(404, "Mock file not found.");
  }

  const playbackTokenMatch = path.match(/^\/api\/files\/([^/]+)\/playback-token$/);
  if (method === "POST" && playbackTokenMatch) {
    const file = await getMockFile(playbackTokenMatch[1]);
    return file
      ? jsonResponse({ token: "local-mock-playback-" + file.id, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() })
      : errorResponse(404, "Mock file not found.");
  }

  const downloadMatch = path.match(/^\/api\/files\/([^/]+)\/download$/);
  if (method === "GET" && downloadMatch) {
    const [file, blob] = await Promise.all([getMockFile(downloadMatch[1]), downloadMockFile(downloadMatch[1])]);
    return file && blob ? await blobResponse(blob, file.mimeType, file.originalName) : errorResponse(404, "Mock file not found.");
  }

  const filePreferencesMatch = path.match(/^\/api\/files\/([^/]+)\/preferences$/);
  if (method === "PATCH" && filePreferencesMatch) {
    const body = await requestBody(input, init);
    const preferences = typeof body.isFavorite === "boolean" ? { isFavorite: body.isFavorite } : {};
    const file = await updateMockFilePreferences(filePreferencesMatch[1], preferences);
    return file ? jsonResponse(file) : errorResponse(404, "Mock file not found.");
  }

  const fileMatch = path.match(/^\/api\/files\/([^/]+)$/);
  if (fileMatch) {
    if (method === "GET") {
      const file = await getMockFile(fileMatch[1]);
      return file ? jsonResponse(file) : errorResponse(404, "Mock file not found.");
    }
    if (method === "DELETE") {
      const deleted = await deleteMockFile(fileMatch[1]);
      return deleted ? new Response(null, { status: 204 }) : errorResponse(404, "Mock file not found.");
    }
  }

  const mediaMatch = path.match(/^\/api\/media\/([^/]+)$/);
  if (method === "GET" && mediaMatch) {
    const [file, blob] = await Promise.all([getMockFile(mediaMatch[1]), downloadMockFile(mediaMatch[1])]);
    return file && blob ? await blobResponse(blob, file.mimeType) : errorResponse(404, "Mock file not found.");
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
      const fileIds = Array.isArray(body.fileIds) ? [...new Set(body.fileIds.filter((id): id is string => typeof id === "string"))] : [];
      const messageId = "msg-local-" + nextLocalMessageId;
      const attachments = (await Promise.all(fileIds.map((fileId) =>
        associateMockFileWithMessage(fileId, chat, messageId),
      ))).filter((file): file is NonNullable<typeof file> => file !== null);
      const message: Message = {
        id: `msg-local-${nextLocalMessageId++}`,
        chatId,
        senderId: currentUserId,
        senderDisplayName: mockData.users.find((user) => user.id === currentUserId)?.displayName ?? "Stovo Demo",
        type: body.type === "mixed" || attachments.length ? "mixed" : "text",
        content,
        encryptionProtocol: "legacy_plaintext",
        ciphertext: null, nonce: null, keyVersion: null, encryptionMetadata: null,
        replyToMessageId: typeof body.replyToMessageId === "string" ? body.replyToMessageId : null,
        threadRootMessageId: typeof body.threadRootMessageId === "string" ? body.threadRootMessageId : null,
        messageKind: body.threadRootMessageId ? "thread" : "chat",
        createdAt: sentAt, updatedAt: sentAt, deletedAt: null, isEdited: false, forwardedFrom: null,
        statuses: [{ userId: currentUserId, status: "sent", createdAt: sentAt }],
        reactions: [],
        attachments,
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

  const attachFilesMatch = path.match(/^\/api\/messages\/([^/]+)\/attachments$/);
  if (method === "POST" && attachFilesMatch) {
    const message = findMessage(attachFilesMatch[1]);
    if (!message) return errorResponse(404, "Mock message not found.");
    const chat = mockData.chats.find((item) => item.id === message.chatId);
    if (!chat) return errorResponse(404, "Mock chat not found.");
    const body = await requestBody(input, init);
    const fileIds = Array.isArray(body.fileIds) ? [...new Set(body.fileIds.filter((id): id is string => typeof id === "string"))] : [];
    const attachments = (await Promise.all(fileIds.map((fileId) =>
      associateMockFileWithMessage(fileId, chat, message.id),
    ))).filter((file): file is NonNullable<typeof file> => file !== null);
    message.attachments = [...message.attachments, ...attachments.filter((file) =>
      !message.attachments.some((existing) => existing.id === file.id),
    )];
    if (message.attachments.length) message.type = "mixed";
    message.updatedAt = new Date().toISOString();
    return jsonResponse(message);
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
  resetMockCanvases(mockData.family.id, mockData.users[0]?.id, false);
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
