import { useEffect, useRef, useState } from "react";

import { User } from "../../../api/auth";
import type { Chat } from "../../../api/chats";
import type { Family } from "../../../api/family";

export type UseChatWorkspaceStateParams = {
  accessToken: string | null;
};

/**
 * Owns the core chat-overview data (family/members/chats/selected chat) and
 * the loading flags derived from it. Declared before the message-thread,
 * composer, realtime, and call-session hooks so its setters can be handed to
 * them as `onChatsUpdate` / `onSelectedChatUpdate` callbacks. Data fetching
 * itself (loadOverview/loadSelectedChat) lives in `useChatDataLoader`, which
 * is constructed afterwards since it depends on the message-thread hook.
 */
export function useChatWorkspaceState({ accessToken }: UseChatWorkspaceStateParams) {
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  const chatsRef = useRef<Chat[]>([]);
  const accessTokenRef = useRef<string | null>(accessToken);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    function updateOnlineState() {
      setIsOnline(navigator.onLine);
    }

    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);

    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  return {
    family,
    setFamily,
    members,
    setMembers,
    chats,
    setChats,
    selectedChat,
    setSelectedChat,
    isLoading,
    setIsLoading,
    isChatLoading,
    setIsChatLoading,
    isOnline,
    chatsRef,
    accessTokenRef
  };
}

export type ChatWorkspaceState = ReturnType<typeof useChatWorkspaceState>;
