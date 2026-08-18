import { Dispatch, RefObject, SetStateAction, useCallback } from "react";
import type { Socket } from "socket.io-client";

import type { Chat, Message, PinnedMessage } from "../../../api/chats";
import { prefetchFiles } from "../../../api/files";
import { decryptMessage } from "../../../api/messageCrypto";
import { applyMessagePreviewToChat, isSuppressedUserError, sortPinsByPosition } from "../shared/chatPresentation";
import {
  markMessageDelivered,
  markMessagesReadThrough,
  markPendingMessageFailed,
  mergeIncomingMessage,
  replaceMessage
} from "../shared/messageState";
import type { MessageStateUpdate } from "../shared/types";
import type { MessageContextMenuState } from "./MessageContextMenu";

export type UseChatRealtimeParams = {
  currentUserId: string | undefined;
  accessTokenRef?: RefObject<string | null>;
  chatsRef: RefObject<Chat[]>;
  activeChatIdRef: RefObject<string | undefined>;
  applyMessagesForChat: (chatId: string, next: MessageStateUpdate) => void;
  onChatsUpdate: Dispatch<SetStateAction<Chat[]>>;
  onSelectedChatUpdate: Dispatch<SetStateAction<Chat | null>>;
  onTypingNamesUpdate: Dispatch<SetStateAction<string[]>>;
  onPinnedMessagesUpdate: Dispatch<SetStateAction<PinnedMessage[]>>;
  onPinIndexUpdate: Dispatch<SetStateAction<number>>;
  onMessageContextMenuUpdate: Dispatch<SetStateAction<MessageContextMenuState | null>>;
  onEditTargetMessageUpdate: Dispatch<SetStateAction<Message | null>>;
  draftBeforeEditRef: RefObject<string>;
  onError: (message: string | null) => void;
  reloadOverview: () => void;
};

/**
 * Binds the message/read/typing/notification socket listeners onto an
 * already-connected socket instance. Call/signaling listeners stay owned by
 * the page since call-session state has not been extracted from ChatsPage
 * yet; this hook only exposes the small "message realtime" surface so
 * conversation/composer UI never has to import socket.io directly.
 */
export function useChatRealtime({
  currentUserId,
  accessTokenRef,
  chatsRef,
  activeChatIdRef,
  applyMessagesForChat,
  onChatsUpdate,
  onSelectedChatUpdate,
  onTypingNamesUpdate,
  onPinnedMessagesUpdate,
  onPinIndexUpdate,
  onMessageContextMenuUpdate,
  onEditTargetMessageUpdate,
  draftBeforeEditRef,
  onError,
  reloadOverview
}: UseChatRealtimeParams) {
  const bindMessageListeners = useCallback(
    (socket: Socket) => {
      const onMessageNew = (message: Message) => {
        void (async () => {
          const displayMessage = await decryptMessage(message.chatId, message, currentUserId);
          const hasKnownChat = chatsRef.current.some((chat) => chat.id === message.chatId);
          const isActiveChat = message.chatId === activeChatIdRef.current;
          const isMine = message.senderId === currentUserId;
          if (displayMessage.attachments?.length && accessTokenRef?.current) {
            prefetchFiles(
              accessTokenRef.current,
              displayMessage.attachments.map((a) => a.id).filter(Boolean)
            );
          }
          onChatsUpdate((current) =>
            current.map((chat) => {
              if (chat.id !== message.chatId) return chat;
              const updated = applyMessagePreviewToChat(chat, displayMessage);
              return { ...updated, unreadCount: isActiveChat || isMine ? 0 : chat.unreadCount + 1 };
            })
          );
          if (!hasKnownChat) {
            reloadOverview();
          }
          if (isActiveChat) {
            onSelectedChatUpdate((current) =>
              current?.id === message.chatId
                ? { ...applyMessagePreviewToChat(current, displayMessage), unreadCount: 0 }
                : current
            );
            applyMessagesForChat(message.chatId, (current) => mergeIncomingMessage(current, displayMessage));
            socket.emit("message:read", { chatId: displayMessage.chatId, messageId: displayMessage.id });
          } else {
            applyMessagesForChat(message.chatId, (current) => mergeIncomingMessage(current, displayMessage));
          }
        })();
      };

      const onMessageUpdated = (message: Message) => {
        void (async () => {
          if (message.chatId !== activeChatIdRef.current) return;
          const displayMessage = await decryptMessage(message.chatId, message, currentUserId);
          if (displayMessage.attachments?.length && accessTokenRef?.current) {
            prefetchFiles(
              accessTokenRef.current,
              displayMessage.attachments.map((a) => a.id).filter(Boolean)
            );
          }
          applyMessagesForChat(message.chatId, (current) => replaceMessage(current, displayMessage));
        })();
      };

      const onMessageDeleted = (payload: { messageId: string; chatId: string }) => {
        applyMessagesForChat(payload.chatId, (current) => current.filter((m) => m.id !== payload.messageId));
        onChatsUpdate((current) =>
          current.map((chat) => {
            if (chat.id !== payload.chatId || chat.lastMessageId !== payload.messageId) return chat;
            return {
              ...chat,
              lastMessageId: null,
              lastMessageSenderId: null,
              lastMessageSenderDisplayName: null,
              lastMessageContent: null,
              lastMessageType: null,
              lastMessageCreatedAt: null
            };
          })
        );
        onMessageContextMenuUpdate((current) => (current?.message.id === payload.messageId ? null : current));
        onEditTargetMessageUpdate((current) => {
          if (current?.id === payload.messageId) {
            draftBeforeEditRef.current = "";
            return null;
          }
          return current;
        });
      };

      const onMessagePinned = (pin: PinnedMessage) => {
        if (pin.chatId !== activeChatIdRef.current) return;
        onPinnedMessagesUpdate((current) => {
          const withoutDup = current.filter((p) => p.messageId !== pin.messageId);
          const sorted = sortPinsByPosition([...withoutDup, pin]);
          onPinIndexUpdate(sorted.length - 1);
          return sorted;
        });
      };

      const onMessageUnpinned = (payload: { chatId: string; messageId: string }) => {
        if (payload.chatId !== activeChatIdRef.current) return;
        onPinnedMessagesUpdate((current) => {
          const updated = current.filter((p) => p.messageId !== payload.messageId);
          onPinIndexUpdate((idx) => (idx >= updated.length ? Math.max(0, updated.length - 1) : idx));
          return updated;
        });
      };

      const onMessageDelivered = (payload: { messageId: string; chatId: string; userIds?: string[] }) => {
        applyMessagesForChat(payload.chatId, (current) => markMessageDelivered(current, payload));
      };

      const onMessageRead = (payload: { messageId: string; chatId: string; userId: string }) => {
        if (payload.userId === currentUserId) {
          onChatsUpdate((current) =>
            current.map((chat) => (chat.id === payload.chatId ? { ...chat, unreadCount: 0 } : chat))
          );
          onSelectedChatUpdate((current) => (current?.id === payload.chatId ? { ...current, unreadCount: 0 } : current));
        }
        applyMessagesForChat(payload.chatId, (current) => markMessagesReadThrough(current, payload));
      };

      const onTypingUpdate = (payload: {
        chatId: string;
        userId: string;
        displayName: string;
        isTyping: boolean;
      }) => {
        if (payload.chatId !== activeChatIdRef.current || payload.userId === currentUserId) return;
        onTypingNamesUpdate((current) => {
          const withoutName = current.filter((name) => name !== payload.displayName);
          return payload.isTyping ? [...withoutName, payload.displayName] : withoutName;
        });
        if (payload.isTyping) {
          window.setTimeout(() => {
            onTypingNamesUpdate((current) => current.filter((name) => name !== payload.displayName));
          }, 5000);
        }
      };

      const onSocketError = (payload: { clientMessageId?: string; message?: string }) => {
        if (payload.clientMessageId) {
          const activeChatId = activeChatIdRef.current;
          if (activeChatId) {
            applyMessagesForChat(activeChatId, (current) =>
              markPendingMessageFailed(current, payload.clientMessageId as string, payload.message ?? "Message failed")
            );
          }
        }
        const message = payload.message ?? "Realtime connection error";
        if (!isSuppressedUserError(message)) {
          onError(message);
        }
      };

      socket.on("message:new", onMessageNew);
      socket.on("message:updated", onMessageUpdated);
      socket.on("message:deleted", onMessageDeleted);
      socket.on("message:pinned", onMessagePinned);
      socket.on("message:unpinned", onMessageUnpinned);
      socket.on("message:delivered", onMessageDelivered);
      socket.on("message:read", onMessageRead);
      socket.on("typing:update", onTypingUpdate);
      socket.on("error", onSocketError);

      return () => {
        socket.off("message:new", onMessageNew);
        socket.off("message:updated", onMessageUpdated);
        socket.off("message:deleted", onMessageDeleted);
        socket.off("message:pinned", onMessagePinned);
        socket.off("message:unpinned", onMessageUnpinned);
        socket.off("message:delivered", onMessageDelivered);
        socket.off("message:read", onMessageRead);
        socket.off("typing:update", onTypingUpdate);
        socket.off("error", onSocketError);
      };
    },
    [
      activeChatIdRef,
      applyMessagesForChat,
      chatsRef,
      currentUserId,
      draftBeforeEditRef,
      onChatsUpdate,
      onEditTargetMessageUpdate,
      onError,
      onMessageContextMenuUpdate,
      onPinIndexUpdate,
      onPinnedMessagesUpdate,
      onSelectedChatUpdate,
      onTypingNamesUpdate,
      reloadOverview
    ]
  );

  return { bindMessageListeners };
}

export type ChatRealtimeApi = ReturnType<typeof useChatRealtime>;
