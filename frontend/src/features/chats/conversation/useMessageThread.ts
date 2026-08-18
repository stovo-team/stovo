import {
  Dispatch,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { Socket } from "socket.io-client";

import type { User } from "../../../api/auth";
import {
  Chat,
  Message,
  MessageHistoryPage,
  PinnedMessage,
  archiveMessage,
  deleteMessage,
  editMessage,
  forwardMessage,
  getMessageHistoryPage,
  getMessages,
  pinMessage,
  sendMessage,
  unpinMessage
} from "../../../api/chats";
import { prefetchFiles } from "../../../api/files";
import { copyToClipboard } from "../../../utils/clipboard";
import { ApiError } from "../../../api/client";
import { decryptMessage, decryptMessages, encryptMessageContent } from "../../../api/messageCrypto";
import { addMessageReaction, removeMessageReaction } from "../../../api/chats";
import { useReducedMotion } from "../../../hooks/useReducedMotion";
import { messageMatchesSearch } from "../../../messageSearch";
import {
  applyMessagePreviewToChat,
  canPostToChannel,
  sortPinsByPosition
} from "../shared/chatPresentation";
import {
  countMessagesAfterAnchor,
  isMessageListNearBottom,
  isMultiMemberChat
} from "../shared/messagePresentation";
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
import {
  mergeIncomingMessage,
  mergeMessageLists,
  markMessagesReadThrough,
  optimisticReactionUpdate,
  replaceMessage
} from "../shared/messageState";
import type {
  ChatExitSwipeState,
  MessageLongPressState,
  MessageStateUpdate,
  PendingMessageFocus,
  SharedContentTab,
  SwipeReplyGestureState,
  SwipeReplyState
} from "../shared/types";
import type { MessageContextMenuState } from "./MessageContextMenu";

// messageContextMenuPositionArgs isn't exported by messagePresentation; remove unused import below.

export type UseMessageThreadParams = {
  chatId: string | undefined;
  accessToken: string | null;
  currentUser: User | null;
  selectedChat: Chat | null;
  isMobileViewport: boolean;
  socketRef: RefObject<Socket | null>;
  authRequest: <T>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>;
  channelCommentsDisabledForViewer: boolean;
  onChatsUpdate: Dispatch<SetStateAction<Chat[]>>;
  onSelectedChatUpdate: Dispatch<SetStateAction<Chat | null>>;
  onError: (message: string | null) => void;
  focusComposerInput: () => void;
};

export function useMessageThread({
  chatId,
  accessToken,
  currentUser,
  selectedChat,
  isMobileViewport,
  socketRef,
  authRequest,
  channelCommentsDisabledForViewer,
  onChatsUpdate,
  onSelectedChatUpdate,
  onError,
  focusComposerInput
}: UseMessageThreadParams) {
  const prefersReducedMotion = useReducedMotion();

  const [messages, setMessages] = useState<Message[]>([]);
  const [messageSearch, setMessageSearch] = useState("");
  const [isMessageSearchOpen, setIsMessageSearchOpen] = useState(false);
  const [wholeWordSearch, setWholeWordSearch] = useState(false);
  const [caseSensitiveSearch, setCaseSensitiveSearch] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [pendingNewBelowCount, setPendingNewBelowCount] = useState(0);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [threadRootMessageId, setThreadRootMessageId] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null);
  const [editTargetMessage, setEditTargetMessage] = useState<Message | null>(null);
  const [swipeReplyState, setSwipeReplyState] = useState<SwipeReplyState | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [pinIndex, setPinIndex] = useState<number>(0);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [deleteForMe, setDeleteForMe] = useState(true);
  const [deleteForEveryone, setDeleteForEveryone] = useState(true);
  const [messageContextMenu, setMessageContextMenu] = useState<MessageContextMenuState | null>(null);

  const draftBeforeEditRef = useRef<string>("");
  const editInFlightRef = useRef(false);

  const activeChatIdRef = useRef<string | undefined>(chatId);
  const messagesRef = useRef<Message[]>([]);
  const messageCacheRef = useRef<Record<string, Message[]>>({});
  const historyCursorRef = useRef<Record<string, string | null>>({});
  const historyLoadingRef = useRef<Record<string, boolean>>({});

  const messagesPanelRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const forceScrollToBottomRef = useRef(false);
  const bottomAnchorMessageIdRef = useRef<string | null>(null);
  const pinClickScrollingRef = useRef(false);
  const pinTrackingTimeoutRef = useRef<number | null>(null);
  const messageHighlightTimeoutRef = useRef<number | null>(null);
  const pendingMessageFocusRef = useRef<PendingMessageFocus | null>(null);

  const swipeReplyGestureRef = useRef<SwipeReplyGestureState | null>(null);
  const messageLongPressRef = useRef<MessageLongPressState | null>(null);
  const chatExitSwipeRef = useRef<ChatExitSwipeState | null>(null);
  const suppressedMessageClickRef = useRef<{ messageId: string; expiresAt: number } | null>(null);

  useEffect(() => {
    activeChatIdRef.current = chatId;
  }, [chatId]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const clearMessageMotionState = useCallback(() => {
    if (pinTrackingTimeoutRef.current !== null) {
      window.clearTimeout(pinTrackingTimeoutRef.current);
      pinTrackingTimeoutRef.current = null;
    }
    if (messageHighlightTimeoutRef.current !== null) {
      window.clearTimeout(messageHighlightTimeoutRef.current);
      messageHighlightTimeoutRef.current = null;
    }
    pinClickScrollingRef.current = false;
  }, []);
  useEffect(() => () => clearMessageMotionState(), [clearMessageMotionState]);

  const focusMessageInPanel = useCallback(
    ({ messageId, highlightClassName, lockPinTracking = false }: PendingMessageFocus) => {
      const panel = messagesPanelRef.current;
      const element = document.getElementById(messageId);
      if (!panel || !element) {
        return false;
      }

      clearMessageMotionState();
      if (lockPinTracking) {
        pinClickScrollingRef.current = true;
        pinTrackingTimeoutRef.current = window.setTimeout(() => {
          pinClickScrollingRef.current = false;
          pinTrackingTimeoutRef.current = null;
        }, prefersReducedMotion ? 80 : 820);
      }

      const panelRect = panel.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const topInset = Math.min(Math.max(panel.clientHeight * 0.24, 88), 144);
      const targetTop = Math.max(0, panel.scrollTop + elementRect.top - panelRect.top - topInset);

      panel.scrollTo({ top: targetTop, behavior: prefersReducedMotion ? "auto" : "smooth" });

      element.classList.remove("message-pin-flash", "message-context-flash");
      void element.offsetWidth;
      element.classList.add(highlightClassName);
      messageHighlightTimeoutRef.current = window.setTimeout(() => {
        element.classList.remove(highlightClassName);
        messageHighlightTimeoutRef.current = null;
      }, prefersReducedMotion ? 120 : 720);

      return true;
    },
    [clearMessageMotionState, prefersReducedMotion]
  );

  const resetSwipeReplyState = useCallback(() => {
    swipeReplyGestureRef.current = null;
    setSwipeReplyState(null);
  }, []);

  const clearSelectedMessages = useCallback(() => {
    setSelectedMessageIds([]);
  }, []);
  const isMessageSelectionMode = selectedMessageIds.length > 0;

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

  const toggleSelectedMessage = useCallback((messageId: string) => {
    setSelectedMessageIds((current) =>
      current.includes(messageId) ? current.filter((candidate) => candidate !== messageId) : [...current, messageId]
    );
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
    [clearMessageLongPressGesture, clearSelectedMessages, isMobileViewport, resetSwipeReplyState]
  );

  const applyMessagesForChat = useCallback((targetChatId: string, nextState: MessageStateUpdate) => {
    const currentMessages =
      messageCacheRef.current[targetChatId] ?? (activeChatIdRef.current === targetChatId ? messagesRef.current : []);
    const nextMessages =
      typeof nextState === "function" ? (nextState as (current: Message[]) => Message[])(currentMessages) : nextState;
    messageCacheRef.current[targetChatId] = nextMessages;
    if (activeChatIdRef.current === targetChatId) {
      setMessages(nextMessages);
    }
  }, []);

  const markChatRead = useCallback(
    async (targetChatId: string, messageId: string) => {
      socketRef.current?.emit("message:read", { chatId: targetChatId, messageId });
      await authRequest<Message>(`/api/messages/${messageId}/read`, { method: "PATCH" }).catch(() => undefined);
      onChatsUpdate((current) =>
        current.map((chat) => (chat.id === targetChatId ? { ...chat, unreadCount: 0 } : chat))
      );
      onSelectedChatUpdate((current) => (current?.id === targetChatId ? { ...current, unreadCount: 0 } : current));
      if (currentUser?.id) {
        applyMessagesForChat(targetChatId, (current) =>
          markMessagesReadThrough(current, { chatId: targetChatId, messageId, userId: currentUser.id })
        );
      }
    },
    [applyMessagesForChat, authRequest, currentUser?.id, onChatsUpdate, onSelectedChatUpdate, socketRef]
  );

  const loadOlderMessages = useCallback(
    async (targetChatId?: string) => {
      // Prefer explicit id; fall back to the route/active chat ref so this
      // callback stays stable across selectedChat object identity changes.
      const chatIdToLoad = targetChatId ?? activeChatIdRef.current;
      const token = accessToken;
      if (!chatIdToLoad || !token || historyLoadingRef.current[chatIdToLoad]) return;
      const before = historyCursorRef.current[chatIdToLoad];
      if (!before) return;

      historyLoadingRef.current[chatIdToLoad] = true;
      const panel = messagesPanelRef.current;
      const previousHeight = panel?.scrollHeight ?? 0;
      const previousTop = panel?.scrollTop ?? 0;
      try {
        const page: MessageHistoryPage = await getMessageHistoryPage(token, chatIdToLoad, before, 50);
        if (activeChatIdRef.current !== chatIdToLoad) return;
        const decrypted = await decryptMessages(chatIdToLoad, page.messages, currentUser?.id);
        if (activeChatIdRef.current !== chatIdToLoad) return;
        applyMessagesForChat(chatIdToLoad, (current) => mergeMessageLists(current, decrypted));
        historyCursorRef.current[chatIdToLoad] = page.hasMore ? page.nextBefore : null;
        if (token && decrypted.length > 0) {
          const fileIds: string[] = [];
          for (const m of decrypted) {
            if (m.attachments?.length) {
              for (const a of m.attachments) {
                if (a.id) fileIds.push(a.id);
              }
            }
          }
          if (fileIds.length > 0) {
            prefetchFiles(token, fileIds);
          }
        }
        window.requestAnimationFrame(() => {
          if (panel) panel.scrollTop = panel.scrollHeight - previousHeight + previousTop;
        });
      } catch {
        // Loading older history is retried the next time the user scrolls here.
      } finally {
        historyLoadingRef.current[chatIdToLoad] = false;
      }
    },
    [accessToken, applyMessagesForChat, currentUser?.id]
  );

  const handleHistoryScroll = useCallback(() => {
    const panel = messagesPanelRef.current;
    if (!panel) return;
    const nearBottom = isMessageListNearBottom(panel.scrollHeight, panel.scrollTop, panel.clientHeight);
    stickToBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom);
    if (nearBottom) {
      bottomAnchorMessageIdRef.current = messagesRef.current.at(-1)?.id ?? null;
      setPendingNewBelowCount(0);
    } else if (bottomAnchorMessageIdRef.current === null) {
      bottomAnchorMessageIdRef.current = messagesRef.current.at(-1)?.id ?? null;
    } else {
      setPendingNewBelowCount(countMessagesAfterAnchor(messagesRef.current, bottomAnchorMessageIdRef.current));
    }
    if (panel.scrollTop < 160) void loadOlderMessages();
  }, [loadOlderMessages]);

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const panel = messagesPanelRef.current;
    if (!panel) return;
    stickToBottomRef.current = true;
    forceScrollToBottomRef.current = false;
    setShowScrollToBottom(false);
    setPendingNewBelowCount(0);
    bottomAnchorMessageIdRef.current = messagesRef.current.at(-1)?.id ?? null;
    if (behavior === "smooth") {
      panel.scrollTo({ top: panel.scrollHeight, behavior: "smooth" });
    } else {
      panel.scrollTop = panel.scrollHeight;
    }
  }, []);

  const prevChatIdRef = useRef<string | undefined>(undefined);
  const prevThreadRootMessageIdRef = useRef<string | null>(null);
  const prevReplyTargetIdRef = useRef<string | null>(null);
  const lastMessageId = messages.at(-1)?.id;
  useLayoutEffect(() => {
    if (!selectedChat || messageSearch.trim()) {
      return;
    }
    const panel = messagesPanelRef.current;
    const chatChanged = prevChatIdRef.current !== selectedChat.id;
    const threadChanged = prevThreadRootMessageIdRef.current !== threadRootMessageId;
    const replyTargetChanged = prevReplyTargetIdRef.current !== (replyTarget?.id ?? null);

    if (chatChanged || threadChanged || replyTargetChanged) {
      prevChatIdRef.current = selectedChat.id;
      prevThreadRootMessageIdRef.current = threadRootMessageId;
      prevReplyTargetIdRef.current = replyTarget?.id ?? null;
      stickToBottomRef.current = true;
      forceScrollToBottomRef.current = true;
      bottomAnchorMessageIdRef.current = null;
      setShowScrollToBottom(false);
      setPendingNewBelowCount(0);
    }
    if (!panel || messages.length === 0) {
      return;
    }

    const shouldStick = forceScrollToBottomRef.current || stickToBottomRef.current;
    if (shouldStick) {
      panel.scrollTop = panel.scrollHeight;
      bottomAnchorMessageIdRef.current = lastMessageId ?? null;
      setShowScrollToBottom(false);
      setPendingNewBelowCount(0);
      if (isMessageListNearBottom(panel.scrollHeight, panel.scrollTop, panel.clientHeight)) {
        forceScrollToBottomRef.current = false;
        stickToBottomRef.current = true;
      }
      return;
    }

    const pendingCount = countMessagesAfterAnchor(messagesRef.current, bottomAnchorMessageIdRef.current);
    setPendingNewBelowCount(pendingCount);
    setShowScrollToBottom(true);
  }, [selectedChat?.id, threadRootMessageId, replyTarget?.id, messages.length, lastMessageId, messageSearch]);

  useEffect(() => {
    const panel = messagesPanelRef.current;
    if (!panel || !selectedChat || messages.length === 0) {
      return;
    }
    const keepPinnedToBottom = () => {
      if (!forceScrollToBottomRef.current && !stickToBottomRef.current) {
        return;
      }
      panel.scrollTop = panel.scrollHeight;
      bottomAnchorMessageIdRef.current = messagesRef.current.at(-1)?.id ?? null;
      setShowScrollToBottom(false);
      setPendingNewBelowCount(0);
      if (isMessageListNearBottom(panel.scrollHeight, panel.scrollTop, panel.clientHeight)) {
        forceScrollToBottomRef.current = false;
        stickToBottomRef.current = true;
      }
    };
    let innerFrame = 0;
    const outerFrame = window.requestAnimationFrame(() => {
      keepPinnedToBottom();
      innerFrame = window.requestAnimationFrame(keepPinnedToBottom);
    });
    const resizeObserver = new ResizeObserver(() => {
      keepPinnedToBottom();
    });
    resizeObserver.observe(panel);
    const messageList = panel.querySelector(".message-list");
    if (messageList) {
      resizeObserver.observe(messageList);
    }
    const handleViewportResize = () => {
      keepPinnedToBottom();
    };
    if (typeof window !== "undefined" && window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportResize);
    }
    return () => {
      window.cancelAnimationFrame(outerFrame);
      window.cancelAnimationFrame(innerFrame);
      resizeObserver.disconnect();
      if (typeof window !== "undefined" && window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleViewportResize);
      }
    };
  }, [selectedChat?.id, threadRootMessageId, replyTarget?.id, messages.length, lastMessageId]);

  useEffect(() => {
    if (!selectedChat || threadRootMessageId || messageSearch.trim()) return;
    const panel = messagesPanelRef.current;
    if (!panel) return;
    if (panel.scrollHeight <= panel.clientHeight && historyCursorRef.current[selectedChat.id]) {
      void loadOlderMessages(selectedChat.id);
    }
  }, [selectedChat, threadRootMessageId, messageSearch, messages.length, loadOlderMessages]);

  const searchedMessages = useMemo(() => {
    const query = messageSearch.trim();
    if (!query) {
      return messages;
    }
    return messages.filter((message) => {
      const attachmentText = message.attachments.map((file) => file.originalName).join(" ");
      return messageMatchesSearch(
        `${message.content ?? ""} ${message.senderDisplayName ?? ""} ${attachmentText}`,
        query,
        { wholeWord: wholeWordSearch, caseSensitive: caseSensitiveSearch }
      );
    });
  }, [caseSensitiveSearch, messageSearch, messages, wholeWordSearch]);

  const visibleMessages = useMemo(() => {
    if (!threadRootMessageId) {
      return searchedMessages.filter((message) => message.messageKind !== "thread");
    }
    return searchedMessages.filter(
      (message) => message.id === threadRootMessageId || message.threadRootMessageId === threadRootMessageId
    );
  }, [searchedMessages, threadRootMessageId]);

  useEffect(() => {
    const pendingFocus = pendingMessageFocusRef.current;
    if (!pendingFocus) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      if (focusMessageInPanel(pendingFocus)) {
        pendingMessageFocusRef.current = null;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusMessageInPanel, visibleMessages, messages.length, threadRootMessageId]);

  useEffect(() => {
    const panel = messagesPanelRef.current;
    if (!panel || pinnedMessages.length <= 1) return;
    let rafId: number | undefined;
    function handlePinScroll() {
      if (pinClickScrollingRef.current) return;
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const panelRect = panel!.getBoundingClientRect();
        let newIndex = pinnedMessages.length - 1;
        for (let i = pinnedMessages.length - 1; i >= 0; i--) {
          const el = document.getElementById(pinnedMessages[i].messageId);
          if (!el) continue;
          if (el.getBoundingClientRect().bottom >= panelRect.top) {
            newIndex = i;
            break;
          }
        }
        setPinIndex(newIndex);
      });
    }
    panel.addEventListener("scroll", handlePinScroll, { passive: true });
    return () => {
      panel.removeEventListener("scroll", handlePinScroll);
      if (rafId !== undefined) cancelAnimationFrame(rafId);
    };
  }, [pinnedMessages]);

  const threadReplyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const message of messages) {
      if (message.messageKind !== "thread" || !message.threadRootMessageId) continue;
      counts.set(message.threadRootMessageId, (counts.get(message.threadRootMessageId) ?? 0) + 1);
    }
    return counts;
  }, [messages]);

  const threadRootMessage = useMemo(
    () => messages.find((message) => message.id === threadRootMessageId) ?? null,
    [messages, threadRootMessageId]
  );

  function openMessageSearch() {
    clearSelectedMessages();
    setIsMessageSearchOpen(true);
  }
  function closeMessageSearch() {
    setMessageSearch("");
    setWholeWordSearch(false);
    setCaseSensitiveSearch(false);
    setIsMessageSearchOpen(false);
  }
  function toggleMessageSearch() {
    if (isMessageSearchOpen) {
      closeMessageSearch();
      return;
    }
    openMessageSearch();
  }

  function openPinnedMessages() {
    const currentPin = pinnedMessages[pinIndex] ?? pinnedMessages[0];
    if (currentPin) {
      focusMessageInPanel({
        messageId: currentPin.messageId,
        highlightClassName: "message-pin-flash",
        lockPinTracking: true
      });
      setPinIndex((current) => (current - 1 + pinnedMessages.length) % pinnedMessages.length);
    }
  }

  function handleReplyToMessage(message: Message) {
    if (channelCommentsDisabledForViewer) {
      onError("Comments are disabled for this channel");
      setMessageContextMenu(null);
      return;
    }
    const canPostInChannel = Boolean(
      !selectedChat ||
        selectedChat.type !== "channel" ||
        canPostToChannel(selectedChat, currentUser)
    );
    if (selectedChat?.type === "channel" && !canPostInChannel) {
      setThreadRootMessageId(message.id);
    }
    resetSwipeReplyState();
    setReplyTarget(message);
    setMessageContextMenu(null);
    stickToBottomRef.current = true;
    forceScrollToBottomRef.current = true;
    scrollMessagesToBottom();
    requestAnimationFrame(() => focusComposerInput());
  }

  function shouldAllowSwipeReply(message: Message, event: ReactPointerEvent<HTMLElement>, missingCommentThread: boolean) {
    if (!supportsSwipeReplyGesture() || !event.isPrimary || event.button !== 0) return false;
    if (isMessageSelectionMode) return false;
    if (event.pointerType === "mouse" || messageContextMenu !== null) return false;
    if (channelCommentsDisabledForViewer || missingCommentThread) return false;
    if (message.deliveryState === "sending") return false;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select, [role='button']")) return false;
    return true;
  }

  function shouldAllowMobileMessageGesture(event: ReactPointerEvent<HTMLElement>, message: Message) {
    if (!isMobileViewport || !event.isPrimary || event.button !== 0) return false;
    if (event.pointerType === "mouse" || message.deliveryState === "sending") return false;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select, [role='button']")) return false;
    return true;
  }

  function beginMessageLongPressGesture(event: ReactPointerEvent<HTMLElement>, message: Message) {
    clearMessageLongPressGesture();
    if (isMessageSelectionMode || !shouldAllowMobileMessageGesture(event, message)) {
      return;
    }
    const timerId = window.setTimeout(() => {
      markNextMessageClickSuppressed(message.id);
      resetSwipeReplyState();
      setMessageContextMenu(null);
      setSelectedMessageIds([message.id]);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(10);
      }
      messageLongPressRef.current = null;
    }, MESSAGE_LONG_PRESS_DURATION_MS);
    messageLongPressRef.current = {
      messageId: message.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timerId
    };
  }

  function handleMessageLongPressMove(event: ReactPointerEvent<HTMLElement>, message: Message) {
    const gesture = messageLongPressRef.current;
    if (!gesture || gesture.messageId !== message.id || gesture.pointerId !== event.pointerId) return;
    if (
      Math.abs(event.clientX - gesture.startX) > MESSAGE_LONG_PRESS_MOVE_TOLERANCE ||
      Math.abs(event.clientY - gesture.startY) > MESSAGE_LONG_PRESS_MOVE_TOLERANCE
    ) {
      clearMessageLongPressGesture();
    }
  }

  function endMessageLongPressGesture(event: ReactPointerEvent<HTMLElement>, message: Message) {
    const gesture = messageLongPressRef.current;
    if (!gesture || gesture.messageId !== message.id || gesture.pointerId !== event.pointerId) return;
    clearMessageLongPressGesture();
  }

  function handleMessageBubbleClick(event: ReactMouseEvent<HTMLElement>, message: Message) {
    if (!isMobileViewport) return;
    if (consumeSuppressedMessageClick(message.id)) {
      event.preventDefault();
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select, [role='button']")) return;
    if (isMessageSelectionMode) {
      event.preventDefault();
      toggleSelectedMessage(message.id);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    showMessageContextMenu(message, rect.right - 20, rect.top + Math.min(rect.height * 0.5, 40));
  }

  function openMessageContextMenu(event: ReactMouseEvent<HTMLElement>, message: Message) {
    event.preventDefault();
    if (isMobileViewport || isMessageSelectionMode) return;
    showMessageContextMenu(message, event.clientX, event.clientY);
  }

  function shouldAllowChatExitSwipe(event: ReactPointerEvent<HTMLElement>) {
    if (!isMobileViewport || !chatId || !event.isPrimary || event.button !== 0) return false;
    if (event.pointerType === "mouse") return false;
    if (event.clientX > CHAT_EXIT_SWIPE_EDGE_THRESHOLD) return false;
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        "button, a, input, textarea, select, [role='button'], .action-menu, .emoji-picker, .emoji-picker-dock"
      )
    ) {
      return false;
    }
    return true;
  }

  function beginChatExitSwipe(event: ReactPointerEvent<HTMLElement>) {
    if (!shouldAllowChatExitSwipe(event)) return;
    chatExitSwipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lock: "pending",
      committed: false
    };
  }

  function moveChatExitSwipe(event: ReactPointerEvent<HTMLElement>, requestCloseActiveChatSurface: () => void) {
    const gesture = chatExitSwipeRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.committed) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;

    if (gesture.lock === "pending") {
      if (Math.abs(deltaY) > 12 && Math.abs(deltaY) > Math.abs(deltaX)) {
        gesture.lock = "vertical";
        return;
      }
      if (deltaX <= 10 || deltaX <= Math.abs(deltaY)) {
        return;
      }
      gesture.lock = "horizontal";
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    if (gesture.lock !== "horizontal") return;

    if (deltaX >= CHAT_EXIT_SWIPE_TRIGGER_OFFSET) {
      gesture.committed = true;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      requestCloseActiveChatSurface();
      resetChatExitSwipeGesture();
    }
  }

  function endChatExitSwipe(event: ReactPointerEvent<HTMLElement>) {
    const gesture = chatExitSwipeRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetChatExitSwipeGesture();
  }

  function beginSwipeReplyGesture(event: ReactPointerEvent<HTMLElement>, message: Message, missingCommentThread: boolean) {
    if (!shouldAllowSwipeReply(message, event, missingCommentThread)) {
      beginMessageLongPressGesture(event, message);
      return;
    }
    swipeReplyGestureRef.current = {
      messageId: message.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastOffset: 0,
      lock: "pending"
    };
    // Do not create the swipe transform until a horizontal drag is confirmed.
    // A long press starts text selection, and a translate3d(0, 0, 0) on the
    // selected bubble makes Android WebView paint black tiles by its handles.
    beginMessageLongPressGesture(event, message);
  }

  function updateSwipeReplyOffset(messageId: string, offset: number) {
    const clampedOffset = Math.min(Math.max(offset, 0), SWIPE_REPLY_MAX_OFFSET);
    setSwipeReplyState({ messageId, offset: clampedOffset, activated: clampedOffset >= SWIPE_REPLY_TRIGGER_OFFSET });
  }

  function handleSwipeReplyMove(event: ReactPointerEvent<HTMLElement>, message: Message) {
    const gesture = swipeReplyGestureRef.current;
    if (!gesture || gesture.messageId !== message.id || gesture.pointerId !== event.pointerId) {
      handleMessageLongPressMove(event, message);
      return;
    }

    handleMessageLongPressMove(event, message);

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;

    if (gesture.lock === "pending") {
      if (Math.abs(deltaY) > SWIPE_REPLY_VERTICAL_TOLERANCE && Math.abs(deltaY) > Math.abs(deltaX)) {
        resetSwipeReplyState();
        clearMessageLongPressGesture();
        return;
      }
      if (deltaX <= SWIPE_REPLY_DIRECTION_LOCK || deltaX <= Math.abs(deltaY)) {
        return;
      }
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

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const shouldCommit =
      options?.commit !== false && gesture.lock === "horizontal" && gesture.lastOffset >= SWIPE_REPLY_TRIGGER_OFFSET;
    resetSwipeReplyState();

    if (shouldCommit) {
      markNextMessageClickSuppressed(message.id);
      handleReplyToMessage(message);
    }
  }

  async function handleConfirmDelete() {
    if (!accessToken || !deleteTarget) return;
    const scope = deleteForEveryone ? "everyone" : "me";
    const targets =
      selectedMessageIds.length > 0 && selectedMessageIds.includes(deleteTarget.id)
        ? messages.filter(
            (message) =>
              selectedMessageIds.includes(message.id) && message.senderId === currentUser?.id
          )
        : [deleteTarget];
    if (targets.length === 0) return;

    try {
      for (const target of targets) {
        await deleteMessage(accessToken, target.id, scope);
        applyMessagesForChat(target.chatId, (current) => current.filter((m) => m.id !== target.id));
        onChatsUpdate((current) =>
          current.map((chat) => {
            if (chat.id !== target.chatId || chat.lastMessageId !== target.id) return chat;
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
      }
      setDeleteTarget(null);
      clearSelectedMessages();
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not delete message");
    }
  }

  async function handleForwardMessage(targetChatId: string, chats: Chat[], messagesToForward?: Message[]) {
    if (!accessToken) return;
    const targets = messagesToForward?.length
      ? messagesToForward
      : forwardTarget
        ? [forwardTarget]
        : [];
    if (targets.length === 0) return;

    try {
      for (const message of targets) {
        const targetChat = chats.find((chat) => chat.id === targetChatId);
        const shouldForwardLocally =
          targetChat &&
          message.encryptionProtocol === "end_to_end" &&
          Boolean(message.content?.trim()) &&
          message.attachments.length === 0;
        const forwarded = shouldForwardLocally
          ? await (async () => {
              const encrypted = await encryptMessageContent(targetChat, message.content, currentUser?.id);
              const created = await sendMessage(
                accessToken,
                targetChatId,
                encrypted.content,
                [],
                null,
                null,
                encrypted.encryption
              );
              return decryptMessage(targetChatId, created, currentUser?.id);
            })()
          : await forwardMessage(accessToken, message.id, targetChatId);
        if (targetChatId === selectedChat?.id) {
          applyMessagesForChat(targetChatId, (current) => mergeIncomingMessage(current, forwarded));
        }
        onChatsUpdate((current) =>
          current.map((chat) => (chat.id === targetChatId ? applyMessagePreviewToChat(chat, forwarded) : chat))
        );
      }
      setForwardTarget(null);
      clearSelectedMessages();
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not forward message");
    }
  }

  async function handleOpenThread(rootMessage: Message) {
    setThreadRootMessageId(rootMessage.id);
    setReplyTarget(null);
    stickToBottomRef.current = true;
    forceScrollToBottomRef.current = true;
    scrollMessagesToBottom();
    if (!accessToken || !selectedChat) return;
    try {
      const threadMessages = await getMessages(accessToken, selectedChat.id, undefined, 100, rootMessage.id);
      const decrypted = await decryptMessages(selectedChat.id, threadMessages, currentUser?.id);
      applyMessagesForChat(selectedChat.id, (current) => mergeMessageLists(current, decrypted));
      stickToBottomRef.current = true;
      forceScrollToBottomRef.current = true;
      scrollMessagesToBottom();
    } catch {
      // Best-effort: keep local view if thread fetch fails.
    }
  }

  async function handlePinMessage(message: Message) {
    if (!accessToken || !selectedChat) return;
    try {
      const pin = await pinMessage(accessToken, selectedChat.id, message.id);
      setPinnedMessages((current) => {
        const withoutDup = current.filter((p) => p.messageId !== pin.messageId);
        const sorted = sortPinsByPosition([...withoutDup, pin]);
        setPinIndex(sorted.length - 1);
        return sorted;
      });
      setMessageContextMenu(null);
    } catch {
      // No-op — pin failures surface no local error affordance, matching prior behavior.
    }
  }

  async function handleUnpinMessage(message: Message) {
    if (!accessToken || !selectedChat) return;
    try {
      await unpinMessage(accessToken, selectedChat.id, message.id);
      setPinnedMessages((current) => {
        const updated = current.filter((p) => p.messageId !== message.id);
        setPinIndex((idx) => (idx >= updated.length ? Math.max(0, updated.length - 1) : idx));
        return updated;
      });
      setMessageContextMenu(null);
    } catch {
      // No-op — unpin failures surface no local error affordance, matching prior behavior.
    }
  }

  async function handleArchiveMessage(message: Message) {
    if (!accessToken) return;
    try {
      await archiveMessage(accessToken, message.id);
      setMessageContextMenu(null);
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not save message");
    }
  }

  async function handleArchiveSelectedMessages() {
    if (!accessToken || selectedMessageIds.length === 0) return;
    const targets = messages.filter((message) => selectedMessageIds.includes(message.id));
    try {
      for (const message of targets) {
        await archiveMessage(accessToken, message.id);
      }
      clearSelectedMessages();
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not save message");
    }
  }

  function handleCopySelectedMessages() {
    const contents = messages
      .filter((message) => selectedMessageIds.includes(message.id))
      .map((message) => message.content?.trim() ?? "")
      .filter(Boolean);
    if (contents.length === 0) {
      onError("Nothing to copy");
      return;
    }
    copyToClipboard(contents.join("\n\n"));
    clearSelectedMessages();
  }

  async function handleSaveEditMessage(message: Message, newContent: string) {
    if (!accessToken || !currentUser || !newContent.trim()) return;
    try {
      const updated = await editMessage(accessToken, message.id, newContent.trim());
      const displayMessage = await decryptMessage(message.chatId, updated, currentUser.id);
      applyMessagesForChat(message.chatId, (current) => replaceMessage(current, displayMessage));
      setEditTargetMessage(null);
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not edit message");
    }
  }

  async function handleMessageReaction(message: Message, emoji: string) {
    if (!accessToken || !currentUser || message.id.startsWith("pending:")) return;

    const currentReaction = message.reactions.find((reaction) => reaction.userIds.includes(currentUser.id));
    const shouldRemove = currentReaction?.emoji === emoji;
    onError(null);
    applyMessagesForChat(message.chatId, (current) =>
      current.map((item) =>
        item.id === message.id ? optimisticReactionUpdate(item, currentUser.id, emoji, !shouldRemove) : item
      )
    );

    try {
      const updated = shouldRemove
        ? await removeMessageReaction(accessToken, message.id, emoji)
        : await addMessageReaction(accessToken, message.id, emoji);
      applyMessagesForChat(message.chatId, (current) => replaceMessage(current, updated));
    } catch (err) {
      applyMessagesForChat(message.chatId, (current) => replaceMessage(current, message));
      onError(err instanceof ApiError ? String(err.message) : "Could not update reaction");
    }
  }

  const contextMenuCurrentReaction =
    messageContextMenu && currentUser
      ? messageContextMenu.message.reactions.find((reaction) => reaction.userIds.includes(currentUser.id)) ?? null
      : null;

  function computeContextMenuSeenBy(memberLookup: Map<string, { displayName: string; username?: string }>) {
    if (!messageContextMenu || !selectedChat || !isMultiMemberChat(selectedChat.type)) {
      return [];
    }
    const statusByUser = new Map<string, { createdAt: string }>();
    for (const status of messageContextMenu.message.statuses) {
      if (status.status !== "read") continue;
      const existing = statusByUser.get(status.userId);
      if (!existing || existing.createdAt < status.createdAt) {
        statusByUser.set(status.userId, { createdAt: status.createdAt });
      }
    }
    return Array.from(statusByUser.entries())
      .map(([userId, value]) => ({
        userId,
        displayName: memberLookup.get(userId)?.displayName ?? "Family member",
        createdAt: value.createdAt
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  function resetForChatChange() {
    setMessageSearch("");
    setIsMessageSearchOpen(false);
    setMessageContextMenu(null);
    setSelectedMessageIds([]);
    setReplyTarget(null);
    setThreadRootMessageId(null);
    setForwardTarget(null);
    setEditTargetMessage(null);
    draftBeforeEditRef.current = "";
    setDeleteTarget(null);
  }

  return {
    messages,
    setMessages,
    messagesRef,
    messageCacheRef,
    historyCursorRef,
    activeChatIdRef,
    visibleMessages,
    threadReplyCounts,
    threadRootMessage,
    threadRootMessageId,
    setThreadRootMessageId,
    messageSearch,
    setMessageSearch,
    isMessageSearchOpen,
    wholeWordSearch,
    setWholeWordSearch,
    caseSensitiveSearch,
    setCaseSensitiveSearch,
    openMessageSearch,
    toggleMessageSearch,
    closeMessageSearch,
    showScrollToBottom,
    pendingNewBelowCount,
    selectedMessageIds,
    isMessageSelectionMode,
    clearSelectedMessages,
    toggleSelectedMessage,
    replyTarget,
    setReplyTarget,
    forwardTarget,
    setForwardTarget,
    editTargetMessage,
    setEditTargetMessage,
    draftBeforeEditRef,
    editInFlightRef,
    swipeReplyState,
    pinnedMessages,
    setPinnedMessages,
    pinIndex,
    setPinIndex,
    deleteTarget,
    setDeleteTarget,
    deleteForMe,
    setDeleteForMe,
    deleteForEveryone,
    setDeleteForEveryone,
    messageContextMenu,
    setMessageContextMenu,
    contextMenuCurrentReaction,
    computeContextMenuSeenBy,
    messagesPanelRef,
    stickToBottomRef,
    forceScrollToBottomRef,
    bottomAnchorMessageIdRef,
    pendingMessageFocusRef,
    focusMessageInPanel,
    clearMessageMotionState,
    applyMessagesForChat,
    markChatRead,
    loadOlderMessages,
    handleHistoryScroll,
    scrollMessagesToBottom,
    openPinnedMessages,
    handleReplyToMessage,
    handleConfirmDelete,
    handleForwardMessage,
    handlePinMessage,
    handleUnpinMessage,
    handleArchiveMessage,
    handleArchiveSelectedMessages,
    handleCopySelectedMessages,
    handleSaveEditMessage,
    handleMessageReaction,
    handleOpenThread,
    handleMessageBubbleClick,
    openMessageContextMenu,
    showMessageContextMenu,
    resetSwipeReplyState,
    beginSwipeReplyGesture,
    handleSwipeReplyMove,
    endSwipeReplyGesture,
    shouldAllowChatExitSwipe,
    beginChatExitSwipe,
    moveChatExitSwipe,
    endChatExitSwipe,
    resetChatExitSwipeGesture,
    clearMessageLongPressGesture,
    consumeSuppressedMessageClick,
    resetForChatChange
  };
}

export type ThreadApi = ReturnType<typeof useMessageThread>;
