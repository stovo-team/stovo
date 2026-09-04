import { describe, expect, it } from "vitest";

import type { Chat } from "../../../api/chats";
import { defaultFolderRules, matchesFolder } from "./chatFolders";

const chat = (overrides: Partial<Chat> = {}): Chat => ({
  id: "chat-1", familyId: "family-1", type: "group", title: "Product updates", createdBy: "owner",
  mediaVisibility: "family", commentsEnabled: true, encryptionProtocol: "server_at_rest",
  mediaVisibilityPendingApproval: false, mediaVisibilityApprovalCount: 0, mediaVisibilityApprovalRequired: 0,
  myMediaVisibilityApproval: false, chatPhoto: null, createdAt: "2026-09-04T00:00:00Z",
  updatedAt: "2026-09-04T00:00:00Z", members: [], unreadCount: 0, lastMessageId: null,
  lastMessageSenderId: null, lastMessageSenderDisplayName: null, lastMessageContent: null,
  lastMessageType: null, lastMessageCreatedAt: null, isMuted: false, isPinned: false,
  isFavorite: false, ...overrides
});

describe("matchesFolder", () => {
  it("combines type, title, and property rules", () => {
    const rules = { ...defaultFolderRules(), chatTypes: ["group" as const], titleIncludes: "update", unreadOnly: true, favoritesOnly: true };
    expect(matchesFolder(chat({ unreadCount: 2, isFavorite: true }), rules, "Product updates")).toBe(true);
    expect(matchesFolder(chat({ unreadCount: 2, isFavorite: true }), rules, "General chat")).toBe(false);
    expect(matchesFolder(chat({ type: "channel", unreadCount: 2, isFavorite: true }), rules, "Product updates")).toBe(false);
  });

  it("keeps archive and family chats out of custom folders", () => {
    const rules = defaultFolderRules();
    expect(matchesFolder(chat({ type: "archive" }), rules, "Message Archive")).toBe(false);
    expect(matchesFolder(chat({ type: "family" }), rules, "Stovo")).toBe(false);
  });
});
