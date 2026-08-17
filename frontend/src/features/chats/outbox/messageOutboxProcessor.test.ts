import { describe, expect, it, vi, beforeEach } from "vitest";
import { drainOutboxQueue, isNetworkError } from "./messageOutboxProcessor";
import {
  clearOutbox,
  enqueueOutboxMessage,
  getOutboxMessages,
  type QueuedOutboxMessage
} from "./messageOutboxStore";
import type { Chat } from "../../../api/chats";
import type { User } from "../../../api/auth";

vi.mock("../../../api/chats", () => ({
  sendMessage: vi.fn(),
  inferOptimisticMessageType: vi.fn()
}));

vi.mock("../../../api/files", () => ({
  uploadFile: vi.fn()
}));

vi.mock("../../../api/messageCrypto", () => ({
  encryptMessageContent: vi.fn((_chat, content) => Promise.resolve({ content, encryption: undefined })),
  decryptMessage: vi.fn((_chatId, msg) => Promise.resolve(msg))
}));

import { sendMessage } from "../../../api/chats";
import { uploadFile } from "../../../api/files";

describe("messageOutboxProcessor", () => {
  const mockUser: User = {
    id: "user-1",
    email: "user@test.com",
    displayName: "Test User",
    username: "testuser",
    role: "member",
    createdAt: new Date().toISOString()
  };

  const mockChat: Chat = {
    id: "chat-1",
    name: "General",
    type: "group",
    role: "member",
    unreadCount: 0,
    members: [],
    pinned: false,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    encryptionProtocol: "legacy_plaintext"
  };

  beforeEach(async () => {
    await clearOutbox();
    vi.clearAllMocks();
  });

  it("detects network errors accurately", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new TypeError("NetworkError when attempting to fetch resource"))).toBe(true);
    expect(isNetworkError({ status: 503 })).toBe(true);
    expect(isNetworkError({ status: 0 })).toBe(true);
    expect(isNetworkError(new Error("Network connection lost"))).toBe(true);
    expect(isNetworkError(new Error("Validation failed: Content is required"))).toBe(false);
  });

  it("drains queued messages and removes them on success", async () => {
    const queued: QueuedOutboxMessage = {
      id: "client-msg-1",
      clientMessageId: "client-msg-1",
      chatId: "chat-1",
      userId: "user-1",
      content: "Queued message content",
      replyToMessageId: null,
      threadRootMessageId: null,
      mentionedUserIds: [],
      attachments: [],
      createdAt: new Date().toISOString(),
      status: "queued",
      attemptCount: 0
    };
    await enqueueOutboxMessage(queued);

    vi.mocked(sendMessage).mockResolvedValueOnce({
      id: "server-msg-1",
      chatId: "chat-1",
      senderId: "user-1",
      type: "text",
      content: "Queued message content",
      encryptionProtocol: "legacy_plaintext",
      ciphertext: null,
      nonce: null,
      keyVersion: null,
      encryptionMetadata: null,
      replyToMessageId: null,
      threadRootMessageId: null,
      messageKind: "chat",
      createdAt: queued.createdAt,
      updatedAt: queued.createdAt,
      deletedAt: null,
      isEdited: false,
      forwardedFrom: null,
      statuses: [],
      reactions: [],
      attachments: []
    });

    const applyMessagesForChat = vi.fn();
    const onChatsUpdate = vi.fn();

    await drainOutboxQueue({
      accessToken: "mock-token",
      currentUser: mockUser,
      chats: [mockChat],
      applyMessagesForChat,
      onChatsUpdate
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "mock-token",
      "chat-1",
      "Queued message content",
      [],
      null,
      null,
      undefined,
      []
    );
    expect(applyMessagesForChat).toHaveBeenCalled();

    const remaining = await getOutboxMessages("user-1");
    expect(remaining).toHaveLength(0);
  });

  it("handles offline network error by retaining message in queue", async () => {
    const queued: QueuedOutboxMessage = {
      id: "client-msg-2",
      clientMessageId: "client-msg-2",
      chatId: "chat-1",
      userId: "user-1",
      content: "Offline message",
      replyToMessageId: null,
      threadRootMessageId: null,
      mentionedUserIds: [],
      attachments: [],
      createdAt: new Date().toISOString(),
      status: "queued",
      attemptCount: 0
    };
    await enqueueOutboxMessage(queued);

    vi.mocked(sendMessage).mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const applyMessagesForChat = vi.fn();

    await drainOutboxQueue({
      accessToken: "mock-token",
      currentUser: mockUser,
      chats: [mockChat],
      applyMessagesForChat
    });

    const remaining = await getOutboxMessages("user-1");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].status).toBe("queued");
    expect(remaining[0].attemptCount).toBe(1);
  });

  it("uploads pending attachments before sending message", async () => {
    const queued: QueuedOutboxMessage = {
      id: "client-msg-3",
      clientMessageId: "client-msg-3",
      chatId: "chat-1",
      userId: "user-1",
      content: "Message with photo",
      replyToMessageId: null,
      threadRootMessageId: null,
      mentionedUserIds: [],
      attachments: [
        {
          id: "local-att-1",
          name: "photo.jpg",
          mimeType: "image/jpeg",
          size: 1024,
          blob: new Blob(["fake-image"], { type: "image/jpeg" })
        }
      ],
      createdAt: new Date().toISOString(),
      status: "queued",
      attemptCount: 0
    };
    await enqueueOutboxMessage(queued);

    vi.mocked(uploadFile).mockResolvedValueOnce({
      id: "file-server-id-1",
      name: "photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
      url: "/api/files/file-server-id-1/download",
      chatId: "chat-1",
      uploaderUserId: "user-1",
      createdAt: queued.createdAt,
      durationSeconds: null
    });

    vi.mocked(sendMessage).mockResolvedValueOnce({
      id: "server-msg-3",
      chatId: "chat-1",
      senderId: "user-1",
      type: "image",
      content: "Message with photo",
      encryptionProtocol: "legacy_plaintext",
      ciphertext: null,
      nonce: null,
      keyVersion: null,
      encryptionMetadata: null,
      replyToMessageId: null,
      threadRootMessageId: null,
      messageKind: "chat",
      createdAt: queued.createdAt,
      updatedAt: queued.createdAt,
      deletedAt: null,
      isEdited: false,
      forwardedFrom: null,
      statuses: [],
      reactions: [],
      attachments: []
    });

    await drainOutboxQueue({
      accessToken: "mock-token",
      currentUser: mockUser,
      chats: [mockChat],
      applyMessagesForChat: vi.fn(),
      onChatsUpdate: vi.fn()
    });

    expect(uploadFile).toHaveBeenCalledWith("mock-token", expect.any(File), "chat-1");
    expect(sendMessage).toHaveBeenCalledWith(
      "mock-token",
      "chat-1",
      "Message with photo",
      ["file-server-id-1"],
      null,
      null,
      undefined,
      []
    );
  });
});
