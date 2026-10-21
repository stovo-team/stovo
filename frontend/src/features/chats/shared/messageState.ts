import type { Message } from "../../../api/chats";
import type { FamilyFile } from "../../../api/files";

import type { MessageStatusValue, SendMessageErrorAck } from "./types";

export function createClientMessageId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }
  // The server uses this value as a UUID operation key. Keep the fallback UUID
  // shaped for older WebViews that do not expose crypto.randomUUID().
  const bytes = new Uint8Array(16);
  if (cryptoApi) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
  if (incoming.type === "call" && incoming.call?.roomId && !incoming.id.startsWith("local-call:")) {
    current = current.filter((message) => message.id !== `local-call:${incoming.call!.roomId}`);
  }
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
      const pending = current[pendingIndex];
      // `attachmentsPending` messages are broadcast once when their server row
      // is created and again after files are attached. Keep the client id and
      // sending state across the empty intermediate broadcast so the upload can
      // still complete or fail the same bubble.
      const replacement =
        pending.deliveryState === "sending" &&
        pending.type === "mixed" &&
        message.type === "mixed" &&
        message.attachments.length === 0
          ? { ...message, clientMessageId, deliveryState: "sending" as const }
          : message;
      const replaced = current.map((existing, index) => (index === pendingIndex ? replacement : existing));
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
  // History and replica-sync messages can arrive before the HTTP response
  // that sent them. Reuse the same reconciliation path so a durable server
  // message replaces its optimistic outbox counterpart instead of leaving a
  // second bubble marked as "sending".
  return incoming.reduce(
    (merged, message) => mergeIncomingMessage(merged, message),
    [...current]
  ).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
