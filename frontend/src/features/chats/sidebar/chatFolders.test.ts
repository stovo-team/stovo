import { describe, expect, it } from "vitest";

import type { Chat } from "../../../api/chats";
import { defaultFolderRules, folderMatchesChatProperties, matchesFolder } from "./chatFolders";

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

describe("folderMatchesChatProperties", () => {
  it("validates chat type restrictions", () => {
    const rules = { ...defaultFolderRules(), chatTypes: ["channel" as const] };
    expect(folderMatchesChatProperties(chat({ type: "channel" }), rules, "Channel")).toBe(true);
    expect(folderMatchesChatProperties(chat({ type: "group" }), rules, "Group")).toBe(false);
    expect(folderMatchesChatProperties(chat({ type: "direct" }), rules, "Direct")).toBe(false);
  });

  it("validates unread, muted, and favorite restrictions", () => {
    const unreadRules = { ...defaultFolderRules(), unreadOnly: true };
    expect(folderMatchesChatProperties(chat({ unreadCount: 1 }), unreadRules, "Chat")).toBe(true);
    expect(folderMatchesChatProperties(chat({ unreadCount: 0 }), unreadRules, "Chat")).toBe(false);

    const mutedRules = { ...defaultFolderRules(), mutedOnly: true };
    expect(folderMatchesChatProperties(chat({ isMuted: true }), mutedRules, "Chat")).toBe(true);
    expect(folderMatchesChatProperties(chat({ isMuted: false }), mutedRules, "Chat")).toBe(false);

    const favRules = { ...defaultFolderRules(), favoritesOnly: true };
    expect(folderMatchesChatProperties(chat({ isFavorite: true }), favRules, "Chat")).toBe(true);
    expect(folderMatchesChatProperties(chat({ isFavorite: false }), favRules, "Chat")).toBe(false);
  });

  it("restricts archive and family chats", () => {
    const rules = defaultFolderRules();
    expect(folderMatchesChatProperties(chat({ type: "archive" }), rules, "Archive")).toBe(false);
    expect(folderMatchesChatProperties(chat({ type: "family" }), rules, "Family")).toBe(false);
  });
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

  it("supports manual includedChatIds and excludedChatIds", () => {
    const rulesWithInclusion = { ...defaultFolderRules(), includedChatIds: ["chat-1"] };
    expect(matchesFolder(chat({ id: "chat-1" }), rulesWithInclusion, "Chat 1")).toBe(true);
    expect(matchesFolder(chat({ id: "chat-2" }), rulesWithInclusion, "Chat 2")).toBe(false);

    const rulesWithExclusion = { ...defaultFolderRules(), excludedChatIds: ["chat-1"] };
    expect(matchesFolder(chat({ id: "chat-1" }), rulesWithExclusion, "Chat 1")).toBe(false);
    expect(matchesFolder(chat({ id: "chat-2" }), rulesWithExclusion, "Chat 2")).toBe(true);
  });
});

