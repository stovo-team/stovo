import { Dispatch, RefObject, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import type { NavigateFunction } from "react-router-dom";

import type { User } from "../../../api/auth";
import type { Chat, Message } from "../../../api/chats";
import { getMessages } from "../../../api/chats";
import { decryptMessages } from "../../../api/messageCrypto";
import { audioPlaybackSession, type AudioIdentity } from "../../../audioPlaybackSession";
import { validateAudioRestoreTarget } from "../../../audioRestore";
import { navigateWithMotion } from "../../../motion/navigation";
import type { PendingMessageFocus } from "../shared/types";

export type UseAudioMessageRestoreParams = {
  currentUser: User | null;
  accessTokenRef: RefObject<string | null>;
  chatsRef: RefObject<Chat[]>;
  messageCacheRef: RefObject<Record<string, Message[]>>;
  activeChatIdRef: RefObject<string | undefined>;
  messagesRef: RefObject<Message[]>;
  setSelectedChat: Dispatch<SetStateAction<Chat | null>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setIsDetailsOpen: Dispatch<SetStateAction<boolean>>;
  pendingMessageFocusRef: RefObject<PendingMessageFocus | null>;
  onError: (message: string | null) => void;
  navigate: NavigateFunction;
  prefersReducedMotion: boolean;
  locationSearch: string;
};

/**
 * Restores the in-conversation surface for a persisted/cross-tab audio
 * playback session (e.g. after following a `?restoreAudio=1` deep link),
 * navigating to the owning chat and focusing the source message.
 */
export function useAudioMessageRestore({
  currentUser,
  accessTokenRef,
  chatsRef,
  messageCacheRef,
  activeChatIdRef,
  messagesRef,
  setSelectedChat,
  setMessages,
  setIsDetailsOpen,
  pendingMessageFocusRef,
  onError,
  navigate,
  prefersReducedMotion,
  locationSearch
}: UseAudioMessageRestoreParams) {
  const [audioRestoreStatus, setAudioRestoreStatus] = useState<string | null>(null);
  const audioRestoreStatusTimerRef = useRef<number | null>(null);

  const restoreActiveAudioSurface = useCallback(
    async (requestedIdentity?: AudioIdentity) => {
      const snapshot = audioPlaybackSession.getSnapshot();
      const identity = requestedIdentity ?? snapshot.identity;
      const accessToken = accessTokenRef.current;
      setAudioRestoreStatus("Opening audio message…");

      try {
        if (!identity || !accessToken || !currentUser?.id) {
          throw new Error("Audio restore is unavailable");
        }

        const targetChat = chatsRef.current.find((candidate) => candidate.id === identity.chatId);
        if (!targetChat) throw new Error("Audio chat is unavailable");

        let targetMessages =
          messageCacheRef.current[targetChat.id] ??
          (activeChatIdRef.current === targetChat.id ? messagesRef.current : null);
        if (!targetMessages) {
          const loaded = await getMessages(accessToken, targetChat.id, undefined, 100);
          targetMessages = await decryptMessages(targetChat.id, loaded, currentUser.id);
          messageCacheRef.current[targetChat.id] = targetMessages;
        }

        const authorized = validateAudioRestoreTarget(identity, [targetChat], targetMessages);
        if (!authorized) throw new Error("Audio target is unavailable");
        const targetMessage = targetMessages.find((message) => message.id === authorized.messageId);
        const targetFile = targetMessage?.attachments.find((file) => file.id === authorized.fileId);
        if (!targetMessage || !targetFile) throw new Error("Audio file is unavailable");

        if (snapshot.status === "authorization-required") {
          await audioPlaybackSession.load(
            {
              identity: authorized,
              title: targetFile.originalName,
              mimeType: targetFile.mimeType,
            },
            Math.max(0, Number.isFinite(snapshot.position) ? snapshot.position : 0)
          );
        }

        setSelectedChat(targetChat);
        setMessages(targetMessages);
        setIsDetailsOpen(false);
        pendingMessageFocusRef.current = {
          messageId: targetMessage.id,
          highlightClassName: "message-audio-context-flash"
        };
        navigateWithMotion(navigate, `/app/chats/${encodeURIComponent(authorized.chatId)}`, {
          reducedMotion: prefersReducedMotion
        });
      } catch {
        await audioPlaybackSession.clear("authorization").catch(() => undefined);
        onError("This audio message is no longer available.");
      } finally {
        if (audioRestoreStatusTimerRef.current !== null) {
          window.clearTimeout(audioRestoreStatusTimerRef.current);
        }
        audioRestoreStatusTimerRef.current = window.setTimeout(() => {
          setAudioRestoreStatus(null);
          audioRestoreStatusTimerRef.current = null;
        }, 1200);
      }
    },
    [
      accessTokenRef,
      activeChatIdRef,
      chatsRef,
      currentUser?.id,
      messageCacheRef,
      messagesRef,
      navigate,
      onError,
      pendingMessageFocusRef,
      prefersReducedMotion,
      setIsDetailsOpen,
      setMessages,
      setSelectedChat
    ]
  );

  useEffect(() => {
    if (new URLSearchParams(locationSearch).get("restoreAudio") !== "1" || !currentUser?.id) {
      return;
    }
    let cancelled = false;
    void restoreActiveAudioSurface().finally(() => {
      if (!cancelled) {
        navigate("/app/chats", { replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, locationSearch, navigate, restoreActiveAudioSurface]);

  useEffect(() => {
    return () => {
      if (audioRestoreStatusTimerRef.current !== null) {
        window.clearTimeout(audioRestoreStatusTimerRef.current);
      }
    };
  }, []);

  return { audioRestoreStatus };
}
