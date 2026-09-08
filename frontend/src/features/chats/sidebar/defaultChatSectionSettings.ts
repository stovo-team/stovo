import type { ChatSectionKey } from "../shared/types";
import { ChatFolder, defaultFolderRules, type FolderChatType } from "./chatFolders";

export type DefaultChatSectionNames = Partial<Record<ChatSectionKey, string>>;

const sectionKeys: ChatSectionKey[] = ["archive", "groups", "dms", "channels", "voice"];

function storageKey(familyId: string) {
  return `stovo:default-chat-section-names:${familyId}`;
}

export function loadDefaultChatSectionNames(familyId: string): DefaultChatSectionNames {
  if (typeof window === "undefined" || !familyId) return {};
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey(familyId)) ?? "{}");
    if (!value || typeof value !== "object") return {};
    return sectionKeys.reduce<DefaultChatSectionNames>((names, key) => {
      const name = (value as Record<string, unknown>)[key];
      if (typeof name === "string" && name.trim()) names[key] = name.trim();
      return names;
    }, {});
  } catch {
    return {};
  }
}

export function saveDefaultChatSectionNames(familyId: string, names: DefaultChatSectionNames) {
  if (typeof window === "undefined" || !familyId) return;
  window.localStorage.setItem(storageKey(familyId), JSON.stringify(names));
}

export const defaultSectionConfig: Record<ChatSectionKey, { defaultName: string; chatType: FolderChatType }> = {
  archive: { defaultName: "Message Archive", chatType: "archive" },
  groups: { defaultName: "Groups", chatType: "group" },
  dms: { defaultName: "Direct messages", chatType: "direct" },
  channels: { defaultName: "Channels", chatType: "channel" },
  voice: { defaultName: "Audio channels", chatType: "voice" }
};

function defaultFolderStorageKey(familyId: string, section: ChatSectionKey) {
  return `stovo:default-folder:${familyId}:${section}`;
}

export function loadDefaultSectionFolder(familyId: string, section: ChatSectionKey, fallbackName?: string): ChatFolder {
  const config = defaultSectionConfig[section];
  const legacyNames = loadDefaultChatSectionNames(familyId);
  const defaultName = fallbackName || legacyNames[section] || config?.defaultName || section;
  const fallback: ChatFolder = {
    id: `default-${section}`,
    name: defaultName,
    rules: { ...defaultFolderRules(), chatTypes: config ? [config.chatType] : [] }
  };
  if (typeof window === "undefined" || !familyId) return fallback;
  try {
    const key = section === "groups"
      ? `stovo:default-groups-folder:${familyId}`
      : defaultFolderStorageKey(familyId, section);
    const item = window.localStorage.getItem(key);
    if (!item) return fallback;
    const value: unknown = JSON.parse(item);
    if (!value || typeof value !== "object") return fallback;
    const folder = value as Partial<ChatFolder>;
    if (typeof folder.name !== "string" || !folder.name.trim() || !folder.rules) return fallback;
    return { id: `default-${section}`, name: folder.name.trim(), rules: folder.rules };
  } catch {
    return fallback;
  }
}

export function saveDefaultSectionFolder(familyId: string, section: ChatSectionKey, folder: ChatFolder) {
  if (typeof window === "undefined" || !familyId) return;
  const key = section === "groups"
    ? `stovo:default-groups-folder:${familyId}`
    : defaultFolderStorageKey(familyId, section);
  window.localStorage.setItem(key, JSON.stringify({ ...folder, id: `default-${section}` }));

  const currentNames = loadDefaultChatSectionNames(familyId);
  currentNames[section] = folder.name;
  saveDefaultChatSectionNames(familyId, currentNames);
}

export function loadAllDefaultFolders(familyId: string, fallbackLabels?: Partial<Record<ChatSectionKey, string>>): Record<ChatSectionKey, ChatFolder> {
  return sectionKeys.reduce<Record<ChatSectionKey, ChatFolder>>((acc, key) => {
    acc[key] = loadDefaultSectionFolder(familyId, key, fallbackLabels?.[key]);
    return acc;
  }, {} as Record<ChatSectionKey, ChatFolder>);
}

function deletedSectionsKey(familyId: string) {
  return `stovo:deleted-default-sections:${familyId}`;
}

export function loadDeletedDefaultSections(familyId: string): ChatSectionKey[] {
  if (typeof window === "undefined" || !familyId) return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(deletedSectionsKey(familyId)) ?? "[]");
    if (!Array.isArray(value)) return [];
    const validKeys = new Set<string>(sectionKeys);
    return value.filter((k): k is ChatSectionKey => typeof k === "string" && validKeys.has(k));
  } catch {
    return [];
  }
}

export function saveDeletedDefaultSections(familyId: string, deleted: ChatSectionKey[]) {
  if (typeof window === "undefined" || !familyId) return;
  window.localStorage.setItem(deletedSectionsKey(familyId), JSON.stringify(deleted));
}

const defaultGroupsFolderId = "default-groups";

export function loadDefaultGroupsFolder(familyId: string, legacyName?: string): ChatFolder {
  return loadDefaultSectionFolder(familyId, "groups", legacyName);
}

export function saveDefaultGroupsFolder(familyId: string, folder: ChatFolder) {
  saveDefaultSectionFolder(familyId, "groups", folder);
}

function sectionAssignmentsKey(familyId: string) {
  return `stovo:chat-section-assignments:${familyId}`;
}

export function loadChatSectionAssignments(familyId: string): Record<string, ChatSectionKey> {
  if (typeof window === "undefined" || !familyId) return {};
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(sectionAssignmentsKey(familyId)) ?? "{}");
    if (!value || typeof value !== "object") return {};
    const validKeys = new Set<string>(sectionKeys);
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, ChatSectionKey>>((acc, [chatId, target]) => {
      if (typeof target === "string" && validKeys.has(target)) {
        acc[chatId] = target as ChatSectionKey;
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
}

export function saveChatSectionAssignments(familyId: string, assignments: Record<string, ChatSectionKey>) {
  if (typeof window === "undefined" || !familyId) return;
  window.localStorage.setItem(sectionAssignmentsKey(familyId), JSON.stringify(assignments));
}
