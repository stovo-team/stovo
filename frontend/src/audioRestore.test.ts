import { describe, expect, it } from "vitest";

import { validateAudioRestoreTarget } from "./audioRestore";

const identity = {
  chatId: "chat/one%",
  messageId: "message/one%",
  fileId: "file/one%🎵"
};

const chats = [{ id: identity.chatId }, { id: "chat-adjacent" }];
const messages = [
  {
    id: identity.messageId,
    chatId: identity.chatId,
    attachments: [
      { id: "file-adjacent", mimeType: "audio/mpeg", deletedAt: null },
      { id: identity.fileId, mimeType: "audio/ogg", deletedAt: null }
    ]
  },
  {
    id: "message-adjacent",
    chatId: "chat-adjacent",
    attachments: [{ id: identity.fileId, mimeType: "audio/mpeg", deletedAt: null }]
  }
];

describe("validateAudioRestoreTarget", () => {
  it("returns a copied exact audio target without routing or decoding opaque IDs", () => {
    const result = validateAudioRestoreTarget(identity, chats, messages);

    expect(result).toEqual(identity);
    expect(result).not.toBe(identity);
  });

  it.each([
    [{ ...identity, chatId: "chat-adjacent" }, chats, messages],
    [{ ...identity, messageId: "message-adjacent" }, chats, messages],
    [{ ...identity, fileId: "file-adjacent" }, chats, [{ ...messages[0], attachments: [{ id: identity.fileId, mimeType: "audio/ogg", deletedAt: null }] }]],
    [identity, chats, [{ ...messages[0], attachments: [{ id: identity.fileId, mimeType: "video/mp4", deletedAt: null }] }]],
    [identity, chats, [{ ...messages[0], attachments: [{ id: identity.fileId, mimeType: "audio/mpeg", deletedAt: "2026-01-01" }] }]],
    [identity, [], messages],
    [{ chatId: "", messageId: identity.messageId, fileId: identity.fileId }, chats, messages],
    [{ chatId: identity.chatId, messageId: "%2Fmessage", fileId: identity.fileId }, chats, messages]
  ])("rejects adjacent, missing, deleted, partial, and malformed targets", (candidate, targetChats, targetMessages) => {
    expect(validateAudioRestoreTarget(candidate, targetChats, targetMessages)).toBeNull();
  });
});
