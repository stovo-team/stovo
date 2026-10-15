import { describe, expect, it } from "vitest";

import { parseRocketChatExport } from "./rocketchat";

const encoder = new TextEncoder();

describe("Rocket.Chat room export adapter", () => {
  it("maps a room JSON export to one conversation with source authors and thread links", async () => {
    const bytes = encoder.encode(JSON.stringify({
      room: { _id: "room-1", name: "engineering", t: "c" },
      messages: [
        { _id: "msg-1", rid: "room-1", msg: "Review the build", ts: "2026-10-10T08:00:00.000Z", u: { _id: "user-1", username: "mira", name: "Mira" } },
        { _id: "msg-2", rid: "room-1", msg: "Looks good", ts: "2026-10-10T08:05:00.000Z", tmid: "msg-1", u: { _id: "user-2", username: "sam", name: "Sam" } }
      ]
    }));

    await expect(parseRocketChatExport(bytes)).resolves.toMatchObject({
      source: { providerId: "rocketchat" },
      conversation: { sourceId: "room-1", title: "engineering" },
      participants: [
        { sourceId: "user-1", displayName: "Mira" },
        { sourceId: "user-2", displayName: "Sam" }
      ],
      messages: [
        { sourceId: "msg-1", text: "Review the build" },
        { sourceId: "msg-2", replyToSourceId: "msg-1" }
      ]
    });
  });

  it("rejects a server-wide or multi-room JSON export", async () => {
    const bytes = encoder.encode(JSON.stringify({
      rooms: [
        { room: { _id: "room-1", name: "one" }, messages: [] },
        { room: { _id: "room-2", name: "two" }, messages: [] }
      ]
    }));

    await expect(parseRocketChatExport(bytes)).rejects.toMatchObject({ code: "multiple_conversations" });
  });

  it("rejects a message whose room ID conflicts with the selected room", async () => {
    const bytes = encoder.encode(JSON.stringify({
      room: { _id: "room-1", name: "engineering" },
      messages: [
        { _id: "msg-1", rid: "room-2", msg: "Wrong room", ts: "2026-10-10T08:00:00.000Z", u: { _id: "user-1", username: "mira" } }
      ]
    }));

    await expect(parseRocketChatExport(bytes)).rejects.toMatchObject({ code: "multiple_conversations" });
  });
});
