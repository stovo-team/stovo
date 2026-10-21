import { forwardMessage, sendMessage, type Chat, type Message } from "../../../api/chats";
import { decryptMessage, encryptMessageContent } from "../../../api/messageCrypto";
import { applyMessagePreviewToChat } from "../shared/chatPresentation";
import { createClientMessageId, mergeIncomingMessage } from "../shared/messageState";
import type { MessageStateUpdate } from "../shared/types";

export async function forwardMessages({ accessToken, currentUser, targets, targetChatId, chats, applyMessagesForChat, onChatsUpdate, onError }: {
  accessToken: string;
  currentUser: { id: string; displayName: string } | null;
  targets: Message[];
  targetChatId: string;
  chats: Chat[];
  applyMessagesForChat: (chatId: string, next: MessageStateUpdate) => void;
  onChatsUpdate: (update: (current: Chat[]) => Chat[]) => void;
  onError: (message: string) => void;
}) {
  const targetChat = chats.find((chat) => chat.id === targetChatId);
  const pending = targets.map((message): Message => ({
    ...message,
    id: `local-forward-${createClientMessageId()}`,
    clientMessageId: undefined,
    chatId: targetChatId,
    senderId: currentUser?.id ?? message.senderId,
    senderDisplayName: currentUser?.displayName ?? null,
    createdAt: new Date().toISOString(),
    statuses: [], reactions: [], replyToMessageId: null, threadRootMessageId: null,
    deliveryState: "sending",
    forwardedFrom: message.forwardedFrom ?? { messageId: message.id, chatId: message.chatId, senderId: message.senderId, senderDisplayName: message.senderDisplayName ?? null }
  }));
  applyMessagesForChat(targetChatId, (current) => [...current, ...pending]);
  onChatsUpdate((current) => current.map((chat) => chat.id === targetChatId ? applyMessagePreviewToChat(chat, pending.at(-1)!) : chat));
  await Promise.all(targets.map(async (message, index) => {
    try {
      let forwarded: Message;
      if (targetChat && message.encryptionProtocol === "end_to_end" && message.content?.trim() && message.attachments.length === 0) {
        const encrypted = await encryptMessageContent(targetChat, message.content, currentUser?.id);
        const created = await sendMessage(accessToken, targetChatId, encrypted.content, [], null, null, encrypted.encryption);
        forwarded = await decryptMessage(targetChatId, created, currentUser?.id);
      } else {
        forwarded = await forwardMessage(accessToken, message.id, targetChatId);
      }
      applyMessagesForChat(targetChatId, (current) => mergeIncomingMessage(current.filter((item) => item.id !== pending[index].id), forwarded));
      onChatsUpdate((current) => current.map((chat) => chat.id === targetChatId ? applyMessagePreviewToChat(chat, forwarded) : chat));
    } catch (error) {
      applyMessagesForChat(targetChatId, (current) => current.map((item) => item.id === pending[index].id ? { ...item, deliveryState: "failed" } : item));
      onError(error instanceof Error ? error.message : "Could not forward message");
    }
  }));
}
