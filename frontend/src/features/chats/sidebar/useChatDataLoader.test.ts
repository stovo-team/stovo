import { describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

import { useChatDataLoader } from "./useChatDataLoader";
import type { Message, MessageHistoryPage } from "../../../api/chats";

vi.mock("../../../api/messageCrypto", () => ({
  decryptMessages: vi.fn((_chatId: string, messages: Message[]) => Promise.resolve(messages))
}));

vi.mock("../../../chatHistoryCache", () => ({
  loadCachedChatList: vi.fn(() => Promise.resolve(null)),
  loadRecentChatHistory: vi.fn(() => Promise.resolve(null)),
  loadRecentChatHistoryFromLocalStorage: vi.fn(() => null),
  saveCachedChatList: vi.fn(),
  saveRecentChatHistory: vi.fn()
}));

function makeMessage(id: string, createdAt: string): Message {
  return {
    id,
    chatId: "chat-1",
    senderId: "user-1",
    senderDisplayName: "User",
    type: "text",
    content: `Message ${id}`,
    attachments: [],
    reactions: [],
    statuses: [],
    createdAt,
    updatedAt: createdAt
  } as Message;
}

describe("useChatDataLoader", () => {
  it("rejects chat metadata responses that began before a local setting change", async () => {
    const { isCurrentChatMetadataRefresh } = await import("./useChatDataLoader");

    expect(isCurrentChatMetadataRefresh("chat-1", { "chat-1": 2 }, { "chat-1": 2 })).toBe(true);
    expect(isCurrentChatMetadataRefresh("chat-1", { "chat-1": 2 }, { "chat-1": 3 })).toBe(false);
  });

  it("loads first 10 messages and subsequently fetches more history in the background", async () => {
    const firstTen: Message[] = Array.from({ length: 10 }, (_, i) =>
      makeMessage(`msg-${i + 1}`, `2026-01-01T10:00:${String(i).padStart(2, "0")}.000Z`)
    );
    const olderMessages: Message[] = Array.from({ length: 10 }, (_, i) =>
      makeMessage(`older-${i + 1}`, `2026-01-01T09:00:${String(i).padStart(2, "0")}.000Z`)
    );

    const firstPage: MessageHistoryPage = {
      messages: firstTen,
      hasMore: true,
      nextBefore: "msg-1"
    };

    const secondPage: MessageHistoryPage = {
      messages: olderMessages,
      hasMore: false,
      nextBefore: ""
    };

    const requestedUrls: string[] = [];
    const authRequest = vi.fn((url: string) => {
      requestedUrls.push(url);
      if (url.includes("/api/chats/chat-1/messages?limit=10")) {
        return Promise.resolve(firstPage);
      }
      if (url.includes("/api/chats/chat-1/messages?before=msg-1&limit=50")) {
        return Promise.resolve(secondPage);
      }
      if (url.includes("/pins")) {
        return Promise.resolve([]);
      }
      if (url.includes("/api/chats/chat-1")) {
        return Promise.resolve({ id: "chat-1", name: "Chat 1" });
      }
      return Promise.resolve(null);
    });

    const appliedMessages: Message[][] = [];
    const applyMessagesForChat = vi.fn((_chatId: string, updater: unknown) => {
      if (typeof updater === "function") {
        const prev = appliedMessages.at(-1) ?? [];
        appliedMessages.push(updater(prev));
      } else {
        appliedMessages.push(updater as Message[]);
      }
    });

    const historyCursorRef = { current: {} as Record<string, string | null> };
    const activeChatIdRef = { current: "chat-1" };
    const accessTokenRef = { current: "test-token" };
    const chatsRef = { current: [] };
    const chatMutationVersionRef = { current: {} };
    const messageCacheRef = { current: {} };

    let loaderRef: ReturnType<typeof useChatDataLoader> | null = null;
    function TestComponent() {
      loaderRef = useChatDataLoader({
        accessTokenRef,
        authRequest: authRequest as any,
        currentUser: { id: "user-1" } as any,
        chatId: "chat-1",
        onError: vi.fn(),
        setFamily: vi.fn(),
        setMembers: vi.fn(),
        setChats: vi.fn(),
        setSelectedChat: vi.fn(),
        setIsLoading: vi.fn(),
        setHasLoadedOverview: vi.fn(),
        setIsChatLoading: vi.fn(),
        activeChatIdRef,
        chatsRef,
        chatMutationVersionRef,
        messageCacheRef,
        historyCursorRef,
        setMessages: vi.fn(),
        setPinnedMessages: vi.fn(),
        setPinIndex: vi.fn(),
        applyMessagesForChat,
        markChatRead: vi.fn(() => Promise.resolve())
      });
      return null;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(createElement(TestComponent));
    });

    await act(async () => {
      await loaderRef?.loadSelectedChat("chat-1");
    });

    // First paint loads the initial 10 messages
    expect(authRequest).toHaveBeenCalledWith("/api/chats/chat-1/messages?limit=10");
    expect(appliedMessages[0]).toHaveLength(10);

    // Wait for the background continuation promise to resolve
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(authRequest).toHaveBeenCalledWith("/api/chats/chat-1/messages?before=msg-1&limit=50");
    expect(appliedMessages.length).toBeGreaterThanOrEqual(2);
    expect(appliedMessages.at(-1)).toHaveLength(20);
    expect(historyCursorRef.current["chat-1"]).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("merges pending outbox messages without duplicating existing messages", async () => {
    const { mergeOutboxPendingMessages } = await import("./useChatDataLoader");
    const existing: Message[] = [
      makeMessage("msg-1", "2026-01-01T10:00:00.000Z")
    ];
    const outboxItem = {
      id: "pending-client-1",
      clientMessageId: "pending-client-1",
      chatId: "chat-1",
      userId: "user-1",
      content: "Offline draft message",
      replyToMessageId: null,
      threadRootMessageId: null,
      mentionedUserIds: [],
      attachments: [],
      createdAt: "2026-01-01T10:01:00.000Z",
      status: "queued" as const,
      attemptCount: 0
    };

    const merged = mergeOutboxPendingMessages(existing, [outboxItem], {
      id: "user-1",
      displayName: "User",
      email: "user@test.com",
      username: "user",
      role: "member",
      createdAt: ""
    });

    expect(merged).toHaveLength(2);
    expect(merged[1].deliveryState).toBe("sending");
    expect(merged[1].content).toBe("Offline draft message");
  });

  it("keeps restored scheduled outbox messages visually pending", async () => {
    const { mergeOutboxPendingMessages } = await import("./useChatDataLoader");
    const scheduledFor = "2026-01-01T12:00:00.000Z";
    const merged = mergeOutboxPendingMessages([], [{
      id: "scheduled-client-1", clientMessageId: "scheduled-client-1", chatId: "chat-1", userId: "user-1",
      content: "Send later", replyToMessageId: null, threadRootMessageId: null, mentionedUserIds: [], attachments: [],
      createdAt: "2026-01-01T10:00:00.000Z", status: "scheduled", scheduledFor, attemptCount: 0
    }], { id: "user-1", displayName: "User", email: "user@test.com", username: "user", role: "member", createdAt: "" });

    expect(merged[0].deliveryState).toBe("scheduled");
    expect(merged[0].scheduledFor).toBe(scheduledFor);
  });
});
