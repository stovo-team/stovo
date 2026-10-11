import { describe, expect, it } from "vitest";

import { CHAT_ARCHIVE_LIMITS, validateArchive } from "./archive";

const validArchive = () => ({
  schemaVersion: 1,
  source: { providerId: "stovo", profileId: "stovo-chat-archive-v1" },
  exportedAt: "2026-10-11T00:00:00.000Z",
  conversation: { sourceId: "chat-source-1", title: "Project room" },
  participants: [{ sourceId: "user-source-1", displayName: "Amina" }],
  messages: [
    {
      sourceId: "message-source-1",
      authorId: "user-source-1",
      timestamp: "2026-10-10T12:30:00.000Z",
      kind: "text",
      text: "Hello",
      attachmentIds: ["attachment-1"],
      metadata: {}
    }
  ],
  attachments: [
    {
      id: "attachment-1",
      path: "attachments/report.pdf",
      filename: "report.pdf",
      mimeType: "application/pdf",
      size: 4,
      checksum: "sha256:abcd"
    }
  ],
  warnings: []
});

function expectValidationCode(value: unknown, code: string) {
  let caught: unknown;
  try {
    validateArchive(value);
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({ code });
}

describe("ChatArchive validation", () => {
  it("accepts a versioned one-conversation archive and preserves its supported fields", () => {
    const archive = validArchive();

    expect(validateArchive(archive)).toMatchObject({
      schemaVersion: 1,
      conversation: { sourceId: "chat-source-1", title: "Project room" },
      participants: [{ sourceId: "user-source-1", displayName: "Amina" }],
      messages: [{ sourceId: "message-source-1", text: "Hello", attachmentIds: ["attachment-1"] }],
      attachments: [{ id: "attachment-1", path: "attachments/report.pdf" }]
    });
  });

  it("rejects an unknown schema version", () => {
    expectValidationCode({ ...validArchive(), schemaVersion: 99 }, "unsupported_schema_version");
  });

  it("rejects a missing conversation", () => {
    const archive = validArchive();
    delete (archive as { conversation?: unknown }).conversation;

    expectValidationCode(archive, "conversation_required");
  });

  it("rejects a conversation without a source identity", () => {
    const archive = validArchive();
    delete (archive.conversation as { sourceId?: string }).sourceId;

    expectValidationCode(archive, "conversation_required");
  });

  it("rejects duplicate message source IDs", () => {
    const archive = validArchive();
    archive.messages.push({ ...archive.messages[0], text: "Duplicate" });

    expectValidationCode(archive, "duplicate_message_id");
  });

  it("rejects malformed timestamps rather than replacing them with the import time", () => {
    const archive = validArchive();
    archive.messages[0].timestamp = "yesterday";

    expectValidationCode(archive, "invalid_timestamp");
  });

  it("rejects attachment paths that escape the archive root", () => {
    const archive = validArchive();
    archive.attachments[0].path = "../outside.txt";

    expectValidationCode(archive, "unsafe_attachment_path");
  });

  it("rejects attachment references without a matching attachment entry", () => {
    const archive = validArchive();
    archive.messages[0].attachmentIds = ["missing-file"];

    expectValidationCode(archive, "unknown_attachment");
  });

  it("rejects an envelope that tries to include multiple conversations", () => {
    const archive = {
      ...validArchive(),
      conversations: [{ sourceId: "one" }, { sourceId: "two" }]
    };

    expectValidationCode(archive, "multiple_conversations");
  });

  it("rejects messages that are not in chronological order", () => {
    const archive = validArchive();
    archive.messages.push({
      ...archive.messages[0],
      sourceId: "message-source-2",
      timestamp: "2026-10-10T12:29:00.000Z",
      attachmentIds: []
    });

    expectValidationCode(archive, "messages_not_chronological");
  });

  it("rejects an import that exceeds the configured message limit", () => {
    const archive = validArchive();
    archive.messages = Array.from({ length: CHAT_ARCHIVE_LIMITS.maxMessages + 1 }, (_, index) => ({
      ...archive.messages[0],
      sourceId: `message-${index}`,
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      attachmentIds: []
    }));

    expectValidationCode(archive, "too_many_messages");
  });

  it("rejects an attachment that exceeds the configured per-file limit", () => {
    const archive = validArchive();
    archive.attachments[0].size = CHAT_ARCHIVE_LIMITS.maxAttachmentBytes + 1;

    expectValidationCode(archive, "attachment_too_large");
  });

  it("rejects unknown provider profiles", () => {
    const archive = validArchive();
    archive.source = { providerId: "telegram", profileId: "telegram-server-backup" };

    expectValidationCode(archive, "unsupported_profile");
  });
});
