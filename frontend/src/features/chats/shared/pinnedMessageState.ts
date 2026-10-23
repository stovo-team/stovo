import { Dispatch, SetStateAction, useEffect, useRef } from "react";

import type { PinnedMessage } from "../../../api/chats";
import type { User } from "../../../api/auth";
import { loadPinnedMessagesFromLocalStorage, savePinnedMessagesToLocalStorage } from "../../../chatHistoryCache";
import { sortPinsByPosition } from "./chatPresentation";

export function resolvePinnedMessagesAfterRefresh<T>(current: T[], refreshed: T[] | null): T[] {
  return refreshed ?? current;
}

export function restoreCachedPinnedMessages(
  userId: string | undefined,
  chatId: string,
  setPinnedMessages: Dispatch<SetStateAction<PinnedMessage[]>>,
  setPinIndex: Dispatch<SetStateAction<number>>
): void {
  const cached = userId ? loadPinnedMessagesFromLocalStorage<PinnedMessage>(userId, chatId) : null;
  const sorted = sortPinsByPosition(cached ?? []);
  setPinnedMessages(sorted);
  setPinIndex(Math.max(0, sorted.length - 1));
}

export function applyPinnedMessagesRefresh(
  userId: string | undefined,
  chatId: string,
  refreshed: PinnedMessage[] | null,
  setPinnedMessages: Dispatch<SetStateAction<PinnedMessage[]>>,
  setPinIndex: Dispatch<SetStateAction<number>>
): void {
  if (refreshed !== null && userId) {
    savePinnedMessagesToLocalStorage(userId, chatId, sortPinsByPosition(refreshed));
  }
  setPinnedMessages((current) => sortPinsByPosition(resolvePinnedMessagesAfterRefresh(current, refreshed)));
  if (refreshed !== null) setPinIndex(Math.max(0, refreshed.length - 1));
}

export function usePersistPinnedMessages(
  chatId: string | undefined,
  currentUser: User | null,
  selectedChatId: string | undefined,
  pinnedMessages: PinnedMessage[]
): void {
  const pinnedCacheChatIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (pinnedCacheChatIdRef.current !== chatId) {
      pinnedCacheChatIdRef.current = chatId;
      return;
    }
    if (!currentUser?.id || !chatId || selectedChatId !== chatId) return;
    savePinnedMessagesToLocalStorage(currentUser.id, chatId, pinnedMessages);
  }, [chatId, currentUser?.id, pinnedMessages, selectedChatId]);
}
