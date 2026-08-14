import { Dispatch, RefObject, SetStateAction, useCallback, useEffect, useRef } from "react";

import type { User } from "../../../api/auth";
import type { Chat, Message, MessageHistoryPage, PinnedMessage } from "../../../api/chats";
import { ApiError } from "../../../api/client";
import type { Family } from "../../../api/family";
import { decryptMessages } from "../../../api/messageCrypto";
import { loadCachedChatList, loadRecentChatHistory, loadRecentChatHistoryFromLocalStorage, saveCachedChatList, saveRecentChatHistory } from "../../../chatHistoryCache";
import { applyMessagePreviewToChat, sortPinsByPosition } from "../shared/chatPresentation";
import type { MessageStateUpdate } from "../shared/types";
import { getActiveServer, upsertServer } from "../../../api/serverRegistry";

export type UseChatDataLoaderParams = {
  accessTokenRef: RefObject<string | null>;
  authRequest: <T>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>;
  currentUser: User | null;
  chatId: string | undefined;
  onError: (message: string | null) => void;
  setFamily: Dispatch<SetStateAction<Family | null>>;
  setMembers: Dispatch<SetStateAction<User[]>>;
  setChats: Dispatch<SetStateAction<Chat[]>>;
  setSelectedChat: Dispatch<SetStateAction<Chat | null>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setHasLoadedOverview: Dispatch<SetStateAction<boolean>>;
  setIsChatLoading: Dispatch<SetStateAction<boolean>>;
  activeChatIdRef: RefObject<string | undefined>;
  chatsRef: RefObject<Chat[]>;
  messageCacheRef: RefObject<Record<string, Message[]>>;
  historyCursorRef: RefObject<Record<string, string | null>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setPinnedMessages: Dispatch<SetStateAction<PinnedMessage[]>>;
  setPinIndex: Dispatch<SetStateAction<number>>;
  applyMessagesForChat: (chatId: string, next: MessageStateUpdate) => void;
  markChatRead: (chatId: string, messageId: string) => Promise<void>;
  loadOlderMessages: (chatId?: string) => Promise<void>;
};

/**
 * Owns fetching + refreshing the chat overview (family/members/chats) and the
 * currently-selected chat's messages/pins, including local-history cache
 * warm-up and background resync (chat route changes, tab visibility/focus).
 *
 * Effects intentionally key only on route/auth identity. Callbacks are read
 * through refs so selectedChat / message-list identity churn cannot retrigger
 * overview or chat loads in a loop.
 */
export function useChatDataLoader({
  accessTokenRef,
  authRequest,
  currentUser,
  chatId,
  onError,
  setFamily,
  setMembers,
  setChats,
  setSelectedChat,
  setIsLoading,
  setHasLoadedOverview,
  setIsChatLoading,
  activeChatIdRef,
  chatsRef,
  messageCacheRef,
  historyCursorRef,
  setMessages,
  setPinnedMessages,
  setPinIndex,
  applyMessagesForChat,
  markChatRead,
  loadOlderMessages
}: UseChatDataLoaderParams) {
  const loadOverviewRequestRef = useRef(0);
  const loadChatRequestRef = useRef(0);
  const hasLoadedOverviewRef = useRef(false);

  const authRequestRef = useRef(authRequest);
  const onErrorRef = useRef(onError);
  const applyMessagesForChatRef = useRef(applyMessagesForChat);
  const markChatReadRef = useRef(markChatRead);
  const loadOlderMessagesRef = useRef(loadOlderMessages);
  const currentUserIdRef = useRef(currentUser?.id);

  useEffect(() => {
    authRequestRef.current = authRequest;
  }, [authRequest]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    applyMessagesForChatRef.current = applyMessagesForChat;
  }, [applyMessagesForChat]);
  useEffect(() => {
    markChatReadRef.current = markChatRead;
  }, [markChatRead]);
  useEffect(() => {
    loadOlderMessagesRef.current = loadOlderMessages;
  }, [loadOlderMessages]);
  useEffect(() => {
    currentUserIdRef.current = currentUser?.id;
  }, [currentUser?.id]);

  const loadOverview = useCallback(async () => {
    if (!accessTokenRef.current) {
      return;
    }

    const requestId = loadOverviewRequestRef.current + 1;
    loadOverviewRequestRef.current = requestId;
    const isCurrentRequest = () => loadOverviewRequestRef.current === requestId;

    if (!hasLoadedOverviewRef.current && chatsRef.current.length === 0) {
      setIsLoading(true);
    }
    try {
      const [familyResult, memberResult, chatResult] = await Promise.all([
        authRequestRef.current<Family>("/api/family"),
        authRequestRef.current<User[]>("/api/family/members"),
        authRequestRef.current<Chat[]>("/api/chats")
      ]);
      if (!isCurrentRequest()) {
        return;
      }
      if (familyResult?.name) {
        const active = getActiveServer();
        if (active && active.name !== familyResult.name) {
          upsertServer({ ...active, name: familyResult.name });
        }
      }
      setFamily(familyResult);
      setMembers(memberResult);
      setChats(chatResult);
      hasLoadedOverviewRef.current = true;
      setHasLoadedOverview(true);
      if (currentUserIdRef.current) {
        void saveCachedChatList(currentUserIdRef.current, chatResult);
      }

      const currentChatId = activeChatIdRef.current;
      if (currentChatId) {
        const fallbackChat = chatResult.find((chat) => chat.id === currentChatId) ?? null;
        if (fallbackChat) {
          setSelectedChat((current) =>
            // The server copy owns member data so connector aliases added from
            // the admin page immediately become available to the mention picker.
            current?.id === fallbackChat.id ? { ...current, ...fallbackChat } : fallbackChat
          );
        }
      }
    } catch (err) {
      if (isCurrentRequest()) {
        onErrorRef.current(err instanceof ApiError ? String(err.message) : "Could not load chats");
      }
    } finally {
      if (isCurrentRequest()) {
        setIsLoading(false);
      }
    }
  }, [accessTokenRef, activeChatIdRef, chatsRef, setChats, setFamily, setHasLoadedOverview, setIsLoading, setMembers, setSelectedChat]);

  const loadSelectedChat = useCallback(
    async (requestedChatId: string | undefined, preserveVisibleMessages = false) => {
      if (!accessTokenRef.current) {
        return;
      }

      const requestId = loadChatRequestRef.current + 1;
      loadChatRequestRef.current = requestId;
      const isCurrentRequest = () => loadChatRequestRef.current === requestId;

      if (!requestedChatId) {
        if (chatsRef.current.length === 0) {
          setSelectedChat(null);
        }
        setMessages([]);
        setPinnedMessages([]);
        setPinIndex(0);
        setIsChatLoading(false);
        return;
      }

      const fallbackChat = chatsRef.current.find((chat) => chat.id === requestedChatId) ?? null;
      if (fallbackChat) {
        setSelectedChat((current) =>
          current?.id === fallbackChat.id ? { ...current, ...fallbackChat } : fallbackChat
        );
      }

      let cachedMessages = messageCacheRef.current[requestedChatId];
      if (!cachedMessages && currentUserIdRef.current) {
        const localCached = loadRecentChatHistoryFromLocalStorage<Message>(
          currentUserIdRef.current,
          requestedChatId
        );
        if (localCached && localCached.length > 0) {
          cachedMessages = localCached;
          messageCacheRef.current[requestedChatId] = localCached;
        }
      }

      if (cachedMessages) {
        setMessages(cachedMessages);
      } else if (!preserveVisibleMessages) {
        setMessages([]);
      }
      setIsChatLoading(!cachedMessages);

      setPinIndex(0);

      let historyRequestResolved = false;
      const userId = currentUserIdRef.current;
      if (userId) {
        void loadRecentChatHistory<Message>(userId, requestedChatId).then(async (cached) => {
          if (!cached || historyRequestResolved || !isCurrentRequest()) return;
          const decrypted = await decryptMessages(requestedChatId, cached, userId);
          if (!historyRequestResolved && isCurrentRequest()) {
            applyMessagesForChatRef.current(requestedChatId, decrypted);
            setIsChatLoading(false);
          }
        }).catch(() => undefined);
      }

      try {
        const [chat, messageResult, pinsResult] = await Promise.all([
          authRequestRef.current<Chat>(`/api/chats/${requestedChatId}`),
          authRequestRef.current<MessageHistoryPage>(`/api/chats/${requestedChatId}/messages?limit=20`),
          authRequestRef.current<PinnedMessage[]>(`/api/chats/${requestedChatId}/pins`).catch(() => [] as PinnedMessage[])
        ]);
        historyRequestResolved = true;
        if (!isCurrentRequest()) {
          return;
        }
        const decryptedMessages = await decryptMessages(requestedChatId, messageResult.messages, currentUserIdRef.current);
        if (!isCurrentRequest()) {
          return;
        }
        setSelectedChat(chat);
        applyMessagesForChatRef.current(requestedChatId, decryptedMessages);
        historyCursorRef.current[requestedChatId] = messageResult.hasMore ? messageResult.nextBefore : null;
        if (currentUserIdRef.current) {
          void saveRecentChatHistory(currentUserIdRef.current, requestedChatId, messageResult.messages);
        }
        if (messageResult.hasMore) {
          window.setTimeout(() => void loadOlderMessagesRef.current(requestedChatId), 0);
        }
        const sortedPins = sortPinsByPosition(pinsResult);
        setPinnedMessages(sortedPins);
        setPinIndex(Math.max(0, sortedPins.length - 1));

        const latestMessage = decryptedMessages.at(-1);
        if (latestMessage) {
          setChats((current) =>
            current.map((item) =>
              item.id === requestedChatId ? applyMessagePreviewToChat(item, latestMessage) : item
            )
          );
          setSelectedChat((current) =>
            current?.id === requestedChatId
              ? { ...applyMessagePreviewToChat(current, latestMessage), unreadCount: 0 }
              : current
          );
          await markChatReadRef.current(requestedChatId, latestMessage.id);
        }
      } catch (err) {
        if (isCurrentRequest()) {
          onErrorRef.current(err instanceof ApiError ? String(err.message) : "Could not load messages");
        }
      } finally {
        if (isCurrentRequest()) {
          setIsChatLoading(false);
        }
      }
    },
    [
      accessTokenRef,
      chatsRef,
      historyCursorRef,
      messageCacheRef,
      setChats,
      setIsChatLoading,
      setMessages,
      setPinIndex,
      setPinnedMessages,
      setSelectedChat
    ]
  );

  const syncCurrentView = useCallback(async () => {
    await loadOverview();
    await loadSelectedChat(activeChatIdRef.current, true);
  }, [activeChatIdRef, loadOverview, loadSelectedChat]);

  const syncCurrentViewRef = useRef(syncCurrentView);
  useEffect(() => {
    syncCurrentViewRef.current = syncCurrentView;
  }, [syncCurrentView]);
  const reloadOverview = useCallback(() => {
    void syncCurrentViewRef.current();
  }, []);

  // Mount / auth-token arrival: load cached chats first, then overview once per access-token presence.
  useEffect(() => {
    if (!accessTokenRef.current) {
      return;
    }
    const userId = currentUser?.id;
    if (userId && chatsRef.current.length === 0) {
      void loadCachedChatList<Chat>(userId).then((cached) => {
        if (cached && cached.length > 0 && chatsRef.current.length === 0) {
          setChats(cached);
          setIsLoading(false);
        }
      }).catch(() => undefined);
    }
    void loadOverview();
  }, [accessTokenRef, currentUser?.id, loadOverview, setChats, setIsLoading]);

  // Route chat changes only — never re-fire because callback identity churned.
  useEffect(() => {
    void loadSelectedChat(chatId);
  }, [chatId, loadSelectedChat]);

  useEffect(() => {
    function syncWhenVisible() {
      if (document.visibilityState === "visible") {
        void syncCurrentViewRef.current();
      }
    }

    document.addEventListener("visibilitychange", syncWhenVisible);
    window.addEventListener("focus", syncWhenVisible);

    return () => {
      document.removeEventListener("visibilitychange", syncWhenVisible);
      window.removeEventListener("focus", syncWhenVisible);
    };
  }, []);

  return { loadOverview, loadSelectedChat, syncCurrentView, reloadOverview };
}

export type ChatDataLoader = ReturnType<typeof useChatDataLoader>;

