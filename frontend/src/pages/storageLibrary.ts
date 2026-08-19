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
};

export type StorageFilter = "all" | "photos" | "videos" | "audio" | "documents" | "favorites";

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
  return filter === "all" || (filter === "favorites" ? Boolean(file.isFavorite) : storageFileKind(file) === filter);
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
    voice?: string;
    family?: string;
    groups?: string;
    channels?: string;
    direct?: string;
  }
) {
  const filesByChat = new Map<string, TFile[]>();
  for (const file of files) {
    if (!file.chatId) continue;
    filesByChat.set(file.chatId, [...(filesByChat.get(file.chatId) ?? []), file]);
  }

  const sourceFor = (chat: StorageChatLike<TFile>): StorageSource<TFile> | null => {
    const chatFiles = filesByChat.get(chat.id);
    if (!chatFiles) return null;
    const otherMember = chat.members.find((member) => member.id !== currentUserId);
    const label = chat.type === "direct"
      ? otherMember?.displayName ?? "Direct chat"
      : chat.type === "archive"
        ? "Message Archive"
        : chat.title ?? "General Family Chat";
    return {
      chatId: chat.id,
      label,
      avatarFile: chat.chatPhoto ?? (chat.type === "direct" ? otherMember?.profilePhoto ?? null : null),
      avatarKind: chat.type,
      fileCount: chatFiles.length
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
      sources: chats.filter((chat) => types.includes(chat.type)).map(sourceFor).filter(Boolean) as StorageSource<TFile>[]
    }))
    .filter((group) => group.sources.length > 0);
}

