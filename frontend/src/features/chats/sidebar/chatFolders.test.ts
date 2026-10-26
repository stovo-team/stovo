import { describe, expect, it } from "vitest";

import type { Chat } from "../../../api/chats";
import { colorForAvatarId } from "../../../components/entityAvatar";
import { defaultFolderRules, folderMatchesChatProperties, loadChatFolders, matchesFolder, saveChatFolders } from "./chatFolders";

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

  it("matches family chat when group is allowed, and archive chat when archive is allowed", () => {
    const groupRules = { ...defaultFolderRules(), chatTypes: ["group" as const] };
    expect(folderMatchesChatProperties(chat({ type: "family" }), groupRules, "Family")).toBe(true);
    expect(folderMatchesChatProperties(chat({ type: "group" }), groupRules, "Group")).toBe(true);
    expect(folderMatchesChatProperties(chat({ type: "archive" }), groupRules, "Archive")).toBe(false);

    const archiveRules = { ...defaultFolderRules(), chatTypes: ["archive" as const] };
    expect(folderMatchesChatProperties(chat({ type: "archive" }), archiveRules, "Archive")).toBe(true);
    expect(folderMatchesChatProperties(chat({ type: "group" }), archiveRules, "Group")).toBe(false);
  });

  it("excludes group chats when chatTypes is empty (groups property disabled)", () => {
    const emptyRules = { ...defaultFolderRules(), chatTypes: [] };
    expect(folderMatchesChatProperties(chat({ type: "group" }), emptyRules, "Group")).toBe(false);
    expect(folderMatchesChatProperties(chat({ type: "family" }), emptyRules, "Family")).toBe(false);
    expect(folderMatchesChatProperties(chat({ type: "direct" }), emptyRules, "Direct")).toBe(false);
  });
});

describe("matchesFolder", () => {
  it("requires explicit inclusion in includedChatIds (filters alone do not auto-include)", () => {
    const rules = { ...defaultFolderRules(), chatTypes: ["group" as const], titleIncludes: "update", unreadOnly: true, favoritesOnly: true };
    // Not in includedChatIds -> false even if properties match
    expect(matchesFolder(chat({ id: "chat-1", unreadCount: 2, isFavorite: true }), rules, "Product updates")).toBe(false);

    const rulesWithInclusion = { ...rules, includedChatIds: ["chat-1"] };
    expect(matchesFolder(chat({ id: "chat-1", unreadCount: 2, isFavorite: true }), rulesWithInclusion, "Product updates")).toBe(true);
    expect(matchesFolder(chat({ id: "chat-1", unreadCount: 2, isFavorite: true }), rulesWithInclusion, "General chat")).toBe(false);
    expect(matchesFolder(chat({ id: "chat-1", type: "channel", unreadCount: 2, isFavorite: true }), rulesWithInclusion, "Product updates")).toBe(false);
  });

  it("supports manual includedChatIds and excludedChatIds", () => {
    const rulesWithInclusion = { ...defaultFolderRules(), includedChatIds: ["chat-1"] };
    expect(matchesFolder(chat({ id: "chat-1" }), rulesWithInclusion, "Chat 1")).toBe(true);
    expect(matchesFolder(chat({ id: "chat-2" }), rulesWithInclusion, "Chat 2")).toBe(false);

    const rulesWithExclusion = { ...defaultFolderRules(), includedChatIds: ["chat-1", "chat-2"], excludedChatIds: ["chat-1"] };
    expect(matchesFolder(chat({ id: "chat-1" }), rulesWithExclusion, "Chat 1")).toBe(false);
    expect(matchesFolder(chat({ id: "chat-2" }), rulesWithExclusion, "Chat 2")).toBe(true);
  });

  it("safely loads and saves chat folders in localStorage", () => {
    const folder = {
      id: "folder-work",
      name: "Work",
      symbolId: "folder",
      colorId: colorForAvatarId("folder-work"),
      rules: { ...defaultFolderRules(), includedChatIds: ["chat-1"] }
    };
    saveChatFolders("family-1", [folder]);
    expect(loadChatFolders("family-1")).toEqual([folder]);

    // Simulate removing chat from folder (as done during drag and drop out of folder)
    const updatedFolders = loadChatFolders("family-1").map((f) => ({
      ...f,
      rules: {
        ...f.rules,
        includedChatIds: (f.rules.includedChatIds ?? []).filter((id) => id !== "chat-1")
      }
    }));
    saveChatFolders("family-1", updatedFolders);
    expect(loadChatFolders("family-1")[0].rules.includedChatIds).toEqual([]);
  });

  it("adds the default avatar choice to legacy folders and keeps edited choices", () => {
    window.localStorage.setItem("stovo:chat-folders:family-avatar", JSON.stringify([{
      id: "folder-legacy", name: "Legacy", rules: defaultFolderRules()
    }]));
    expect(loadChatFolders("family-avatar")[0]).toMatchObject({ symbolId: "folder", colorId: expect.any(String) });

    saveChatFolders("family-avatar", [{
      ...loadChatFolders("family-avatar")[0], symbolId: "star", colorId: "purple"
    }]);
    expect(loadChatFolders("family-avatar")[0]).toMatchObject({ symbolId: "star", colorId: "purple" });
  });
});

describe("default section folders", () => {
  it("initializes default folders with correct names and natural types", async () => {
    const { loadAllDefaultFolders, loadDefaultSectionFolder } = await import("./defaultChatSectionSettings");
    const dms = loadDefaultSectionFolder("family-default", "dms");
    expect(dms.id).toBe("default-dms");
    expect(dms.name).toBe("Direct messages");
    expect(dms.rules.chatTypes).toEqual(["direct"]);

    const all = loadAllDefaultFolders("family-default");
    expect(all.groups.rules.chatTypes).toEqual(["group"]);
    expect(all.channels.rules.chatTypes).toEqual(["channel"]);
    expect(all.voice.rules.chatTypes).toEqual(["voice"]);
    expect(all.archive.rules.chatTypes).toEqual(["archive"]);
  });

  it("modifies properties and persists default folder customizations", async () => {
    const { loadDefaultSectionFolder, saveDefaultSectionFolder } = await import("./defaultChatSectionSettings");
    const customDms = {
      id: "default-dms",
      name: "Important DMs",
      rules: { ...defaultFolderRules(), chatTypes: ["direct" as const], unreadOnly: true, favoritesOnly: true }
    };
    saveDefaultSectionFolder("family-default-2", "dms", customDms);

    const loaded = loadDefaultSectionFolder("family-default-2", "dms");
    expect(loaded.name).toBe("Important DMs");
    expect(loaded.rules.unreadOnly).toBe(true);
    expect(loaded.rules.favoritesOnly).toBe(true);
  });

  it("tracks deleted default sections and supports restoration", async () => {
    const { loadDeletedDefaultSections, saveDeletedDefaultSections } = await import("./defaultChatSectionSettings");
    expect(loadDeletedDefaultSections("family-del")).toEqual([]);

    saveDeletedDefaultSections("family-del", ["dms", "voice"]);
    expect(loadDeletedDefaultSections("family-del")).toEqual(["dms", "voice"]);

    // Restore
    saveDeletedDefaultSections("family-del", []);
    expect(loadDeletedDefaultSections("family-del")).toEqual([]);
  });
});


