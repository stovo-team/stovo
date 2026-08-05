import type { Message } from "../../../api/chats";
import type { FamilyFile } from "../../../api/files";

import type { MessageStatusValue, SendMessageErrorAck } from "./types";

export function createClientMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function inferOptimisticMessageType(files: FamilyFile[], content: string | null): Message["type"] {
  if (files.length === 0) {
    return "text";
  }
  const kinds = new Set(
    files.map((file) => {
      if (file.mimeType.startsWith("image/")) {
        return "image";
      }
      if (file.mimeType.startsWith("video/")) {
        return "video";
      }
      return "file";
    })
  );
  if (content || kinds.size > 1) {
    return "mixed";
  }
  return kinds.has("image") ? "image" : kinds.has("video") ? "video" : "file";
}

export function mergeIncomingMessage(current: Message[], incoming: Message) {
  const clientMessageId = incoming.clientMessageId;
  const message = {
    ...incoming,
    clientMessageId: undefined,
    deliveryError: incoming.deliveryError,
    deliveryState: undefined
  };
  if (clientMessageId) {
    const pendingIndex = current.findIndex(
      (existing) => existing.clientMessageId === clientMessageId
    );
    if (pendingIndex !== -1) {
      const replaced = current.map((existing, index) => (index === pendingIndex ? message : existing));
      const deduped = new Map<string, Message>();
      for (const item of replaced) {
        deduped.set(item.id, item);
      }
      return Array.from(deduped.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
  }
  if (current.some((existing) => existing.id === message.id)) {
    return current.map((existing) => (existing.id === message.id ? message : existing));
  }
  return [...current, message];
}

export function addMessageStatus(
  message: Message,
  userId: string,
  status: MessageStatusValue,
  createdAt: string
) {
  if (message.senderId === userId) {
    return message;
  }
  if (
    message.statuses.some(
      (existing) => existing.userId === userId && existing.status === status
    )
  ) {
    return message;
  }
  return {
    ...message,
    statuses: [...message.statuses, { userId, status, createdAt }]
  };
}

export function markMessagesReadThrough(
  current: Message[],
  payload: { chatId: string; messageId: string; userId: string }
) {
  const targetIndex = current.findIndex(
    (message) => message.chatId === payload.chatId && message.id === payload.messageId
  );
  if (targetIndex === -1) {
    return current;
  }
  const createdAt = new Date().toISOString();
  return current.map((message, index) =>
    index <= targetIndex && message.chatId === payload.chatId
      ? addMessageStatus(message, payload.userId, "read", createdAt)
      : message
  );
}

export function markMessageDelivered(
  current: Message[],
  payload: { messageId: string; userIds?: string[] }
) {
  if (!payload.userIds?.length) {
    return current;
  }
  const createdAt = new Date().toISOString();
  return current.map((message) => {
    if (message.id !== payload.messageId) {
      return message;
    }
    return payload.userIds!.reduce(
      (updated, userId) => addMessageStatus(updated, userId, "delivered", createdAt),
      message
    );
  });
}

export function replaceMessage(current: Message[], updated: Message) {
  return current.map((message) => (message.id === updated.id ? updated : message));
}

export function uniqueUserIds(userIds: string[]) {
  return Array.from(new Set(userIds));
}

export function optimisticReactionUpdate(message: Message, userId: string, emoji: string, add: boolean) {
  const reactions = message.reactions
    .map((reaction) => ({
      ...reaction,
      userIds: uniqueUserIds(reaction.userIds.filter((id) => id !== userId))
    }))
    .filter((reaction) => reaction.userIds.length > 0);

  if (add) {
    const existing = reactions.find((reaction) => reaction.emoji === emoji);
    if (existing) {
      existing.userIds = uniqueUserIds([...existing.userIds, userId]);
    } else {
      reactions.push({
        emoji,
        count: 1,
        userIds: [userId],
        reacted: true
      });
    }
  }

  return {
    ...message,
    reactions: reactions.map((reaction) => ({
      ...reaction,
      count: reaction.userIds.length,
      reacted: reaction.userIds.includes(userId)
    }))
  };
}

export function isMessageAck(value: unknown): value is Message {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<Message>;
  return typeof candidate.id === "string" && typeof candidate.chatId === "string";
}

export function isErrorAck(value: unknown): value is SendMessageErrorAck {
  return Boolean(value && typeof value === "object" && (value as SendMessageErrorAck).ok === false);
}

export function markPendingMessageFailed(
  current: Message[],
  clientMessageId: string,
  deliveryError: string
) {
  return current.map((message) =>
    message.clientMessageId === clientMessageId
      ? {
          ...message,
          deliveryError,
          deliveryState: "failed" as const
        }
      : message
  );
}

export function mergeMessageLists(current: Message[], incoming: Message[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
