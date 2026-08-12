import type { CSSProperties } from "react";

import type { User } from "../../../api/auth";
import type { Chat, Message, PinnedMessage } from "../../../api/chats";
import type { FamilyFile } from "../../../api/files";

import type {
  ChatAvatarFallbackKind,
  ChatFilter,
  ChatInfoControl,
  ChatSectionKey,
  SharedContentItem,
  SharedContentTab
} from "./types";
import { extractMessageLinks, messagePreviewText } from "./messagePresentation";

export function chatListLayoutClass(minimizedChatLayout: boolean) {
  return minimizedChatLayout ? " messenger-shell--minimized-chat-layout" : "";
}

export function compactChatListLeadingVisual(
  chatType: Chat["type"]
): "lock" | "hash" | "archive" | "avatar" {
  if (chatType === "group" || chatType === "family") {
    return "lock";
  }
  if (chatType === "channel") {
    return "hash";
  }
  if (chatType === "archive") {
    return "archive";
  }
  return "avatar";
}

export function isSuppressedUserError(message: string | null): boolean {
  return message === "Authentication required";
}

export function displayChatName(chat: Chat, currentUserId: string | undefined) {
  if (chat.type === "archive") {
    return "Message Archive";
  }
  if (chat.type === "family" || chat.type === "group" || chat.type === "channel") {
    return chat.title ?? "General Family Chat";
  }
  const otherMember = chat.members.find((member) => member.id !== currentUserId);
  return otherMember?.displayName ?? "Direct chat";
}

export function chatTransitionName(chatId: string, part: "avatar" | "title") {
  return `chat-${chatId}-${part}`;
}

export function transitionAnchorStyle(_name?: string): CSSProperties | undefined {
  return undefined;
}

export function chatInitials(name: string) {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return parts
      .slice(0, 2)
      .map((part) => part.at(0)?.toUpperCase())
      .join("");
  }
  const compact = parts[0] ?? name;
  return compact.slice(0, 2).toUpperCase();
}

export function chatAvatarFallbackKind(chat: Chat): ChatAvatarFallbackKind {
  if (chat.type === "archive") {
    return "archive";
  }
  if (chat.type === "family") {
    return "family";
  }
  if (chat.type === "channel") {
    return "channel";
  }
  if (chat.type === "group") {
    return "group";
  }
  return "direct";
}

export function formatChatTime(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function chatInfoControlVisibility(activeControl: ChatInfoControl) {
  return {
    nameEditor: activeControl === "name",
    settings: activeControl === "settings"
  };
}

export const CHAT_FILTERS: Array<{ label: string; value: ChatFilter }> = [
  { label: "All", value: "all" },
  { label: "Unread", value: "unread" },
  { label: "Groups", value: "groups" },
  { label: "Direct", value: "direct" },
  { label: "Muted", value: "muted" }
];

export const CHAT_SECTION_ORDER: Array<{ key: ChatSectionKey; label: string }> = [
  { key: "archive", label: "Message Archive" },
  { key: "channels", label: "Channels" },
  { key: "groups", label: "Groups" },
  { key: "dms", label: "DMs" }
];

export function chatTypeLabel(chat: Chat) {
  if (chat.type === "family") {
    return "Family chat";
  }
  if (chat.type === "channel") {
    return "Channel";
  }
  if (chat.type === "group") {
    return "Group chat";
  }
  return "Direct chat";
}

export function sortPinsByPosition(pins: PinnedMessage[]): PinnedMessage[] {
  return [...pins].sort(
    (a, b) => new Date(a.message.createdAt).getTime() - new Date(b.message.createdAt).getTime()
  );
}

export function chatAvatarTypeClass(chat: Chat) {
  if (chat.type === "family") {
    return "family";
  }
  if (chat.type === "group" || chat.type === "channel") {
    return "group";
  }
  if (chat.type === "archive") {
    return "archive chat-avatar--archive";
  }
  return "";
}

export function chatPreview(chat: Chat) {
  if (chat.type === "archive") {
    return "";
  }
  if (chat.lastMessageContent && chat.lastMessageSenderDisplayName) {
    return `${chat.lastMessageSenderDisplayName}: ${chat.lastMessageContent}`;
  }
  if (chat.type === "family") {
    return `${chat.members.length} members / private family room`;
  }
  if (chat.type === "channel") {
    return `${chat.members.length} members / read-only channel`;
  }
  if (chat.type === "group") {
    return `${chat.members.length} members / group chat`;
  }
  return "Direct message";
}

export function applyMessagePreviewToChat(chat: Chat, message: Message) {
  return {
    ...chat,
    updatedAt: message.createdAt,
    lastMessageId: message.id,
    lastMessageSenderId: message.senderId,
    lastMessageSenderDisplayName: message.senderDisplayName ?? "Unknown",
    lastMessageContent: messagePreviewText(message),
    lastMessageType: message.type,
    lastMessageCreatedAt: message.createdAt
  };
}

export function canManageChat(chat: Chat, currentUser: User | null) {
  if (!currentUser || chat.type === "direct") {
    return false;
  }
  return (
    currentUser.role === "owner" ||
    currentUser.role === "admin" ||
    ((chat.type === "group" || chat.type === "channel") && chat.createdBy === currentUser.id)
  );
}

export function canUpdateMediaVisibility(chat: Chat, currentUser: User | null) {
  if (chat.type === "family") {
    return false;
  }
  if (chat.type === "direct") {
    return true;
  }
  return canManageChat(chat, currentUser);
}

export function mediaVisibilityToggleChecked(chat: Chat) {
  return chat.mediaVisibility === "family" || chat.myMediaVisibilityApproval;
}

export function sharedContentItemMatchesTab(item: SharedContentItem, tab: SharedContentTab) {
  if (item.kind === "link") {
    return tab === "links";
  }
  if (tab === "files") {
    return !item.file.mimeType.startsWith("image/") && !item.file.mimeType.startsWith("video/");
  }
  return tab === "media";
}

export function computeSharedContentItems(messages: Message[], tab: SharedContentTab): SharedContentItem[] {
  return messages
    .flatMap((message): SharedContentItem[] => [
      ...message.attachments.map((file) => ({
        kind: "attachment" as const,
        file,
        messageId: message.id
      })),
      ...extractMessageLinks(message.content).map((url) => ({
        kind: "link" as const,
        url,
        messageId: message.id
      }))
    ])
    .filter((item) => sharedContentItemMatchesTab(item, tab))
    .reverse();
}

export function canPostToChannel(chat: Chat, currentUser: User | null) {
  if (!currentUser || chat.type !== "channel") {
    return false;
  }
  return (
    currentUser.role === "owner" ||
    currentUser.role === "admin" ||
    chat.createdBy === currentUser.id
  );
}

export function chatAvatarFile(chat: Chat, currentUserId: string | undefined) {
  if (chat.chatPhoto) {
    return chat.chatPhoto;
  }
  if (chat.type === "direct") {
    return chat.members.find((member) => member.id !== currentUserId)?.profilePhoto ?? null;
  }
  return null;
}
