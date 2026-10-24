import type { Chat, Message } from "./chats";
import type { ChatArchive } from "../features/chats/transfer/archive";
import { apiRequest } from "./client";

export type ChatExportSource = {
  chatId: string;
  chat: Chat;
  messages: Message[];
};

export type ChatImportPreparedContent = Record<string, {
  ciphertext?: string;
  nonce?: string;
  encryptionMetadata?: string;
}>;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export function getChatExportSource(accessToken: string, chatId: string) {
  return apiRequest<ChatExportSource>(`/api/chats/${encodeURIComponent(chatId)}/transfer-source`, {
    accessToken,
    cache: "no-store"
  });
}

export function commitChatImport(
  accessToken: string,
  archive: ChatArchive,
  idempotencyKey: string,
  preparedContent?: ChatImportPreparedContent
) {
  const jsonArchive = {
    ...archive,
    attachments: (archive.attachments ?? []).map(({ bytes, ...attachment }) => ({
      ...attachment,
      ...(bytes !== undefined ? { bytes: bytesToBase64(bytes) } : {})
    }))
  };
  return apiRequest<Chat>("/api/chat-imports", {
    method: "POST",
    accessToken,
    headers: { "Idempotency-Key": idempotencyKey },
    body: { archive: jsonArchive, ...(preparedContent ? { preparedContent } : {}) }
  });
}
