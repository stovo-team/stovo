import { Dispatch, SetStateAction } from "react";
import { Chat, sendMessage } from "../../../api/chats";
import { ApiError } from "../../../api/client";
import { decryptMessage, encryptMessageContent } from "../../../api/messageCrypto";
import { applyMessagePreviewToChat } from "../shared/chatPresentation";
import { mergeIncomingMessage } from "../shared/messageState";
import type { MessageStateUpdate } from "../shared/types";

type Options = {
  text: string; accessToken: string | null; currentUser: { id: string } | null; selectedChat: Chat | null;
  canPostInSelectedChannel: boolean; applyMessagesForChat: (chatId: string, update: MessageStateUpdate) => void;
  onChatsUpdate: Dispatch<SetStateAction<Chat[]>>; onError: (message: string | null) => void;
};

export async function sendQueuedNotificationReply(options: Options) {
  const { text, accessToken, currentUser, selectedChat, canPostInSelectedChannel, applyMessagesForChat, onChatsUpdate, onError } = options;
  const content = text.trim();
  if (!content || !accessToken || !currentUser || !selectedChat) return;
  if (selectedChat.type === "channel" && !canPostInSelectedChannel) return onError("You do not have permission to post in this channel");
  try {
    const encrypted = await encryptMessageContent(selectedChat, content, currentUser.id);
    const message = await sendMessage(accessToken, selectedChat.id, encrypted.content, [], null, null, encrypted.encryption);
    const displayMessage = await decryptMessage(selectedChat.id, message, currentUser.id);
    applyMessagesForChat(selectedChat.id, (current) => mergeIncomingMessage(current, displayMessage));
    onChatsUpdate((current) => current.map((chat) => chat.id === selectedChat.id ? { ...applyMessagePreviewToChat(chat, displayMessage), unreadCount: 0 } : chat));
  } catch (error) { onError(error instanceof ApiError ? String(error.message) : "Message failed"); }
}
