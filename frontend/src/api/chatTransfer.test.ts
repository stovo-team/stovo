import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getApiUrl } from "./client";
import { commitChatImport, getChatExportSource } from "./chatTransfer";

describe("chat transfer API", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads only the selected chat's export source and keeps E2E content ciphertext-only", async () => {
    const responseBody = {
      chatId: "chat-1",
      messages: [
        {
          id: "message-1",
          encryptionProtocol: "end_to_end",
          ciphertext: "ciphertext-value",
          nonce: "nonce-value",
          encryptionMetadata: "{\"wrappedKeys\":{\"user-1\":\"wrapped-key\"}}",
          content: null
        }
      ],
      attachments: []
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    }));

    await expect(getChatExportSource("access-token", "chat/one"))
      .resolves.toEqual(responseBody);

    const [target, init] = fetchMock.mock.calls[0];
    expect(String(target)).toBe(getApiUrl() + "/api/chats/chat%2Fone/transfer-source");
    expect(init?.method ?? "GET").toBe("GET");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer access-token");
    expect(JSON.stringify(init?.body ?? "")).not.toContain("ciphertext-value");
  });

  it("commits one canonical source archive with a retry-stable idempotency key", async () => {
    const archive = {
      schemaVersion: 1,
      source: { providerId: "telegram", profileId: "telegram-desktop-json" },
      conversation: { sourceId: "source-chat", title: "Planning" },
      participants: [{ sourceId: "source-user", displayName: "Mira" }],
      messages: [{ sourceId: "source-message", authorId: "source-user", timestamp: "2026-10-10T08:00:00Z", kind: "text", text: "Hello" }],
      attachments: [],
      warnings: []
    };
    const createdChat = { id: "new-archive-chat", type: "archive", title: "Imported: Planning" };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(createdChat), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(commitChatImport("access-token", archive, "import-job-1")).resolves.toEqual(createdChat);

    const [target, init] = fetchMock.mock.calls[0];
    expect(String(target)).toBe(getApiUrl() + "/api/chat-imports");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer access-token");
    expect(headers.get("Idempotency-Key")).toBe("import-job-1");
    expect(JSON.parse(String(init?.body))).toEqual({ archive });
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("targetChatId");
  });

  it("does not put the selected chat ID or access token in the URL", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "new-chat", type: "archive" }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    }));
    await commitChatImport("secret-access-token", { schemaVersion: 1 }, "job-2");

    const [target] = fetchMock.mock.calls[0];
    expect(String(target)).not.toContain("secret-access-token");
    expect(new URL(String(target)).search).toBe("");
  });

  it("encodes attachment bytes as base64 for the Go archive API", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "new-chat" }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    }));
    const archive = {
      schemaVersion: 1,
      attachments: [{ id: "file-1", path: "attachments/file.txt", filename: "file.txt", mimeType: "text/plain", size: 3, bytes: new Uint8Array([1, 2, 3]) }]
    } as never;
    await commitChatImport("access-token", archive, "job-bytes");

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body)).archive.attachments[0].bytes).toBe("AQID");
  });
});
