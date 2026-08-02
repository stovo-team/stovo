import { describe, expect, it } from "vitest";

import { mergeLatestHistory, trimRecentChatHistory } from "./chatHistoryCache";

describe("chat history cache helpers", () => {
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

  it("keeps only the 20 most recently opened chats with at most 50 messages each", () => {
    const entries = Array.from({ length: 21 }, (_, index) => ({
      chatId: `chat-${index}`,
      accessedAt: index,
      messages: Array.from({ length: 51 }, (_, messageIndex) => ({ id: `m-${messageIndex}` })),
    }));

    const trimmed = trimRecentChatHistory(entries);

    expect(trimmed).toHaveLength(20);
    expect(trimmed.some((entry) => entry.chatId === "chat-0")).toBe(false);
    expect(trimmed.at(-1)?.messages).toHaveLength(50);
  });
});
