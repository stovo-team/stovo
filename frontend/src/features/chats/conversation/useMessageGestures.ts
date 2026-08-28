import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import type { Message } from "../../../api/chats";
import {
  CHAT_EXIT_SWIPE_EDGE_THRESHOLD,
  CHAT_EXIT_SWIPE_TRIGGER_OFFSET,
  MESSAGE_LONG_PRESS_DURATION_MS,
  MESSAGE_LONG_PRESS_MOVE_TOLERANCE,
  SWIPE_REPLY_DIRECTION_LOCK,
  SWIPE_REPLY_MAX_OFFSET,
  SWIPE_REPLY_TRIGGER_OFFSET,
  SWIPE_REPLY_VERTICAL_TOLERANCE,
  messageContextMenuPosition,
  supportsSwipeReplyGesture
} from "../shared/messageGestures";
import type { ChatExitSwipeState, MessageLongPressState, SwipeReplyGestureState, SwipeReplyState } from "../shared/types";
import type { MessageContextMenuState } from "./MessageContextMenu";

type Params = {
  chatId: string | undefined;
  isMobileViewport: boolean;
  isMessageSelectionMode: boolean;
  channelCommentsDisabledForViewer: boolean;
  messageContextMenu: MessageContextMenuState | null;
  clearSelectedMessages: () => void;
  toggleSelectedMessage: (messageID: string) => void;
  setSelectedMessageIds: (messageIDs: string[]) => void;
  setMessageContextMenu: (menu: MessageContextMenuState | null) => void;
  onReplyToMessage: (message: Message) => void;
};

// Mobile interaction policy is isolated from message history and network
// actions so the conversation hook remains a small composition boundary.
export function useMessageGestures({
  chatId,
  isMobileViewport,
  isMessageSelectionMode,
  channelCommentsDisabledForViewer,
  messageContextMenu,
  clearSelectedMessages,
  toggleSelectedMessage,
  setSelectedMessageIds,
  setMessageContextMenu,
  onReplyToMessage
}: Params) {
  const [swipeReplyState, setSwipeReplyState] = useState<SwipeReplyState | null>(null);
  const swipeReplyGestureRef = useRef<SwipeReplyGestureState | null>(null);
  const messageLongPressRef = useRef<MessageLongPressState | null>(null);
  const chatExitSwipeRef = useRef<ChatExitSwipeState | null>(null);
  const suppressedMessageClickRef = useRef<{ messageId: string; expiresAt: number } | null>(null);

  const resetSwipeReplyState = useCallback(() => {
    swipeReplyGestureRef.current = null;
    setSwipeReplyState(null);
  }, []);
  const clearMessageLongPressGesture = useCallback(() => {
    if (messageLongPressRef.current) {
      window.clearTimeout(messageLongPressRef.current.timerId);
      messageLongPressRef.current = null;
    }
  }, []);
  const resetChatExitSwipeGesture = useCallback(() => {
    chatExitSwipeRef.current = null;
  }, []);
  const markNextMessageClickSuppressed = useCallback((messageId: string) => {
    suppressedMessageClickRef.current = { messageId, expiresAt: Date.now() + 900 };
  }, []);
  const consumeSuppressedMessageClick = useCallback((messageId: string) => {
    const current = suppressedMessageClickRef.current;
    if (!current) return false;
    if (current.expiresAt < Date.now()) {
      suppressedMessageClickRef.current = null;
      return false;
    }
    if (current.messageId !== messageId) return false;
    suppressedMessageClickRef.current = null;
    return true;
  }, []);
  const showMessageContextMenu = useCallback(
    (message: Message, x: number, y: number) => {
      resetSwipeReplyState();
      clearMessageLongPressGesture();
      clearSelectedMessages();
      setMessageContextMenu({
        message,
        ...messageContextMenuPosition(x, y, window.innerWidth, window.innerHeight, isMobileViewport)
      });
    },
    [clearMessageLongPressGesture, clearSelectedMessages, isMobileViewport, resetSwipeReplyState, setMessageContextMenu]
  );

  function shouldAllowSwipeReply(message: Message, event: ReactPointerEvent<HTMLElement>, missingCommentThread: boolean) {
    if (!supportsSwipeReplyGesture() || !event.isPrimary || event.button !== 0 || isMessageSelectionMode) return false;
    if (event.pointerType === "mouse" || messageContextMenu !== null || channelCommentsDisabledForViewer) return false;
    if (missingCommentThread || message.deliveryState === "sending") return false;
    return !((event.target as HTMLElement | null)?.closest("button, a, input, textarea, select, [role='button']"));
  }
  function shouldAllowMobileMessageGesture(event: ReactPointerEvent<HTMLElement>, message: Message) {
    if (!isMobileViewport || !event.isPrimary || event.button !== 0 || event.pointerType === "mouse") return false;
    if (message.deliveryState === "sending") return false;
    return !((event.target as HTMLElement | null)?.closest("button, a, input, textarea, select, [role='button']"));
  }
  function beginMessageLongPressGesture(event: ReactPointerEvent<HTMLElement>, message: Message) {
    clearMessageLongPressGesture();
    if (isMessageSelectionMode || !shouldAllowMobileMessageGesture(event, message)) return;
    const timerId = window.setTimeout(() => {
      markNextMessageClickSuppressed(message.id);
      resetSwipeReplyState();
      setMessageContextMenu(null);
      setSelectedMessageIds([message.id]);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(10);
      messageLongPressRef.current = null;
    }, MESSAGE_LONG_PRESS_DURATION_MS);
    messageLongPressRef.current = { messageId: message.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, timerId };
  }
  function handleMessageLongPressMove(event: ReactPointerEvent<HTMLElement>, message: Message) {
    const gesture = messageLongPressRef.current;
    if (!gesture || gesture.messageId !== message.id || gesture.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - gesture.startX) > MESSAGE_LONG_PRESS_MOVE_TOLERANCE || Math.abs(event.clientY - gesture.startY) > MESSAGE_LONG_PRESS_MOVE_TOLERANCE) clearMessageLongPressGesture();
  }
  function endMessageLongPressGesture(event: ReactPointerEvent<HTMLElement>, message: Message) {
    const gesture = messageLongPressRef.current;
    if (gesture?.messageId === message.id && gesture.pointerId === event.pointerId) clearMessageLongPressGesture();
  }
  function handleMessageBubbleClick(event: ReactMouseEvent<HTMLElement>, message: Message) {
    if (!isMobileViewport) return;
    if (consumeSuppressedMessageClick(message.id)) { event.preventDefault(); return; }
    if ((event.target as HTMLElement | null)?.closest("button, a, input, textarea, select, [role='button']")) return;
    if (isMessageSelectionMode) { event.preventDefault(); toggleSelectedMessage(message.id); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    showMessageContextMenu(message, rect.right - 20, rect.top + Math.min(rect.height * 0.5, 40));
  }
  function openMessageContextMenu(event: ReactMouseEvent<HTMLElement>, message: Message) {
    event.preventDefault();
    if (!isMobileViewport && !isMessageSelectionMode) showMessageContextMenu(message, event.clientX, event.clientY);
  }
  function shouldAllowChatExitSwipe(event: ReactPointerEvent<HTMLElement>) {
    if (!isMobileViewport || !chatId || !event.isPrimary || event.button !== 0 || event.pointerType === "mouse") return false;
    if (event.clientX > CHAT_EXIT_SWIPE_EDGE_THRESHOLD) return false;
    return !((event.target as HTMLElement | null)?.closest("button, a, input, textarea, select, [role='button'], .action-menu, .emoji-picker, .emoji-picker-dock"));
  }
  function beginChatExitSwipe(event: ReactPointerEvent<HTMLElement>) {
    if (shouldAllowChatExitSwipe(event)) chatExitSwipeRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, lock: "pending", committed: false };
  }
  function moveChatExitSwipe(event: ReactPointerEvent<HTMLElement>, requestCloseActiveChatSurface: () => void) {
    const gesture = chatExitSwipeRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.committed) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (gesture.lock === "pending") {
      if (Math.abs(deltaY) > 12 && Math.abs(deltaY) > Math.abs(deltaX)) { gesture.lock = "vertical"; return; }
      if (deltaX <= 10 || deltaX <= Math.abs(deltaY)) return;
      gesture.lock = "horizontal";
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    if (gesture.lock !== "horizontal" || deltaX < CHAT_EXIT_SWIPE_TRIGGER_OFFSET) return;
    gesture.committed = true;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    requestCloseActiveChatSurface();
    resetChatExitSwipeGesture();
  }
  function endChatExitSwipe(event: ReactPointerEvent<HTMLElement>) {
    const gesture = chatExitSwipeRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    resetChatExitSwipeGesture();
  }
  function beginSwipeReplyGesture(event: ReactPointerEvent<HTMLElement>, message: Message, missingCommentThread: boolean) {
    if (!shouldAllowSwipeReply(message, event, missingCommentThread)) { beginMessageLongPressGesture(event, message); return; }
    swipeReplyGestureRef.current = { messageId: message.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, lastOffset: 0, lock: "pending" };
    beginMessageLongPressGesture(event, message);
  }
  function updateSwipeReplyOffset(messageId: string, offset: number) {
    const clampedOffset = Math.min(Math.max(offset, 0), SWIPE_REPLY_MAX_OFFSET);
    setSwipeReplyState({ messageId, offset: clampedOffset, activated: clampedOffset >= SWIPE_REPLY_TRIGGER_OFFSET });
  }
  function handleSwipeReplyMove(event: ReactPointerEvent<HTMLElement>, message: Message) {
    const gesture = swipeReplyGestureRef.current;
    if (!gesture || gesture.messageId !== message.id || gesture.pointerId !== event.pointerId) { handleMessageLongPressMove(event, message); return; }
    handleMessageLongPressMove(event, message);
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (gesture.lock === "pending") {
      if (Math.abs(deltaY) > SWIPE_REPLY_VERTICAL_TOLERANCE && Math.abs(deltaY) > Math.abs(deltaX)) { resetSwipeReplyState(); clearMessageLongPressGesture(); return; }
      if (deltaX <= SWIPE_REPLY_DIRECTION_LOCK || deltaX <= Math.abs(deltaY)) return;
      gesture.lock = "horizontal";
      clearMessageLongPressGesture();
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    gesture.lastOffset = Math.min(Math.max(deltaX, 0), SWIPE_REPLY_MAX_OFFSET);
    event.preventDefault();
    updateSwipeReplyOffset(message.id, gesture.lastOffset);
  }
  function endSwipeReplyGesture(event: ReactPointerEvent<HTMLElement>, message: Message, options?: { commit?: boolean }) {
    endMessageLongPressGesture(event, message);
    const gesture = swipeReplyGestureRef.current;
    if (!gesture || gesture.messageId !== message.id || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const shouldCommit = options?.commit !== false && gesture.lock === "horizontal" && gesture.lastOffset >= SWIPE_REPLY_TRIGGER_OFFSET;
    resetSwipeReplyState();
    if (shouldCommit) { markNextMessageClickSuppressed(message.id); onReplyToMessage(message); }
  }

  return { swipeReplyState, resetSwipeReplyState, clearMessageLongPressGesture, consumeSuppressedMessageClick, showMessageContextMenu, handleMessageBubbleClick, openMessageContextMenu, beginSwipeReplyGesture, handleSwipeReplyMove, endSwipeReplyGesture, shouldAllowChatExitSwipe, beginChatExitSwipe, moveChatExitSwipe, endChatExitSwipe, resetChatExitSwipeGesture };
}
