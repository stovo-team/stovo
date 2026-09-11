import { Chat, Message } from "../../../api/chats";
import type { FamilyFile } from "../../../api/files";
import { createClientMessageId, inferOptimisticMessageType } from "../shared/messageState";
import type { PendingLocalAttachment } from "../shared/types";
import type { QueuedOutboxAttachment, QueuedOutboxMessage, ReminderRule } from "../outbox/messageOutboxStore";
import { nativeSourceUriForFile } from "../../../native/mediaLibraryPlugin";

type Options = {
  chat: Chat;
  user: { id: string; displayName: string };
  content: string;
  attachments: PendingLocalAttachment[];
  replyTarget: Message | null;
  threadRootMessageId: string | null;
  mentionedUserIds: string[];
  scheduledFor?: string;
  reminderRule?: ReminderRule;
};

export function createQueuedComposerMessage(options: Options) {
  const { chat, user, content, attachments, replyTarget, threadRootMessageId, mentionedUserIds, scheduledFor, reminderRule } = options;
  const clientMessageId = createClientMessageId();
  const createdAt = new Date().toISOString();
  const threadRootForSend = threadRootMessageId || null;
  const replyToMessageId = threadRootForSend
    ? replyTarget && replyTarget.id !== threadRootForSend ? replyTarget.id : null
    : replyTarget?.id ?? null;
  const outboxAttachments: QueuedOutboxAttachment[] = attachments.map((pending) => ({
    id: pending.localId,
    name: pending.file.name,
    mimeType: pending.file.type,
    size: pending.file.size,
    blob: pending.file,
    uploadOperationId: pending.localId,
    nativeSourceUri: nativeSourceUriForFile(pending.file) ?? undefined,
  }));
  const previewAttachments: FamilyFile[] = attachments.map((pending) => ({
    id: pending.localId, familyId: "", uploadedBy: user.id, chatId: chat.id, chatTitle: chat.title ?? null,
    chatType: chat.type,
    originMessageId: null, accessScope: "chat", storageProvider: "local", originalName: pending.file.name,
    mimeType: pending.file.type, sizeBytes: pending.file.size, checksum: null, createdAt, deletedAt: null, isFavorite: false
  }));
  const optimisticMessage: Message = {
    id: `pending:${clientMessageId}`, chatId: chat.id, senderId: user.id, senderDisplayName: user.displayName,
    type: inferOptimisticMessageType(previewAttachments, content || null), content: content || null,
    encryptionProtocol: chat.encryptionProtocol, ciphertext: null, nonce: null, keyVersion: null, encryptionMetadata: null,
    replyToMessageId, threadRootMessageId: threadRootForSend, messageKind: threadRootForSend ? "thread" : "chat",
    createdAt, updatedAt: createdAt, deletedAt: null, isEdited: false, forwardedFrom: null,
    statuses: [{ userId: user.id, status: "sent", createdAt }], reactions: [], attachments: previewAttachments,
    clientMessageId, deliveryState: scheduledFor ? "scheduled" : "sending", ...(scheduledFor ? { scheduledFor } : {}),
    ...(reminderRule ? { isReminder: true } : {})
  };
  const outboxItem: QueuedOutboxMessage = {
    id: clientMessageId, clientMessageId, chatId: chat.id, userId: user.id, content: content || null,
    replyToMessageId, threadRootMessageId: threadRootForSend, mentionedUserIds, encryptionProtocol: chat.encryptionProtocol,
    attachments: outboxAttachments, createdAt, status: scheduledFor ? "scheduled" : "queued", attemptCount: 0,
    ...(scheduledFor ? { scheduledFor } : {}), ...(reminderRule ? { isReminder: true, reminderRule } : {}), optimisticMessage
  };
  return { optimisticMessage, outboxItem };
}
