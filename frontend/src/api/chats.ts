import { UserRole } from "./auth";
import { apiRequest } from "./client";
import { FamilyFile } from "./files";

export interface ChatMember {
  id: string;
  displayName: string;
  username: string;
  role: UserRole;
  publicKey: string | null;
  profilePhoto: FamilyFile | null;
}

export interface Chat {
  id: string;
  familyId: string;
  type: "family" | "direct" | "group" | "channel";
  title: string | null;
  createdBy: string | null;
  mediaVisibility: "family" | "members";
  commentsEnabled: boolean;
  encryptionProtocol: MessageEncryptionProtocol;
  mediaVisibilityPendingApproval: boolean;
  mediaVisibilityApprovalCount: number;
  mediaVisibilityApprovalRequired: number;
  myMediaVisibilityApproval: boolean;
  chatPhoto: FamilyFile | null;
  createdAt: string;
  updatedAt: string;
  members: ChatMember[];
  unreadCount: number;
  lastMessageId: string | null;
  lastMessageSenderId: string | null;
  lastMessageSenderDisplayName: string | null;
  lastMessageContent: string | null;
  lastMessageType: Message["type"] | null;
  lastMessageCreatedAt: string | null;
  isMuted: boolean;
  isPinned: boolean;
  isFavorite: boolean;
  pinPermission?: "everyone" | "admins_only";
}

export type MessageEncryptionProtocol = "end_to_end" | "server_at_rest" | "legacy_plaintext";

export interface MessageStatus {
  userId: string;
  status: "sent" | "delivered" | "read";
  createdAt: string;
}

export interface MessageForward {
  messageId: string;
  chatId: string;
  senderId: string;
  senderDisplayName: string | null;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  userIds: string[];
  reacted: boolean;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderDisplayName: string | null;
  type: "text" | "image" | "video" | "file" | "mixed";
  content: string | null;
  encryptionProtocol: MessageEncryptionProtocol;
  ciphertext: string | null;
  nonce: string | null;
  keyVersion: number | null;
  encryptionMetadata: string | null;
  replyToMessageId: string | null;
  threadRootMessageId: string | null;
  messageKind: "chat" | "thread";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isEdited: boolean;
  forwardedFrom?: MessageForward | null;
  statuses: MessageStatus[];
  reactions: MessageReaction[];
  attachments: FamilyFile[];
  clientMessageId?: string;
  deliveryError?: string;
  deliveryState?: "sending" | "failed";
}

export function getChats(accessToken: string) {
  return apiRequest<Chat[]>("/api/chats", { accessToken });
}

export function getChat(accessToken: string, chatId: string) {
  return apiRequest<Chat>(`/api/chats/${chatId}`, { accessToken });
}

export function createDirectChat(accessToken: string, userId: string) {
  return apiRequest<Chat>("/api/chats/direct", {
    method: "POST",
    accessToken,
    body: { userId }
  });
}

export function createGroupChat(
  accessToken: string,
  payload: { title: string; memberIds: string[] }
) {
  return apiRequest<Chat>("/api/chats/group", {
    method: "POST",
    accessToken,
    body: payload
  });
}

export function createChannelChat(
  accessToken: string,
  payload: { title: string; memberIds: string[] }
) {
  return apiRequest<Chat>("/api/chats/channel", {
    method: "POST",
    accessToken,
    body: payload
  });
}

export function updateChat(
  accessToken: string,
  chatId: string,
  payload: {
    title?: string;
    mediaVisibility?: "family" | "members";
    chatPhotoFileId?: string;
    commentsEnabled?: boolean;
  }
) {
  return apiRequest<Chat>(`/api/chats/${chatId}`, {
    method: "PATCH",
    accessToken,
    body: payload
  });
}

export function updateChatPreferences(
  accessToken: string,
  chatId: string,
  payload: { isMuted?: boolean; isPinned?: boolean; isFavorite?: boolean }
) {
  return apiRequest<Chat>(`/api/chats/${chatId}/preferences`, {
    method: "PATCH",
    accessToken,
    body: payload
  });
}

export function getMessages(
  accessToken: string,
  chatId: string,
  before?: string,
  limit = 50,
  threadRootMessageId?: string
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) {
    params.set("before", before);
  }
  if (threadRootMessageId) {
    params.set("threadRootMessageId", threadRootMessageId);
  }
  return apiRequest<Message[]>(`/api/chats/${chatId}/messages?${params.toString()}`, {
    accessToken
  });
}

export function sendMessage(
  accessToken: string,
  chatId: string,
  content: string | null,
  fileIds: string[] = [],
  replyToMessageId: string | null = null,
  threadRootMessageId: string | null = null,
  encryption?: {
    encryptionProtocol: MessageEncryptionProtocol;
    ciphertext?: string | null;
    nonce?: string | null;
    keyVersion?: number | null;
    encryptionMetadata?: string | null;
  }
) {
  return apiRequest<Message>(`/api/chats/${chatId}/messages`, {
    method: "POST",
    accessToken,
    body: {
      type: fileIds.length ? "mixed" : "text",
      content,
      fileIds,
      replyToMessageId,
      threadRootMessageId,
      ...encryption
    }
  });
}

export function forwardMessage(accessToken: string, messageId: string, chatId: string) {
  return apiRequest<Message>(`/api/messages/${messageId}/forward`, {
    method: "POST",
    accessToken,
    body: { chatId }
  });
}

export function markMessageRead(accessToken: string, messageId: string) {
  return apiRequest<Message>(`/api/messages/${messageId}/read`, {
    method: "PATCH",
    accessToken
  });
}

export function addMessageReaction(accessToken: string, messageId: string, emoji: string) {
  return apiRequest<Message>(`/api/messages/${messageId}/reactions`, {
    method: "POST",
    accessToken,
    body: { emoji }
  });
}

export function removeMessageReaction(accessToken: string, messageId: string, emoji: string) {
  return apiRequest<Message>(`/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
    method: "DELETE",
    accessToken
  });
}

export function editMessage(accessToken: string, messageId: string, content: string) {
  return apiRequest<Message>(`/api/messages/${messageId}`, {
    method: "PATCH",
    accessToken,
    body: { content }
  });
}

export function deleteMessage(accessToken: string, messageId: string, scope: "everyone" | "me") {
  return apiRequest<{ messageId: string; chatId: string }>(
    `/api/messages/${messageId}?scope=${scope}`,
    {
      method: "DELETE",
      accessToken
    }
  );
}

export interface PinnedMessage {
  chatId: string;
  messageId: string;
  pinnedBy: string;
  pinnedAt: string;
  message: Message;
}

export function getPinnedMessages(accessToken: string, chatId: string) {
  return apiRequest<PinnedMessage[]>(`/api/chats/${chatId}/pins`, { accessToken });
}

export function pinMessage(accessToken: string, chatId: string, messageId: string) {
  return apiRequest<PinnedMessage>(`/api/chats/${chatId}/pins/${messageId}`, {
    method: "POST",
    accessToken
  });
}

export function unpinMessage(accessToken: string, chatId: string, messageId: string) {
  return apiRequest<{ chatId: string; messageId: string }>(
    `/api/chats/${chatId}/pins/${messageId}`,
    {
      method: "DELETE",
      accessToken
    }
  );
}

export function updateChatPinPermission(
  accessToken: string,
  chatId: string,
  pinPermission: "everyone" | "admins_only"
) {
  return apiRequest<Chat>(`/api/chats/${chatId}`, {
    method: "PATCH",
    accessToken,
    body: { pinPermission }
  });
}
