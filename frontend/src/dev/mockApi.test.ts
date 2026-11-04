import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/client";
import type { AuthResponse } from "../api/auth";
import type { FamilyFile } from "../api/files";
import type { Family } from "../api/family";
import type { Chat, Message, MessageHistoryPage, PinnedMessage } from "../api/chats";
import { sendMessage } from "../api/chats";
import { appendCanvasDocumentUpdate, createCanvas, getCanvas, getCanvasDocument, getStorageCanvases, renameCanvas } from "../api/canvas";
import { deleteFile, downloadFileBlob, getFile, getFiles, uploadFile, updateFilePreferences } from "../api/files";
import { resetMockFileStore } from "./mockFileStore";
import { installMockApi, resetMockData } from "./mockApi";
import { seedMockSession } from "./mockBootstrap";

const MOCK_ORIGIN = "http://127.0.0.1:5174";
const FIRST_CHAT_ID = "chat-planning-team";
const INITIAL_MESSAGE = "Kickoff notes are ready for review.";
let restoreMockApi: (() => void) | null = null;
let originalFetch: typeof fetch;

async function request<T>(path: string, init?: RequestInit): Promise<{ response: Response; body: T }> {
  const response = await fetch(`${MOCK_ORIGIN}${path}`, init);
  return { response, body: await response.json() as T };
}

beforeEach(async () => {
  originalFetch = globalThis.fetch;
  resetMockData();
  await resetMockFileStore();
  restoreMockApi = installMockApi({ origin: MOCK_ORIGIN });
});

afterEach(() => {
  restoreMockApi?.();
  restoreMockApi = null;
  vi.unstubAllGlobals();
});

describe("local mock chat API", () => {
  it("starts without an automatic family chat and saves chat avatar choices", async () => {
    seedMockSession(MOCK_ORIGIN);
    const chats = await request<Chat[]>("/api/chats");
    expect(chats.body.some((chat) => chat.type === "family" || chat.title === "Family Hub")).toBe(false);
    const saved = await request<Chat>(`/api/chats/${FIRST_CHAT_ID}`, { method: "PATCH", body: JSON.stringify({ avatarMode: "symbol", avatarSymbolId: "briefcase", avatarColorId: "#786a91" }) });
    expect(saved.response.status).toBe(200);
    const loaded = await request<Chat>(`/api/chats/${FIRST_CHAT_ID}`);
    expect(loaded.body).toMatchObject({ avatarSymbolId: "briefcase", avatarColorId: "#786a91" });
  });
  it("provides a safe Intelligence consent offer with distinct archive records", async () => {
    seedMockSession(MOCK_ORIGIN);
    const query = new URLSearchParams({
      client_id: "local-intelligence-client",
      redirect_uri: "https://intelligence.example/callback",
      state: "local-consent-state",
    });
    const { response, body } = await request<{
      client_id: string;
      redirect_uri: string;
      state: string;
      chats: Array<{ id: string; title: string; type: string }>;
      grants: Record<string, boolean>;
    }>(`/api/v2/intelligence/authorize?${query.toString()}`);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      client_id: "local-intelligence-client",
      redirect_uri: "https://intelligence.example/callback",
      state: "local-consent-state",
      chats: [
        { id: "archive-a-001", title: "Message Archive", type: "archive" },
        { id: "archive-b-002", title: "Message Archive", type: "archive" },
      ],
      grants: { read: false, process: false, external_transfer: false, export: false },
    });
  });
  it("lists a seeded canvas and returns its document", async () => {
    seedMockSession(MOCK_ORIGIN);
    const canvases = await getStorageCanvases("local-mock-access-token");

    expect(canvases).toEqual([expect.objectContaining({
      id: "mock-canvas-planning",
      familyId: expect.any(String),
      originChatId: FIRST_CHAT_ID,
      title: "Planning Notes",
      linkedChatIds: [],
      canManage: true,
    })]);
    await expect(getCanvasDocument("local-mock-access-token", "mock-canvas-planning")).resolves.toEqual({ updates: [] });
  });

  it("creates a canvas and appends document updates in sequence", async () => {
    seedMockSession(MOCK_ORIGIN);
    const created = await createCanvas("local-mock-access-token", FIRST_CHAT_ID, "Test Canvas", "initial-update");
    const loaded = await getCanvas("local-mock-access-token", created.id);
    const appended = await appendCanvasDocumentUpdate("local-mock-access-token", created.id, "second-update");
    const document = await getCanvasDocument("local-mock-access-token", created.id);

    expect(loaded).toMatchObject({ id: created.id, originChatId: FIRST_CHAT_ID, title: "Test Canvas" });
    expect(appended).toMatchObject({ sequence: 2, update: "second-update" });
    expect(document.updates.map(({ sequence, update }) => ({ sequence, update }))).toEqual([
      { sequence: 1, update: "initial-update" },
      { sequence: 2, update: "second-update" },
    ]);
  });

  it("renames a canvas and reset restores the seeded canvas", async () => {
    seedMockSession(MOCK_ORIGIN);
    const created = await createCanvas("local-mock-access-token", FIRST_CHAT_ID, "Temporary Canvas");
    const renamed = await renameCanvas("local-mock-access-token", created.id, "Renamed Canvas");

    expect(renamed.title).toBe("Renamed Canvas");
    resetMockData();

    await expect(getCanvas("local-mock-access-token", created.id)).rejects.toMatchObject({ status: 404 });
    await expect(getStorageCanvases("local-mock-access-token")).resolves.toEqual([
      expect.objectContaining({ id: "mock-canvas-planning", title: "Planning Notes" }),
    ]);
  });

  it("returns an empty plans collection so the mock Plans page renders without an API error", async () => {
    const { response, body } = await request<unknown[]>("/api/plans?start=2026-10-17T00%3A00%3A00.000Z&end=2026-10-18T00%3A00%3A00.000Z");
    expect(response.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("provides ephemeral preview files without an upload", async () => {
    const { response, body } = await request<FamilyFile[]>("/api/files");

    expect(response.status).toBe(200);
    expect(body.map((file) => file.originalName)).toEqual([
      "Storage preview photo.svg",
      "Storage preview video.webm",
      "Storage preview report.pdf",
      "Storage preview notes.md",
    ]);

    const markdownResponse = await fetch(`${MOCK_ORIGIN}/api/files/${body[3].id}/download`);
    await expect(markdownResponse.text()).resolves.toContain("# Storage preview notes");
    const pdfResponse = await fetch(`${MOCK_ORIGIN}/api/files/${body[2].id}/download`);
    const pdf = await pdfResponse.text();
    expect(pdf).toContain("xref\n0 6");
    expect(pdf).toContain("Storage preview demo");
    await expect(request<unknown[]>("/api/collections").then((result) => result.body)).resolves.toEqual([
      expect.objectContaining({ id: "mock-storage-preview-folder", title: "Storage preview folder", displayKind: "folder", itemCount: 1, accessLevel: "editor" }),
    ]);
    await expect(request<unknown[]>("/api/family/roles").then((result) => result.body)).resolves.toEqual([]);
  });

  it("opens the demo folder with its PDF and removes the file through the mock API", async () => {
    const files = await request<FamilyFile[]>("/api/files");
    expect(files.body.map((file) => file.id)).toContain("mock-storage-preview-report");

    const folderItems = await request<FamilyFile[]>("/api/collections/mock-storage-preview-folder/items");
    expect(folderItems.response.status).toBe(200);
    expect(folderItems.body).toEqual([expect.objectContaining({ id: "mock-storage-preview-report", originalName: "Storage preview report.pdf" })]);

    const removeResponse = await fetch(`${MOCK_ORIGIN}/api/collections/mock-storage-preview-folder/items/mock-storage-preview-report`, { method: "DELETE" });
    expect(removeResponse.status).toBe(204);
    await expect(request<FamilyFile[]>("/api/collections/mock-storage-preview-folder/items").then((result) => result.body)).resolves.toEqual([]);
  });

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

  it("uploads, attaches, shares, downloads, favorites, and deletes a local file", async () => {
    seedMockSession(MOCK_ORIGIN, "user-alex-rivera");
    const uploaded = await uploadFile(
      "local-mock-access-token",
      new File(["A local attachment for the planning chat."], "meeting-notes.txt", { type: "text/plain" }),
      FIRST_CHAT_ID,
      "upload-planning-notes",
    );

    expect(uploaded).toMatchObject({
      uploadedBy: "user-alex-rivera",
      chatId: FIRST_CHAT_ID,
      chatTitle: "Planning Team",
      originalName: "meeting-notes.txt",
      mimeType: "text/plain",
      sizeBytes: 41,
      storageProvider: "local",
    });

    seedMockSession(MOCK_ORIGIN, "user-maya-chen");
    const listed = await getFiles("local-mock-access-token");
    expect(listed.map((file) => file.id)).toContain(uploaded.id);

    const downloaded = await downloadFileBlob("local-mock-access-token", uploaded.id);
    await expect(downloaded.text()).resolves.toBe("A local attachment for the planning chat.");

    const attachedMessage = await sendMessage("local-mock-access-token", FIRST_CHAT_ID, "See the notes.", [uploaded.id]);
    expect(attachedMessage).toMatchObject({
      type: "mixed",
      attachments: [expect.objectContaining({ id: uploaded.id, originMessageId: expect.any(String) })],
    });

    const favorited = await updateFilePreferences("local-mock-access-token", uploaded.id, { isFavorite: true });
    expect(favorited.isFavorite).toBe(true);
    await deleteFile("local-mock-access-token", uploaded.id);
    await expect(getFile("local-mock-access-token", uploaded.id)).rejects.toMatchObject({ status: 404 });
    await expect(getFiles("local-mock-access-token")).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "mock-storage-preview-photo" }),
      expect.objectContaining({ id: "mock-storage-preview-video" }),
      expect.objectContaining({ id: "mock-storage-preview-report" }),
      expect.objectContaining({ id: "mock-storage-preview-notes" }),
    ]));
  });

  it("uses the tab-selected fixture user for refresh and sent messages", async () => {
    seedMockSession(MOCK_ORIGIN, "user-alex-rivera");

    const refreshed = await request<AuthResponse>("/api/auth/refresh", { method: "POST" });
    const sent = await request<Message>("/api/chats/" + FIRST_CHAT_ID + "/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "text", content: "Sent as Alex." }),
    });

    expect(refreshed.body.user).toMatchObject({ id: "user-alex-rivera", displayName: "Alex Rivera" });
    expect(sent.body).toMatchObject({ senderId: "user-alex-rivera", senderDisplayName: "Alex Rivera" });
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

    const { response, body } = await request<{ detail: string }>("/api/route-not-in-the-mock");

    expect(response.status).toBe(501);
    expect(body.detail).toMatch(/not implemented/i);
    expect(networkFetch).not.toHaveBeenCalled();
  });

  it("accepts a direct file upload reservation in local mock storage", async () => {
    const response = await fetch(`${MOCK_ORIGIN}/api/files/uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalName: "meeting-notes.txt", mimeType: "text/plain", sizeBytes: 12 }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      uploadId: expect.any(String),
      fileId: expect.any(String),
      state: "reserved",
      expectedMimeType: "text/plain",
      expectedSizeBytes: 12,
    });
  });

  it("preserves the mock route explanation through the real API client", async () => {
    seedMockSession(MOCK_ORIGIN);

    await expect(apiRequest("/api/route-not-in-the-mock")).rejects.toMatchObject({
      status: 501,
      message: "Mock API route not implemented: GET /api/route-not-in-the-mock",
    });
  });

  it("does not install a second fetch wrapper when mock bootstrap runs again", () => {
    const installedFetch = globalThis.fetch;

    installMockApi({ origin: MOCK_ORIGIN });

    expect(globalThis.fetch).toBe(installedFetch);
  });

  it("restores the previous fetch implementation during cleanup", () => {
    const interceptedFetch = globalThis.fetch;
    expect(interceptedFetch).not.toBe(originalFetch);

    restoreMockApi?.();
    restoreMockApi = null;

    expect(globalThis.fetch).toBe(originalFetch);
  });

  it("reuses upload reservations for matching idempotency keys and rejects mismatched retries", async () => {
    const headers = { "Content-Type": "application/json", "Idempotency-Key": "same-local-operation" };
    const body = JSON.stringify({ originalName: "meeting-notes.txt", mimeType: "text/plain", sizeBytes: 12 });
    const first = await fetch(MOCK_ORIGIN + "/api/files/uploads", { method: "POST", headers, body });
    const firstReservation = await first.json() as { uploadId: string };
    const retry = await fetch(MOCK_ORIGIN + "/api/files/uploads", { method: "POST", headers, body });
    const retryReservation = await retry.json() as { uploadId: string };
    const conflict = await fetch(MOCK_ORIGIN + "/api/files/uploads", {
      method: "POST",
      headers,
      body: JSON.stringify({ originalName: "different.txt", mimeType: "text/plain", sizeBytes: 12 }),
    });

    expect(firstReservation.uploadId).toBe(retryReservation.uploadId);
    expect(conflict.status).toBe(409);
  });

  it("rejects a transfer whose byte count does not match its reservation", async () => {
    const reserved = await fetch(MOCK_ORIGIN + "/api/files/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalName: "expected.txt", mimeType: "text/plain", sizeBytes: 12 }),
    });
    const reservation = await reserved.json() as { uploadId: string; uploadUrl: string };
    const transferred = await fetch(MOCK_ORIGIN + reservation.uploadUrl, {
      method: "PUT",
      body: new Blob(["too short"]),
    });
    const completed = await fetch(MOCK_ORIGIN + "/api/files/uploads/" + reservation.uploadId + "/complete", {
      method: "POST",
    });

    expect(transferred.status).toBe(409);
    expect(completed.status).toBe(409);
  });

  it("accepts and downloads an empty local file", async () => {
    seedMockSession(MOCK_ORIGIN);
    const uploaded = await uploadFile(
      "local-mock-access-token",
      new File([], "empty.txt", { type: "text/plain" }),
      null,
      "upload-empty-file",
    );
    const response = await fetch(MOCK_ORIGIN + "/api/files/" + uploaded.id + "/download");

    expect(uploaded.sizeBytes).toBe(0);
    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  });
});

describe('deterministic visual history scenarios', () => {
  it('provides an empty history only in the explicitly installed mock scenario', async () => {
    restoreMockApi?.();
    restoreMockApi = installMockApi({ origin: MOCK_ORIGIN, scenario: 'empty' });
    const { body } = await request<MessageHistoryPage>(`/api/chats/${FIRST_CHAT_ID}/messages`);
    expect(body.messages).toEqual([]);
  });
  it('exposes a recoverable history error without forwarding a real request', async () => {
    restoreMockApi?.();
    restoreMockApi = installMockApi({ origin: MOCK_ORIGIN, scenario: 'history-error' });
    expect((await request(`/api/chats/${FIRST_CHAT_ID}/messages`)).response.status).toBe(503);
    expect((await request('/api/dev/visual/recover', { method: 'POST' })).response.status).toBe(200);
    expect((await request<MessageHistoryPage>(`/api/chats/${FIRST_CHAT_ID}/messages`)).body.messages.length).toBeGreaterThan(0);
  });
  it('keeps a loading request pending until aborted', async () => {
    restoreMockApi?.();
    restoreMockApi = installMockApi({ origin: MOCK_ORIGIN, scenario: 'loading' });
    const abort = new AbortController();
    const pending = fetch(`${MOCK_ORIGIN}/api/chats/${FIRST_CHAT_ID}/messages`, { signal: abort.signal });
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
