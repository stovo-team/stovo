import { describe, expect, it } from "vitest";

import { parseTelegramExport } from "./telegram";

const encoder = new TextEncoder();

describe("Telegram Desktop JSON adapter", () => {
  it("maps one chat, Telegram user IDs, timestamps, replies, and media paths", async () => {
    const bytes = encoder.encode(JSON.stringify({
      name: "Roadmap",
      type: "personal_chat",
      id: 481,
      messages: [
        {
          id: 10,
          type: "message",
          date: "2026-10-10T08:00:00",
          date_unixtime: "1791619200",
          from: "Mira",
          from_id: "user42",
          text: "Review this",
          photo: "photos/photo_10.jpg"
        },
        {
          id: 11,
          type: "message",
          date: "2026-10-10T08:05:00",
          date_unixtime: "1791619500",
          from: "Sam",
          from_id: "user43",
          text: "Done",
          reply_to_message_id: 10
        }
      ]
    }));

    await expect(parseTelegramExport(bytes)).resolves.toMatchObject({
      source: { providerId: "telegram" },
      conversation: { sourceId: "481", title: "Roadmap" },
      participants: [
        { sourceId: "user42", displayName: "Mira" },
        { sourceId: "user43", displayName: "Sam" }
      ],
      messages: [
        { sourceId: "10", authorId: "user42", text: "Review this", attachmentIds: expect.any(Array) },
        { sourceId: "11", authorId: "user43", replyToSourceId: "10" }
      ]
    });
  });

  it("rejects a Telegram all-chats export before it produces an importable archive", async () => {
    const bytes = encoder.encode(JSON.stringify({
      chats: {
        list: [
          { id: 1, name: "One", type: "personal_chat", messages: [] },
          { id: 2, name: "Two", type: "personal_chat", messages: [] }
        ]
      }
    }));

    await expect(parseTelegramExport(bytes)).rejects.toMatchObject({ code: "multiple_conversations" });
  });
});
