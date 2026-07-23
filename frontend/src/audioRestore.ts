export interface AudioRestoreTarget {
  chatId: string;
  messageId: string;
  fileId: string;
}

export interface AudioRestoreChat {
  id: string;
}

export interface AudioRestoreAttachment {
  id: string;
  mimeType: string;
  deletedAt?: string | null;
}

export interface AudioRestoreMessage {
  id: string;
  chatId: string;
  attachments?: AudioRestoreAttachment[] | null;
}

function isOpaqueId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Authorizes an opaque native recovery hint against already-loaded app data.
 * This intentionally does not route, decode IDs, request data, or control playback.
 */
export function validateAudioRestoreTarget(
  identity: AudioRestoreTarget | null | undefined,
  chats: readonly AudioRestoreChat[] | null | undefined,
  messages: readonly AudioRestoreMessage[] | null | undefined
): AudioRestoreTarget | null {
  if (
    !identity ||
    !isOpaqueId(identity.chatId) ||
    !isOpaqueId(identity.messageId) ||
    !isOpaqueId(identity.fileId) ||
    !chats ||
    !messages
  ) {
    return null;
  }

  if (!chats.some((chat) => chat.id === identity.chatId)) {
    return null;
  }

  const message = messages.find(
    (candidate) => candidate.id === identity.messageId && candidate.chatId === identity.chatId
  );
  const attachment = message?.attachments?.find((candidate) => candidate.id === identity.fileId);
  if (!attachment || attachment.deletedAt != null || !attachment.mimeType.startsWith("audio/")) {
    return null;
  }

  return {
    chatId: identity.chatId,
    messageId: identity.messageId,
    fileId: identity.fileId
  };
}
