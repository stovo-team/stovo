import type { Chat } from "../../../api/chats";

export type FolderChatType = "direct" | "group" | "channel" | "voice" | "archive";

export type ChatFolderRules = {
  chatTypes: FolderChatType[];
  titleIncludes: string;
  unreadOnly: boolean;
  mutedOnly: boolean;
  favoritesOnly: boolean;
  includedChatIds?: string[];
  excludedChatIds?: string[];
};

export type ChatFolder = {
  id: string;
  name: string;
  rules: ChatFolderRules;
};

export const folderChatTypes: Array<{ value: FolderChatType; label: string }> = [
  { value: "direct", label: "Direct messages" },
  { value: "group", label: "Groups" },
  { value: "channel", label: "Channels" },
  { value: "voice", label: "Audio channels" },
  { value: "archive", label: "Message Archive" }
];

export const defaultFolderRules = (): ChatFolderRules => ({
  chatTypes: ["direct", "group", "channel", "voice", "archive"],
  titleIncludes: "",
  unreadOnly: false,
  mutedOnly: false,
  favoritesOnly: false
});

export function folderMatchesChatProperties(chat: Chat, rules: ChatFolderRules, chatName: string): boolean {
  const allowedTypes = rules.chatTypes;
  const isGroup = chat.type === "group" || chat.type === "family";
  const typeMatches = allowedTypes.includes(chat.type as FolderChatType) || (isGroup && allowedTypes.includes("group"));
  if (!typeMatches) return false;

  if (rules.unreadOnly && chat.unreadCount <= 0) return false;
  if (rules.mutedOnly && !chat.isMuted) return false;
  if (rules.favoritesOnly && !chat.isFavorite) return false;
  const titleNeedle = rules.titleIncludes.trim().toLocaleLowerCase();
  return !titleNeedle || chatName.toLocaleLowerCase().includes(titleNeedle);
}

export function matchesFolder(chat: Chat, rules: ChatFolderRules, chatName: string): boolean {
  if (!folderMatchesChatProperties(chat, rules, chatName)) return false;
  if (rules.excludedChatIds && rules.excludedChatIds.includes(chat.id)) return false;
  return Boolean(rules.includedChatIds && rules.includedChatIds.includes(chat.id));
}

function storageKey(familyId: string) {
  return `stovo:chat-folders:${familyId}`;
}

export function loadChatFolders(familyId: string): ChatFolder[] {
  if (typeof window === "undefined" || !familyId) return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey(familyId)) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is ChatFolder => Boolean(
      item && typeof item === "object" && typeof (item as ChatFolder).id === "string" &&
      typeof (item as ChatFolder).name === "string" && (item as ChatFolder).rules
    ));
  } catch {
    return [];
  }
}

export function saveChatFolders(familyId: string, folders: ChatFolder[]) {
  if (typeof window === "undefined" || !familyId) return;
  window.localStorage.setItem(storageKey(familyId), JSON.stringify(folders));
}
