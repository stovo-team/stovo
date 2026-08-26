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
      [],
      false,
      "client-msg-1"
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

    expect(uploadFile).toHaveBeenCalledWith(
      "mock-token",
      expect.any(File),
      "chat-1",
      "local-att-1",
      "user-1"
    );
    expect(sendMessage).toHaveBeenCalledWith(
      "mock-token",
      "chat-1",
      "Message with photo",
      ["file-server-id-1"],
      null,
      null,
      undefined,
      [],
      false,
      "client-msg-3"
    );
  });

  it("skips scheduled message if scheduledFor is in the future", async () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const scheduledMsg: QueuedOutboxMessage = {
      id: "client-scheduled-1",
      clientMessageId: "client-scheduled-1",
      chatId: "chat-1",
      userId: "user-1",
      content: "Future scheduled message",
      replyToMessageId: null,
      threadRootMessageId: null,
      mentionedUserIds: [],
      attachments: [],
      createdAt: new Date().toISOString(),
      status: "scheduled",
      attemptCount: 0,
      scheduledFor: futureDate
    };
    await enqueueOutboxMessage(scheduledMsg);

    await drainOutboxQueue({
      accessToken: "mock-token",
      currentUser: mockUser,
      chats: [mockChat],
      applyMessagesForChat: vi.fn(),
      onChatsUpdate: vi.fn()
    });

    expect(sendMessage).not.toHaveBeenCalled();
    const remaining = await getOutboxMessages("user-1");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("client-scheduled-1");
  });

  it("sends scheduled message once scheduledFor is reached", async () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    const scheduledMsg: QueuedOutboxMessage = {
      id: "client-scheduled-due",
      clientMessageId: "client-scheduled-due",
      chatId: "chat-1",
      userId: "user-1",
      content: "Due scheduled message",
      replyToMessageId: null,
      threadRootMessageId: null,
      mentionedUserIds: [],
      attachments: [],
      createdAt: new Date().toISOString(),
      status: "scheduled",
      attemptCount: 0,
      scheduledFor: pastDate
    };
    await enqueueOutboxMessage(scheduledMsg);

    vi.mocked(sendMessage).mockResolvedValueOnce({
      id: "server-msg-due",
      chatId: "chat-1",
      senderId: "user-1",
      type: "text",
      content: "Due scheduled message",
      encryptionProtocol: "legacy_plaintext",
      ciphertext: null,
      nonce: null,
      keyVersion: null,
      encryptionMetadata: null,
      replyToMessageId: null,
      threadRootMessageId: null,
      messageKind: "chat",
      createdAt: scheduledMsg.createdAt,
      updatedAt: scheduledMsg.createdAt,
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

    expect(sendMessage).toHaveBeenCalledWith(
      "mock-token",
      "chat-1",
      "Due scheduled message",
      [],
      null,
      null,
      undefined,
      [],
      false,
      "client-scheduled-due"
    );
    const remaining = await getOutboxMessages("user-1");
    expect(remaining).toHaveLength(0);
  });

  it("advances recurring reminder to next occurrence when sent", async () => {
    const pastDate = new Date(2026, 7, 18, 9, 0).toISOString();
    const reminderMsg: QueuedOutboxMessage = {
      id: "client-reminder-1",
      clientMessageId: "client-reminder-1",
      chatId: "chat-1",
      userId: "user-1",
      content: "Repeating daily reminder",
      replyToMessageId: null,
      threadRootMessageId: null,
      mentionedUserIds: [],
      attachments: [],
      createdAt: new Date().toISOString(),
      status: "scheduled",
      attemptCount: 0,
      scheduledFor: pastDate,
      isReminder: true,
      reminderRule: {
        frequency: "daily",
        repeatCount: 3,
        remainingCount: 3,
        startDate: "2026-08-18",
        time: "09:00"
      }
    };
    await enqueueOutboxMessage(reminderMsg);

    vi.mocked(sendMessage).mockResolvedValueOnce({
      id: "server-msg-reminder",
      chatId: "chat-1",
      senderId: "user-1",
      type: "text",
      content: "Repeating daily reminder",
      encryptionProtocol: "legacy_plaintext",
      ciphertext: null,
      nonce: null,
      keyVersion: null,
      encryptionMetadata: null,
      replyToMessageId: null,
      threadRootMessageId: null,
      messageKind: "chat",
      createdAt: reminderMsg.createdAt,
      updatedAt: reminderMsg.createdAt,
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

    expect(sendMessage).toHaveBeenCalled();
    const remaining = await getOutboxMessages("user-1");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).not.toBe("client-reminder-1"); // New client ID
    expect(remaining[0].isReminder).toBe(true);
    expect(remaining[0].reminderRule?.remainingCount).toBe(2);
    expect(new Date(remaining[0].scheduledFor!).getDate()).toBe(19);
  });
});
