import { useEffect, useRef, useState, useCallback } from "react";
import type { Socket } from "socket.io-client";
import { App as CapacitorApp } from "@capacitor/app";

import { ApiError } from "../../../api/client";
import type { Chat, Message, MessageEncryptionProtocol } from "../../../api/chats";
import { sendMessage } from "../../../api/chats";
import { type FamilyFile, uploadFile } from "../../../api/files";
import { seedMediaBlobCache } from "../../../mediaBlobCache";
import { decryptMessage, encryptMessageContent } from "../../../api/messageCrypto";
import type { User } from "../../../api/auth";
import { applyMessagePreviewToChat } from "../shared/chatPresentation";
import { createClientMessageId, markPendingMessageFailed, mergeIncomingMessage } from "../shared/messageState";
import type { MessageStateUpdate } from "../shared/types";
import {
  enqueueOutboxMessage,
  getOutboxMessages,
  removeOutboxMessage,
  updateOutboxMessage,
  type QueuedOutboxAttachment,
  type QueuedOutboxMessage
} from "./messageOutboxStore";
import { computeNextReminderDate } from "./reminderSchedule";

export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true;
  }
  if (err instanceof TypeError && /failed to fetch|network|load failed/i.test(err.message)) {
    return true;
  }
  if (err && typeof err === "object") {
    if ("name" in err && (err as { name: string }).name === "AbortError") {
      return true;
    }
    if ("status" in err) {
      const status = Number((err as { status: number }).status);
      return status === 0 || status === 408 || status === 502 || status === 503 || status === 504;
    }
    if ("message" in err) {
      const msg = String((err as { message: string }).message);
      if (/network|offline|failed to fetch|timeout|econnrefused/i.test(msg)) {
        return true;
      }
    }
  }
  return false;
}

export function reconstructFileFromQueuedAttachment(attachment: QueuedOutboxAttachment): File {
  if (attachment.blob) {
    return new File([attachment.blob], attachment.name, { type: attachment.mimeType });
  }
  if (attachment.dataBase64) {
    try {
      const byteCharacters = atob(attachment.dataBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: attachment.mimeType });
      return new File([blob], attachment.name, { type: attachment.mimeType });
    } catch {
      // Fallback
    }
  }
  return new File([], attachment.name, { type: attachment.mimeType });
}

export interface OutboxProcessOptions {
  accessToken: string;
  currentUser: User;
  chats: Chat[];
  applyMessagesForChat: (chatId: string, next: MessageStateUpdate) => void;
  onChatsUpdate?: (updater: (current: Chat[]) => Chat[]) => void;
  onError?: (error: string) => void;
}

let activeDrainPromise: Promise<void> | null = null;

export async function drainOutboxQueue(options: OutboxProcessOptions): Promise<void> {
  if (activeDrainPromise) {
    return activeDrainPromise;
  }

  activeDrainPromise = (async () => {
    const { accessToken, currentUser, chats, applyMessagesForChat, onChatsUpdate, onError } = options;
    if (!accessToken || !currentUser?.id) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    const queuedMessages = await getOutboxMessages(currentUser.id);
    if (!queuedMessages.length) return;

    for (const item of queuedMessages) {
      if (item.status === "failed") {
        continue;
      }
      if (item.scheduledFor) {
        const scheduledTime = new Date(item.scheduledFor).getTime();
        if (!Number.isNaN(scheduledTime) && scheduledTime > Date.now()) {
          continue;
        }
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        break;
      }

      await updateOutboxMessage(item.id, currentUser.id, {
        status: "sending",
        attemptCount: item.attemptCount + 1,
        lastAttemptAt: Date.now()
      });

      try {
        // 1. Upload any pending attachments
        const uploadedAttachments: FamilyFile[] = [];
        let hasAttachmentChanges = false;
        for (const att of item.attachments) {
          if (att.uploadedFileId) {
            uploadedAttachments.push(
              att.uploadedFile ?? {
                id: att.uploadedFileId,
                familyId: "",
                uploadedBy: currentUser.id,
                chatId: item.chatId,
                chatTitle: null,
                chatType: null,
                originMessageId: null,
                accessScope: "chat" as const,
                storageProvider: "local",
                originalName: att.name,
                mimeType: att.mimeType,
                sizeBytes: att.size,
                checksum: null,
                createdAt: item.createdAt,
                deletedAt: null,
                isFavorite: false
              }
            );
          } else {
            const file = reconstructFileFromQueuedAttachment(att);
            try {
              seedMediaBlobCache(att.id, file);
            } catch {
              // Non-fatal
            }
            const uploaded = await uploadFile(accessToken, file, item.chatId);
            att.uploadedFileId = uploaded.id;
            att.uploadedFile = uploaded;
            uploadedAttachments.push(uploaded);
            hasAttachmentChanges = true;
          }
        }

        if (hasAttachmentChanges) {
          await updateOutboxMessage(item.id, currentUser.id, {
            attachments: item.attachments
          });
        }

        // 2. Encrypt message if chat uses end-to-end
        const targetChat = chats.find((c) => c.id === item.chatId) ?? {
          id: item.chatId,
          encryptionProtocol: item.encryptionProtocol ?? "legacy_plaintext",
          members: []
        } as unknown as Chat;

        const encrypted = await encryptMessageContent(targetChat, item.content, currentUser.id);

        // 3. Send message to server
        const fileIds = uploadedAttachments.map((f) => f.id);
        const serverMessage = await sendMessage(
          accessToken,
          item.chatId,
          encrypted.content,
          fileIds,
          item.replyToMessageId,
          item.threadRootMessageId,
          encrypted.encryption,
          item.mentionedUserIds
        );

        // 4. Decrypt received message
        const displayMessage = await decryptMessage(item.chatId, serverMessage, currentUser.id);

        // 5. Update local state
        applyMessagesForChat(item.chatId, (current) =>
          mergeIncomingMessage(current, { ...displayMessage, clientMessageId: item.clientMessageId })
        );

        if (onChatsUpdate) {
          onChatsUpdate((currentChats) =>
            currentChats.map((chat) =>
              chat.id === item.chatId
                ? { ...applyMessagePreviewToChat(chat, displayMessage), unreadCount: 0 }
                : chat
            )
          );
        }

        // 6. Delete from outbox store upon successful send
        await removeOutboxMessage(item.id, currentUser.id);

        // 7. If this is a repeating reminder with remaining counts, enqueue next occurrence
        if (item.isReminder && item.reminderRule && item.reminderRule.remainingCount > 1) {
          const nextScheduled = computeNextReminderDate(item.scheduledFor ?? new Date(), item.reminderRule);
          const nextClientMessageId = createClientMessageId();
          const nextItem: QueuedOutboxMessage = {
            ...item,
            id: nextClientMessageId,
            clientMessageId: nextClientMessageId,
            createdAt: new Date().toISOString(),
            status: "scheduled",
            attemptCount: 0,
            deliveryError: null,
            scheduledFor: nextScheduled.toISOString(),
            reminderRule: {
              ...item.reminderRule,
              remainingCount: item.reminderRule.remainingCount - 1
            }
          };
          await enqueueOutboxMessage(nextItem);
        }
      } catch (err) {
        if (isNetworkError(err)) {
          // Network failed: keep in queue for future retry
          await updateOutboxMessage(item.id, currentUser.id, {
            status: "queued",
            deliveryError: "Offline, waiting for connection"
          });
          // Stop queue draining for now since network is unreachable
          break;
        } else {
          // Unrecoverable server/validation error
          const errorMsg = err instanceof ApiError ? String(err.message) : "Message failed";
          await updateOutboxMessage(item.id, currentUser.id, {
            status: "failed",
            deliveryError: errorMsg
          });
          applyMessagesForChat(item.chatId, (current) =>
            markPendingMessageFailed(current, item.clientMessageId, errorMsg)
          );
          if (onError) {
            onError(errorMsg);
          }
        }
      }
    }
  })().finally(() => {
    activeDrainPromise = null;
  });

  return activeDrainPromise;
}

export interface UseMessageOutboxOptions {
  accessToken: string | null;
  currentUser: User | null;
  chatsRef: { current: Chat[] };
  socketRef?: { current: Socket | null };
  applyMessagesForChat: (chatId: string, next: MessageStateUpdate) => void;
  onChatsUpdate?: (updater: (current: Chat[]) => Chat[]) => void;
  onError?: (error: string) => void;
}

export function useMessageOutbox({
  accessToken,
  currentUser,
  chatsRef,
  socketRef,
  applyMessagesForChat,
  onChatsUpdate,
  onError
}: UseMessageOutboxOptions) {
  const [isProcessing, setIsProcessing] = useState(false);
  const optionsRef = useRef({
    accessToken,
    currentUser,
    chatsRef,
    applyMessagesForChat,
    onChatsUpdate,
    onError
  });

  useEffect(() => {
    optionsRef.current = {
      accessToken,
      currentUser,
      chatsRef,
      applyMessagesForChat,
      onChatsUpdate,
      onError
    };
  }, [accessToken, currentUser, chatsRef, applyMessagesForChat, onChatsUpdate, onError]);

  const triggerDrain = useCallback(async () => {
    const opts = optionsRef.current;
    if (!opts.accessToken || !opts.currentUser) return;
    setIsProcessing(true);
    try {
      await drainOutboxQueue({
        accessToken: opts.accessToken,
        currentUser: opts.currentUser,
        chats: opts.chatsRef.current,
        applyMessagesForChat: opts.applyMessagesForChat,
        onChatsUpdate: opts.onChatsUpdate,
        onError: opts.onError
      });
    } finally {
      setIsProcessing(false);
    }
  }, []);

  useEffect(() => {
    if (!accessToken || !currentUser) return;

    // Trigger immediate drain on mount/auth
    void triggerDrain();

    // Listen for browser online event
    const handleOnline = () => {
      void triggerDrain();
    };

    // Listen for visibility / tab focus change
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void triggerDrain();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    // Listen for Capacitor App state change (for Android/mobile background resume)
    let appStateHandle: { remove: () => void } | null = null;
    CapacitorApp.addListener("appStateChange", (state) => {
      if (state.isActive) {
        void triggerDrain();
      }
    }).then((handle) => {
      appStateHandle = handle;
    }).catch(() => {
      // Capacitor not active on web
    });

    // Listen for socket reconnect event
    const currentSocket = socketRef?.current;
    if (currentSocket) {
      currentSocket.on("connect", handleOnline);
    }

    // Periodic watchdog timer for pending and scheduled messages
    const interval = window.setInterval(() => {
      if (typeof navigator !== "undefined" && navigator.onLine && document.visibilityState === "visible") {
        void triggerDrain();
      }
    }, 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (appStateHandle) {
        appStateHandle.remove();
      }
      if (currentSocket) {
        currentSocket.off("connect", handleOnline);
      }
      window.clearInterval(interval);
    };
  }, [accessToken, currentUser, socketRef, triggerDrain]);

  return {
    triggerDrain,
    isProcessing
  };
}
