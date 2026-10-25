import { describe, expect, it, vi } from "vitest";
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";

import { useChatDataLoader } from "./useChatDataLoader";
import type { Message, MessageHistoryPage } from "../../../api/chats";

vi.mock("../../../api/messageCrypto", () => ({
  decryptMessages: vi.fn((_chatId: string, messages: Message[]) => Promise.resolve(messages))
}));

vi.mock("../../../chatHistoryCache", () => ({
  loadCachedChatList: vi.fn(() => Promise.resolve(null)),
  loadCachedChatListFromLocalStorage: vi.fn(() => null),
  loadRecentChatHistory: vi.fn(() => Promise.resolve(null)),
  loadRecentChatHistoryFromLocalStorage: vi.fn(() => null),
  loadPinnedMessagesFromLocalStorage: vi.fn(() => null),
  saveCachedChatList: vi.fn(),
  savePinnedMessagesToLocalStorage: vi.fn(),
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
  it("keeps the previous selection when returning to a loaded chat list", async () => {
    let loaderRef: ReturnType<typeof useChatDataLoader> | null = null;
    const setSelectedChat = vi.fn();

    function TestComponent() {
      loaderRef = useChatDataLoader({
        accessTokenRef: { current: "test-token" }, authRequest: vi.fn() as any,
        currentUser: { id: "user-1" } as any, chatId: undefined, onError: vi.fn(),
        setFamily: vi.fn(), setMembers: vi.fn(), setChats: vi.fn(), setSelectedChat,
        setIsLoading: vi.fn(), setHasLoadedOverview: vi.fn(), setIsChatLoading: vi.fn(),
        activeChatIdRef: { current: "chat-1" }, chatsRef: { current: [{ id: "chat-1" }] as any },
        chatMutationVersionRef: { current: {} }, messageCacheRef: { current: {} },
        historyCursorRef: { current: {} }, setMessages: vi.fn(), setPinnedMessages: vi.fn(),
        setPinIndex: vi.fn(), applyMessagesForChat: vi.fn(), markChatRead: vi.fn(() => Promise.resolve())
      });
      return null;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const previousActEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    try {
      act(() => root.render(createElement(TestComponent)));
      await act(async () => {
        await loaderRef?.loadSelectedChat(undefined);
      });

      expect(setSelectedChat).not.toHaveBeenCalled();
      act(() => root.unmount());
    } finally {
      (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
      container.remove();
    }
  });

  it("restores cached pins and leaves them in place when the pin request fails", async () => {
    const cachedPin = {
      chatId: "chat-1",
      messageId: "pinned-1",
      pinnedBy: "user-1",
      pinnedAt: "2026-01-01T10:00:00.000Z",
      message: makeMessage("pinned-1", "2026-01-01T10:00:00.000Z")
    };
    const { loadPinnedMessagesFromLocalStorage } = await import("../../../chatHistoryCache");
    vi.mocked(loadPinnedMessagesFromLocalStorage).mockReturnValue([cachedPin]);
    const authRequest = vi.fn((url: string) => {
      if (url.includes("/pins")) return Promise.reject(new Error("temporary network error"));
      if (url.includes("/messages?")) return Promise.resolve({ messages: [], hasMore: false, nextBefore: "" });
      return Promise.resolve({ id: "chat-1", name: "Chat 1" });
    });
    const setPinnedMessages = vi.fn();
    let loaderRef: ReturnType<typeof useChatDataLoader> | null = null;

    function TestComponent() {
      loaderRef = useChatDataLoader({
        accessTokenRef: { current: "test-token" }, authRequest: authRequest as any,
        currentUser: { id: "user-1" } as any, chatId: undefined, onError: vi.fn(),
        setFamily: vi.fn(), setMembers: vi.fn(), setChats: vi.fn(), setSelectedChat: vi.fn(),
        setIsLoading: vi.fn(), setHasLoadedOverview: vi.fn(), setIsChatLoading: vi.fn(),
        activeChatIdRef: { current: "chat-1" }, chatsRef: { current: [] },
        chatMutationVersionRef: { current: {} }, messageCacheRef: { current: {} },
        historyCursorRef: { current: {} }, setMessages: vi.fn(), setPinnedMessages,
        setPinIndex: vi.fn(), applyMessagesForChat: vi.fn(), markChatRead: vi.fn(() => Promise.resolve())
      });
      return null;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const previousActEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    try {
      act(() => root.render(createElement(TestComponent)));
      await act(async () => {
        await loaderRef?.loadSelectedChat("chat-1");
        await Promise.resolve();
      });
      const lastPinsUpdate = setPinnedMessages.mock.lastCall?.[0];
      expect(lastPinsUpdate).toBeTypeOf("function");
      expect(lastPinsUpdate([cachedPin])).toEqual([cachedPin]);
      act(() => root.unmount());
    } finally {
      (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
      container.remove();
      vi.mocked(loadPinnedMessagesFromLocalStorage).mockReturnValue(null);
    }
  });

  it("clears the previous chat pins as soon as another chat starts loading", async () => {
    const pending = new Promise<never>(() => {});
    const authRequest = vi.fn((url: string) => {
      if (url.includes("/messages?")) return pending;
      if (url.includes("/pins")) return pending;
      return Promise.resolve(null);
    });
    let loaderRef: ReturnType<typeof useChatDataLoader> | null = null;
    let updatePins: (pins: any[]) => void = () => undefined;

    function TestComponent() {
      const [pins, setPins] = useState<any[]>([]);
      updatePins = setPins;
      loaderRef = useChatDataLoader({
        accessTokenRef: { current: "test-token" }, authRequest: authRequest as any,
        currentUser: { id: "user-1" } as any, chatId: "old-chat", onError: vi.fn(),
        setFamily: vi.fn(), setMembers: vi.fn(), setChats: vi.fn(), setSelectedChat: vi.fn(),
        setIsLoading: vi.fn(), setHasLoadedOverview: vi.fn(), setIsChatLoading: vi.fn(),
        activeChatIdRef: { current: "old-chat" }, chatsRef: { current: [] },
        chatMutationVersionRef: { current: {} }, messageCacheRef: { current: {} },
        historyCursorRef: { current: {} }, setMessages: vi.fn(), setPinnedMessages: setPins,
        setPinIndex: vi.fn(), applyMessagesForChat: vi.fn(), markChatRead: vi.fn(() => Promise.resolve())
      });
      return createElement("output", null, String(pins.length));
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const previousActEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    try {
      act(() => root.render(createElement(TestComponent)));
      act(() => updatePins([{ messageId: "old-pin" }]));
      expect(container.querySelector("output")?.textContent).toBe("1");
      act(() => { void loaderRef?.loadSelectedChat("archive-chat"); });
      expect(container.querySelector("output")?.textContent).toBe("0");
      act(() => root.unmount());
    } finally {
      (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
      container.remove();
    }
  });

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

  it("revalidates a cached history without collapsing it to the first page", async () => {
    const cachedMessages = Array.from({ length: 20 }, (_, index) =>
      makeMessage(`cached-${index + 1}`, `2026-01-01T10:${String(index).padStart(2, "0")}:00.000Z`)
    );
    const freshMessages = [
      { ...cachedMessages[18], content: "Fresh 19" },
      { ...cachedMessages[19], content: "Fresh 20" }
    ];
    const authRequest = vi.fn((url: string) => {
      if (url.includes("/messages?limit=20")) {
        return Promise.resolve({ messages: freshMessages, hasMore: false, nextBefore: "" });
      }
      if (url.includes("/pins")) return Promise.resolve([]);
      if (url.includes("/api/chats/chat-1")) return Promise.resolve({ id: "chat-1", name: "Chat 1" });
      return Promise.resolve(null);
    });
    const messageCacheRef = { current: { "chat-1": cachedMessages } as Record<string, Message[]> };
    const appliedMessages: Message[][] = [];
    const applyMessagesForChat = vi.fn((_chatId: string, updater: unknown) => {
      const current = messageCacheRef.current["chat-1"];
      const next = typeof updater === "function" ? updater(current) : updater as Message[];
      messageCacheRef.current["chat-1"] = next;
      appliedMessages.push(next);
    });
    const historyCursorRef = { current: {} as Record<string, string | null> };
    const activeChatIdRef = { current: "chat-1" };
    const accessTokenRef = { current: "test-token" };
    const chatsRef = { current: [] };
    const chatMutationVersionRef = { current: {} };
    let loaderRef: ReturnType<typeof useChatDataLoader> | null = null;

    function TestComponent() {
      loaderRef = useChatDataLoader({
        accessTokenRef, authRequest: authRequest as any, currentUser: { id: "user-1" } as any, chatId: "chat-1",
        onError: vi.fn(), setFamily: vi.fn(), setMembers: vi.fn(), setChats: vi.fn(), setSelectedChat: vi.fn(),
        setIsLoading: vi.fn(), setHasLoadedOverview: vi.fn(), setIsChatLoading: vi.fn(), activeChatIdRef, chatsRef,
        chatMutationVersionRef, messageCacheRef, historyCursorRef, setMessages: vi.fn(), setPinnedMessages: vi.fn(),
        setPinIndex: vi.fn(), applyMessagesForChat, markChatRead: vi.fn(() => Promise.resolve())
      });
      return null;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(createElement(TestComponent)));
    await act(async () => { await loaderRef?.loadSelectedChat("chat-1"); });

    expect(authRequest).toHaveBeenCalledWith("/api/chats/chat-1/messages?limit=20");
    expect(appliedMessages.at(-1)).toHaveLength(20);
    expect(appliedMessages.at(-1)?.at(-1)?.content).toBe("Fresh 20");
    expect(authRequest).not.toHaveBeenCalledWith(expect.stringContaining("before="));

    act(() => root.unmount());
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
    const scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const merged = mergeOutboxPendingMessages([], [{
      id: "scheduled-client-1", clientMessageId: "scheduled-client-1", chatId: "chat-1", userId: "user-1",
      content: "Send later", replyToMessageId: null, threadRootMessageId: null, mentionedUserIds: [], attachments: [],
      createdAt: "2026-01-01T10:00:00.000Z", status: "scheduled", scheduledFor, attemptCount: 0
    }], { id: "user-1", displayName: "User", email: "user@test.com", username: "user", role: "member", createdAt: "" });

    expect(merged[0].deliveryState).toBe("scheduled");
    expect(merged[0].scheduledFor).toBe(scheduledFor);
  });

  it("uses the live outbox status instead of a stale optimistic scheduled snapshot", async () => {
    const { mergeOutboxPendingMessages } = await import("./useChatDataLoader");
    const createdAt = new Date().toISOString();
    const merged = mergeOutboxPendingMessages([], [{
      id: "due-client-1", clientMessageId: "due-client-1", chatId: "chat-1", userId: "user-1",
      content: "Send now", replyToMessageId: null, threadRootMessageId: null, mentionedUserIds: [], attachments: [],
      createdAt, status: "sending", scheduledFor: new Date(Date.now() - 60_000).toISOString(), attemptCount: 1,
      optimisticMessage: {
        ...makeMessage("pending:due-client-1", "2026-01-01T00:00:00.000Z"),
        clientMessageId: "due-client-1", deliveryState: "scheduled"
      }
    }], { id: "user-1", displayName: "User", email: "user@test.com", username: "user", role: "member", createdAt: "" });

    expect(merged[0].deliveryState).toBe("sending");
    expect(merged[0].createdAt).toBe(createdAt);
  });
});

it("renders cached archive-group history while its next network refresh is pending", async () => {
  const cached = [makeMessage("saved", "2026-01-01T10:00:00.000Z")];
  let pendingRefresh = false;
  const authRequest = vi.fn((url: string) => {
    if (url.includes("/messages?")) return pendingRefresh ? new Promise(() => {}) : Promise.resolve({ messages: cached, hasMore: false, nextBefore: "" });
    if (url.includes("/pins")) return Promise.resolve([]);
    return Promise.resolve({ id: "chat-1", type: "archive" });
  });
  const cache = { current: {} as Record<string, Message[]> };
  const setMessages = vi.fn();
  const setIsChatLoading = vi.fn();
  const applyMessagesForChat = (_id: string, update: unknown) => { cache.current["chat-1"] = typeof update === "function" ? update(cache.current["chat-1"] ?? []) : update as Message[]; };
  let loader!: ReturnType<typeof useChatDataLoader>;
  function Harness() {
    loader = useChatDataLoader({
      accessTokenRef: { current: "token" }, authRequest: authRequest as any, currentUser: { id: "user" } as any, chatId: "chat-1", archiveGroup: "origin-chat",
      onError: vi.fn(), setFamily: vi.fn(), setMembers: vi.fn(), setChats: vi.fn(), setSelectedChat: vi.fn(),
      setIsLoading: vi.fn(), setHasLoadedOverview: vi.fn(), setIsChatLoading, activeChatIdRef: { current: "chat-1" }, chatsRef: { current: [] },
      chatMutationVersionRef: { current: {} }, messageCacheRef: cache, historyCursorRef: { current: {} }, setMessages, setPinnedMessages: vi.fn(),
      setPinIndex: vi.fn(), applyMessagesForChat, markChatRead: vi.fn(() => Promise.resolve())
    });
    return null;
  }
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => { root.render(createElement(Harness)); });
    await act(async () => { await loader.loadSelectedChat("chat-1"); });
    pendingRefresh = true; setMessages.mockClear(); setIsChatLoading.mockClear();
    act(() => { void loader.loadSelectedChat("chat-1"); });
    expect(setMessages).toHaveBeenCalledWith(cached);
    expect(setIsChatLoading).toHaveBeenCalledWith(false);
  } finally { act(() => root.unmount()); host.remove(); }
});
