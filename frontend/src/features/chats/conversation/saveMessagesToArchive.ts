import { archiveMessage, type Chat, type Message } from "../../../api/chats";
import { applyMessagePreviewToChat } from "../shared/chatPresentation";
import { createClientMessageId, mergeIncomingMessage } from "../shared/messageState";
import type { MessageStateUpdate } from "../shared/types";

export async function saveMessagesToArchive({ accessToken, targets, archive, applyMessagesForChat, onChatsUpdate, onError }: {
  accessToken: string;
  targets: Message[];
  archive: Chat | undefined;
  applyMessagesForChat: (chatId: string, next: MessageStateUpdate) => void;
  onChatsUpdate: (update: (chats: Chat[]) => Chat[]) => void;
  onError: (message: string) => void;
}) {
  const pending = archive ? targets.map((message): Message => ({
    ...message, id: `local-archive-${createClientMessageId()}`, clientMessageId: undefined,
    chatId: archive.id, createdAt: new Date().toISOString(), deliveryState: "sending",
    statuses: [], reactions: [], replyToMessageId: null, threadRootMessageId: null,
    forwardedFrom: message.forwardedFrom ?? { messageId: message.id, chatId: message.chatId, senderId: message.senderId, senderDisplayName: message.senderDisplayName ?? null }
  })) : [];
  if (archive) {
    applyMessagesForChat(archive.id, (current) => [...current, ...pending]);
    onChatsUpdate((chats) => chats.map((chat) => chat.id === archive.id ? applyMessagePreviewToChat(chat, pending.at(-1)!) : chat));
  }
  await Promise.all(targets.map(async (message, index) => {
    try {
      const saved = await archiveMessage(accessToken, message.id);
      applyMessagesForChat(saved.chatId, (current) => mergeIncomingMessage(current.filter((item) => item.id !== pending[index]?.id), saved));
      onChatsUpdate((chats) => chats.map((chat) => chat.id === saved.chatId ? applyMessagePreviewToChat(chat, saved) : chat));
    } catch (error) {
      if (archive) applyMessagesForChat(archive.id, (current) => current.map((item) => item.id === pending[index]?.id ? { ...item, deliveryState: "failed" } : item));
      onError(error instanceof Error ? error.message : "Could not save message");
    }
  }));
}
