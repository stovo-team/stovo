import { describe, expect, it } from "vitest";

import { parseStovoArchive } from "./stovo";

const encoder = new TextEncoder();

describe("Stovo archive adapter", () => {
  it("reads the versioned Stovo archive and preserves source identities and chronology", async () => {
    const bytes = encoder.encode(JSON.stringify({
      schemaVersion: 1,
      source: { providerId: "stovo", profileId: "stovo-chat-archive-v1" },
      exportedAt: "2026-10-11T00:00:00.000Z",
      conversation: { sourceId: "chat-1", title: "Planning" },
      participants: [{ sourceId: "user-1", displayName: "Dani" }],
      messages: [
        { sourceId: "m-1", authorId: "user-1", timestamp: "2026-10-10T10:00:00Z", kind: "text", text: "First" },
        { sourceId: "m-2", authorId: "user-1", timestamp: "2026-10-10T10:01:00Z", kind: "text", text: "Second", replyToSourceId: "m-1" }
      ],
      attachments: [],
      warnings: []
    }));

    await expect(parseStovoArchive(bytes)).resolves.toMatchObject({
      source: { providerId: "stovo" },
      conversation: { sourceId: "chat-1", title: "Planning" },
      messages: [
        { sourceId: "m-1", text: "First" },
        { sourceId: "m-2", replyToSourceId: "m-1" }
      ]
    });
  });

  it("rejects unsupported Stovo versions and envelopes with multiple conversations", async () => {
    const unsupported = encoder.encode(JSON.stringify({ schemaVersion: 7 }));
    const multiple = encoder.encode(JSON.stringify({
      schemaVersion: 1,
      conversations: [{ id: "one" }, { id: "two" }]
    }));

    await expect(parseStovoArchive(unsupported)).rejects.toMatchObject({ code: "unsupported_schema_version" });
    await expect(parseStovoArchive(multiple)).rejects.toMatchObject({ code: "multiple_conversations" });
  });
});
