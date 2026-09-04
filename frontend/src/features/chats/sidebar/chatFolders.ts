import type { Chat } from "../../../api/chats";

export type FolderChatType = Exclude<Chat["type"], "family" | "archive">;

export type ChatFolderRules = {
  chatTypes: FolderChatType[];
  titleIncludes: string;
  unreadOnly: boolean;
  mutedOnly: boolean;
  favoritesOnly: boolean;
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
  { value: "voice", label: "Audio channels" }
];

export const defaultFolderRules = (): ChatFolderRules => ({
  chatTypes: [],
  titleIncludes: "",
  unreadOnly: false,
  mutedOnly: false,
  favoritesOnly: false
});

export function matchesFolder(chat: Chat, rules: ChatFolderRules, chatName: string): boolean {
  // The personal archive and the server-wide family chat are structural views,
  // not ordinary conversations users should accidentally sweep into a folder.
  if (chat.type === "archive" || chat.type === "family") return false;
  if (rules.chatTypes.length > 0 && !rules.chatTypes.includes(chat.type as FolderChatType)) return false;
  if (rules.unreadOnly && chat.unreadCount <= 0) return false;
  if (rules.mutedOnly && !chat.isMuted) return false;
  if (rules.favoritesOnly && !chat.isFavorite) return false;
  const titleNeedle = rules.titleIncludes.trim().toLocaleLowerCase();
  return !titleNeedle || chatName.toLocaleLowerCase().includes(titleNeedle);
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
