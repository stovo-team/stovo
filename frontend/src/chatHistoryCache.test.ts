import { beforeEach, describe, expect, it } from "vitest";

import { loadCachedChatList, loadCachedChatListFromLocalStorage, loadLastActiveChatId, loadRecentChatHistoryFromLocalStorage, mergeLatestHistory, saveCachedChatList, saveLastActiveChatId, saveRecentChatHistoryToLocalStorage, trimRecentChatHistory } from "./chatHistoryCache";

describe("chat history cache helpers", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear()
      },
      writable: true,
      configurable: true
    });
  });

  it("replaces cached messages with their fresh versions without duplicating IDs", () => {
    const merged = mergeLatestHistory(
      [{ id: "one", content: "cached" }],
      [{ id: "one", content: "fresh" }, { id: "two", content: "new" }],
    );

    expect(merged).toEqual([
      { id: "one", content: "fresh" },
      { id: "two", content: "new" },
    ]);
  });

  it("keeps every cached chat and message instead of silently discarding offline history", () => {
    const entries = Array.from({ length: 21 }, (_, index) => ({
      chatId: `chat-${index}`,
      accessedAt: index,
      messages: Array.from({ length: 51 }, (_, messageIndex) => ({ id: `m-${messageIndex}` })),
    }));

    const trimmed = trimRecentChatHistory(entries);

    expect(trimmed).toHaveLength(21);
    expect(trimmed.some((entry) => entry.chatId === "chat-0")).toBe(true);
    expect(trimmed.at(-1)?.messages).toHaveLength(51);
  });

  it("saves and restores cached chat list for a user", async () => {
    const sampleChats = [
      { id: "chat-1", title: "General", type: "group", unreadCount: 0 },
      { id: "chat-2", title: "Alice", type: "direct", unreadCount: 2 },
    ];

    await saveCachedChatList("user-123", sampleChats);
    const restored = await loadCachedChatList("user-123");

    expect(restored).toEqual(sampleChats);
  });

  it("reads the web chat list synchronously for startup rendering", () => {
    const sampleChats = [{ id: "chat-1", title: "General" }];
    localStorage.setItem("stovo_cached_chats_user-123", JSON.stringify(sampleChats));

    expect(loadCachedChatListFromLocalStorage("user-123")).toEqual(sampleChats);
  });

  it("remembers the last active chat per user", () => {
    saveLastActiveChatId("user-123", "chat-2");

    expect(loadLastActiveChatId("user-123")).toBe("chat-2");
    expect(loadLastActiveChatId("another-user")).toBeNull();
  });

  it("saves and synchronously restores recent chat history from local storage", () => {
    const messages = [{ id: "m-1", content: "Hello" }];
    saveRecentChatHistoryToLocalStorage("user-1", "chat-1", messages);
    const restored = loadRecentChatHistoryFromLocalStorage("user-1", "chat-1");
    expect(restored).toEqual(messages);
  });
});

