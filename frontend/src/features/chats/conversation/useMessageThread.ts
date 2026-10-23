import {
  Dispatch,
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
  addMessageReaction,
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
  removeMessageReaction,
  pinMessage,
  sendMessage,
  unpinMessage
} from "../../../api/chats";
import { prefetchFiles } from "../../../api/files";
import { copyToClipboard } from "../../../utils/clipboard";
import { ApiError } from "../../../api/client";
import { decryptMessage, decryptMessages, encryptMessageContent } from "../../../api/messageCrypto";
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
  mergeIncomingMessage,
  mergeMessageLists,
  markMessagesReadThrough,
  optimisticReactionUpdate,
  replaceMessage
} from "../shared/messageState";
import type {
  MessageStateUpdate,
  PendingMessageFocus,
  SharedContentTab,
} from "../shared/types";
import { usePersistPinnedMessages } from "../shared/pinnedMessageState";
import type { MessageContextMenuState } from "./MessageContextMenu";
import { useMessageGestures } from "./useMessageGestures";

export type UseMessageThreadParams = {
  chatId: string | undefined;
  archiveGroup?: string;
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
  archiveGroup,
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
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [pinIndex, setPinIndex] = useState<number>(0);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [deleteForMe, setDeleteForMe] = useState(true);
  const [deleteForEveryone, setDeleteForEveryone] = useState(true);
  const [messageContextMenu, setMessageContextMenu] = useState<MessageContextMenuState | null>(null);
  usePersistPinnedMessages(chatId, currentUser, selectedChat?.id, pinnedMessages);

  const draftBeforeEditRef = useRef<string>("");
  const editInFlightRef = useRef(false);

  const activeChatIdRef = useRef<string | undefined>(chatId);
  const messagesRef = useRef<Message[]>([]);
  const messageCacheRef = useRef<Record<string, Message[]>>({});
  const historyCursorRef = useRef<Record<string, string | null>>({});
  const historyLoadingRef = useRef<Record<string, boolean>>({});
  const archiveGroupRef = useRef(archiveGroup);

  useEffect(() => {
    archiveGroupRef.current = archiveGroup;
  }, [archiveGroup]);

  const messagesPanelRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const forceScrollToBottomRef = useRef(false);
  const bottomAnchorMessageIdRef = useRef<string | null>(null);
  const pinClickScrollingRef = useRef(false);
  const pinTrackingTimeoutRef = useRef<number | null>(null);
  const messageHighlightTimeoutRef = useRef<number | null>(null);
  const pendingMessageFocusRef = useRef<PendingMessageFocus | null>(null);

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

  const clearSelectedMessages = useCallback(() => {
    setSelectedMessageIds([]);
  }, []);
  const isMessageSelectionMode = selectedMessageIds.length > 0;

  const toggleSelectedMessage = useCallback((messageId: string) => {
    setSelectedMessageIds((current) =>
      current.includes(messageId) ? current.filter((candidate) => candidate !== messageId) : [...current, messageId]
    );
  }, []);

  const {
    swipeReplyState,
    resetSwipeReplyState,
    clearMessageLongPressGesture,
    consumeSuppressedMessageClick,
    showMessageContextMenu,
    handleMessageBubbleClick,
    openMessageContextMenu,
    beginSwipeReplyGesture,
    handleSwipeReplyMove,
    endSwipeReplyGesture,
    shouldAllowChatExitSwipe,
    beginChatExitSwipe,
    moveChatExitSwipe,
    endChatExitSwipe,
    resetChatExitSwipeGesture
  } = useMessageGestures({
    chatId,
    isMobileViewport,
    isMessageSelectionMode,
    channelCommentsDisabledForViewer,
    messageContextMenu,
    clearSelectedMessages,
    toggleSelectedMessage,
    setSelectedMessageIds,
    setMessageContextMenu,
    onReplyToMessage: handleReplyToMessage
  });

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
      const historyKey = `${chatIdToLoad}:${archiveGroup ?? "all"}`;
      if (!chatIdToLoad || !token || historyLoadingRef.current[historyKey]) return;
      const before = historyCursorRef.current[chatIdToLoad];
      if (!before) return;

      historyLoadingRef.current[historyKey] = true;
      const panel = messagesPanelRef.current;
      const previousHeight = panel?.scrollHeight ?? 0;
      const previousTop = panel?.scrollTop ?? 0;
      try {
        const page: MessageHistoryPage = await getMessageHistoryPage(token, chatIdToLoad, before, 50, undefined, archiveGroup);
        if (activeChatIdRef.current !== chatIdToLoad || archiveGroupRef.current !== archiveGroup) return;
        const decrypted = await decryptMessages(chatIdToLoad, page.messages, currentUser?.id);
        if (activeChatIdRef.current !== chatIdToLoad || archiveGroupRef.current !== archiveGroup) return;
        applyMessagesForChat(chatIdToLoad, (current) => mergeMessageLists(current, decrypted));
        historyCursorRef.current[chatIdToLoad] = page.hasMore ? page.nextBefore : null;
        if (token && decrypted.length > 0) {
          const attachments = decrypted.flatMap((message) => message.attachments ?? []);
          if (attachments.length > 0) {
            prefetchFiles(token, attachments);
          }
        }
        window.requestAnimationFrame(() => {
          if (panel) panel.scrollTop = panel.scrollHeight - previousHeight + previousTop;
        });
      } catch {
        // Loading older history is retried the next time the user scrolls here.
      } finally {
        historyLoadingRef.current[historyKey] = false;
      }
    },
    [accessToken, applyMessagesForChat, archiveGroup, currentUser?.id]
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
      const attachmentText = (Array.isArray(message.attachments) ? message.attachments : [])
        .map((file) => file.originalName)
        .join(" ");
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
    for (const message of messages) {
      if (message.messageKind !== "chat") continue;
      counts.set(message.id, Math.max(counts.get(message.id) ?? 0, message.commentCount ?? 0));
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
