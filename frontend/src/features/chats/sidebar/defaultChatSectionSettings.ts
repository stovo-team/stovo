import type { ChatSectionKey } from "../shared/types";
import { ChatFolder, defaultFolderRules } from "./chatFolders";

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

const defaultGroupsFolderId = "default-groups";

export function loadDefaultGroupsFolder(familyId: string, legacyName?: string): ChatFolder {
  const fallback: ChatFolder = {
    id: defaultGroupsFolderId,
    name: legacyName ?? "Groups",
    rules: { ...defaultFolderRules(), chatTypes: ["group"] }
  };
  if (typeof window === "undefined" || !familyId) return fallback;
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(`stovo:default-groups-folder:${familyId}`) ?? "null");
    if (!value || typeof value !== "object") return fallback;
    const folder = value as Partial<ChatFolder>;
    if (typeof folder.name !== "string" || !folder.name.trim() || !folder.rules) return fallback;
    return { id: defaultGroupsFolderId, name: folder.name.trim(), rules: folder.rules };
  } catch {
    return fallback;
  }
}

export function saveDefaultGroupsFolder(familyId: string, folder: ChatFolder) {
  if (typeof window === "undefined" || !familyId) return;
  window.localStorage.setItem(`stovo:default-groups-folder:${familyId}`, JSON.stringify({ ...folder, id: defaultGroupsFolderId }));
}
