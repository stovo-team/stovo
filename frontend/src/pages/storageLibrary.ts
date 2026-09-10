export type StorageFileLike = {
  id: string;
  chatId: string | null;
  chatTitle: string | null;
  chatType: string | null;
  mimeType: string;
  isFavorite?: boolean;
};

export type StorageAvatarKind = "direct" | "family" | "group" | "channel" | "voice" | "archive";

export type StorageChatLike<TFile = StorageFileLike> = {
  id: string;
  type: StorageAvatarKind;
  title: string | null;
  chatPhoto: TFile | null;
  members: Array<{ id: string; displayName: string; profilePhoto: TFile | null }>;
};

export type StorageSource<TFile = StorageFileLike> = {
  chatId: string;
  label: string;
  avatarFile: TFile | null;
  avatarKind: StorageAvatarKind;
  fileCount: number;
  includesUnscopedFiles?: boolean;
};

export type StorageFilter = "all" | "photos" | "videos" | "audio" | "documents" | "canvases" | "checklists" | "favorites";

export function storageSourceLeadingVisual(
  kind: StorageAvatarKind,
  minimizedLayout: boolean
): "lock" | "hash" | "archive" | "avatar" | "voice" {
  if (kind === "archive") return "archive";
  if (!minimizedLayout) return "avatar";
  if (kind === "group" || kind === "family") return "lock";
  if (kind === "channel") return "hash";
  if (kind === "voice") return "voice";
  return "avatar";
}

export function storageFileKind(file: Pick<StorageFileLike, "mimeType">) {
  if (file.mimeType.startsWith("image/")) return "photos";
  if (file.mimeType.startsWith("video/")) return "videos";
  if (file.mimeType.startsWith("audio/")) return "audio";
  return "documents";
}

export function matchesStorageFilter(file: StorageFileLike, filter: StorageFilter) {
  return filter === "all" || (filter === "favorites" ? Boolean(file.isFavorite) : filter !== "canvases" && filter !== "checklists" && storageFileKind(file) === filter);
}

export function groupStorageSources(files: StorageFileLike[]) {
  const buckets = new Map<string, string[]>();
  for (const file of files) {
    if (!file.chatId || buckets.has(file.chatId)) continue;
    buckets.set(file.chatId, [file.id]);
  }
  const category = (file: StorageFileLike) =>
    file.chatType === "archive" ? "MESSAGE ARCHIVE" : file.chatType === "direct" ? "DIRECT CHATS" : "FAMILY CHATS";
  const labels = ["MESSAGE ARCHIVE", "FAMILY CHATS", "DIRECT CHATS"];
  return labels
    .map((label) => ({
      label,
      ids: files.filter((file) => file.chatId && category(file) === label).map((file) => file.chatId as string)
    }))
    .filter((group) => group.ids.length > 0)
    .map((group) => ({ ...group, ids: [...new Set(group.ids)] }));
}

export function buildStorageSources<TFile extends StorageFileLike>(
  files: TFile[],
  chats: StorageChatLike<TFile>[],
  currentUserId: string | undefined,
  categoryLabels?: {
    archive?: string;
    archiveTitle?: string;
    voice?: string;
    family?: string;
    groups?: string;
    channels?: string;
    direct?: string;
  }
) {
  const filesByChat = new Map<string, TFile[]>();
  const unscopedFiles: TFile[] = [];
  for (const file of files) {
    if (!file.chatId) {
      unscopedFiles.push(file);
      continue;
    }
    filesByChat.set(file.chatId, [...(filesByChat.get(file.chatId) ?? []), file]);
  }

  // The file library can be restored from its local cache before the chat
  // directory has finished syncing. Keep those chat folders usable instead of
  // hiding their files until that metadata request catches up.
  const chatsByID = new Map(chats.map((chat) => [chat.id, chat]));
  const fallbackChats: StorageChatLike<TFile>[] = [];
  for (const [chatId, chatFiles] of filesByChat) {
    if (chatsByID.has(chatId)) continue;
    const representative = chatFiles[0];
    const type = representative.chatType;
    if (!isStorageAvatarKind(type)) continue;
    fallbackChats.push({
      id: chatId,
      type,
      title: representative.chatTitle,
      chatPhoto: null,
      members: []
    });
  }
  const chatsWithFiles = [...chats, ...fallbackChats];

  const sourceFor = (chat: StorageChatLike<TFile>): StorageSource<TFile> | null => {
    const directChatFiles = filesByChat.get(chat.id) ?? [];
    // Family-scoped uploads belong in the one family chat's Storage folder.
    // They used to leave the source sidebar empty despite being visible in
    // "All chats" because they do not carry a specific chatId.
    const includesUnscopedFiles = chat.type === "family" && unscopedFiles.length > 0;
    const chatFiles = includesUnscopedFiles
      ? [...directChatFiles, ...unscopedFiles]
      : directChatFiles;
    if (chatFiles.length === 0) return null;
    const otherMember = chat.members.find((member) => member.id !== currentUserId);
    const label = chat.type === "direct"
      ? otherMember?.displayName ?? "Direct chat"
      : chat.type === "archive"
        ? categoryLabels?.archiveTitle ?? "Message Archive"
        : chat.title ?? "General Family Chat";
    return {
      chatId: chat.id,
      label,
      avatarFile: chat.chatPhoto ?? (chat.type === "direct" ? otherMember?.profilePhoto ?? null : null),
      avatarKind: chat.type,
      fileCount: chatFiles.length,
      includesUnscopedFiles: includesUnscopedFiles || undefined
    };
  };

  const labels: Array<{ label: string; types: StorageAvatarKind[] }> = [
    { label: categoryLabels?.archive ?? "MESSAGE ARCHIVE", types: ["archive"] },
    { label: categoryLabels?.voice ?? "VOICE CHANNELS", types: ["voice"] },
    { label: categoryLabels?.family ?? "FAMILY CHATS", types: ["family"] },
    { label: categoryLabels?.groups ?? "GROUPS", types: ["group"] },
    { label: categoryLabels?.channels ?? "CHANNELS", types: ["channel"] },
    { label: categoryLabels?.direct ?? "DIRECT CHATS", types: ["direct"] }
  ];
  return labels
    .map(({ label, types }) => ({
      label,
      sources: chatsWithFiles.filter((chat) => types.includes(chat.type)).map(sourceFor).filter(Boolean) as StorageSource<TFile>[]
    }))
    .filter((group) => group.sources.length > 0);
}

function isStorageAvatarKind(value: string | null): value is StorageAvatarKind {
  return value === "direct" || value === "family" || value === "group" || value === "channel" || value === "voice" || value === "archive";
}

