import { Dispatch, RefObject, SetStateAction, useCallback, useRef, useState } from "react";
import type { NavigateFunction } from "react-router-dom";

import type { Chat, Message } from "../../../api/chats";
import { navigateWithMotion } from "../../../motion/navigation";
import type { PictureInPictureState } from "../../../native/callPlugin";
import { parseVideoPictureInPictureRestore } from "../../../videoPiPBridge";
import { activeSessionVideoElement } from "../shared/callLifecycle";
import type { PendingMessageFocus } from "../shared/types";

export type UseVideoPictureInPictureBridgeParams = {
  accessTokenRef: RefObject<string | null>;
  chatsRef: RefObject<Chat[]>;
  messageCacheRef: RefObject<Record<string, Message[]>>;
  activeChatIdRef: RefObject<string | undefined>;
  messagesRef: RefObject<Message[]>;
  setSelectedChat: Dispatch<SetStateAction<Chat | null>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setIsDetailsOpen: Dispatch<SetStateAction<boolean>>;
  setThreadRootMessageId: Dispatch<SetStateAction<string | null>>;
  pendingMessageFocusRef: RefObject<PendingMessageFocus | null>;
  navigate: NavigateFunction;
  prefersReducedMotion: boolean;
};

/**
 * Owns the "which native picture-in-picture window is currently active"
 * state and the logic that restores the in-conversation video player surface
 * when the OS PiP window (owned by a message video, not an active call) is
 * closed. `useCallSession` and the socket-owning hook both consume
 * `restoreActiveVideoSurface` / `lastNativeVideoRevisionRef` to arbitrate PiP
 * ownership between the call UI and message video playback.
 */
export function useVideoPictureInPictureBridge({
  accessTokenRef,
  chatsRef,
  messageCacheRef,
  activeChatIdRef,
  messagesRef,
  setSelectedChat,
  setMessages,
  setIsDetailsOpen,
  setThreadRootMessageId,
  pendingMessageFocusRef,
  navigate,
  prefersReducedMotion
}: UseVideoPictureInPictureBridgeParams) {
  const [isVideoPictureInPictureActive, setIsVideoPictureInPictureActive] = useState(false);
  const videoPictureInPictureActiveRef = useRef(false);
  const lastNativeVideoRevisionRef = useRef(0);

  const restoreActiveVideoSurface = useCallback(
    (state: PictureInPictureState) => {
      const target = parseVideoPictureInPictureRestore(state, lastNativeVideoRevisionRef.current);
      if (!target || !accessTokenRef.current) return;

      const targetChat = chatsRef.current.find((candidate) => candidate.id === target.identity.chatId);
      if (!targetChat) return;

      const cachedMessages =
        messageCacheRef.current[targetChat.id] ??
        (activeChatIdRef.current === targetChat.id ? messagesRef.current : null);
      if (!cachedMessages) return;
      const targetMessage = cachedMessages.find((message) => message.id === target.identity.messageId);
      const targetFile = targetMessage?.attachments.find(
        (file) => file.id === target.identity.fileId && file.mimeType.startsWith("video/")
      );
      if (!targetMessage || targetMessage.chatId !== targetChat.id || !targetFile) return;

      const activeVideo = activeSessionVideoElement();
      const activeRoot = activeVideo?.closest<HTMLElement>(".video-player");
      if (
        activeVideo &&
        activeRoot?.dataset.videoChatId === target.identity.chatId &&
        activeRoot.dataset.videoMessageId === target.identity.messageId &&
        activeRoot.dataset.videoFileId === target.identity.fileId
      ) {
        try {
          activeVideo.currentTime = target.currentTime;
        } catch {
          // The retained coordinator snapshot restores again after metadata is ready.
        }
      }

      setSelectedChat(targetChat);
      setMessages(cachedMessages);
      setIsDetailsOpen(false);
      if (targetMessage.messageKind === "thread" && targetMessage.threadRootMessageId) {
        setThreadRootMessageId(targetMessage.threadRootMessageId);
      } else {
        setThreadRootMessageId(null);
      }
      pendingMessageFocusRef.current = {
        messageId: targetMessage.id,
        highlightClassName: "message-context-flash"
      };
      navigateWithMotion(navigate, `/app/chats/${encodeURIComponent(target.identity.chatId)}`, {
        reducedMotion: prefersReducedMotion
      });
    },
    [
      accessTokenRef,
      activeChatIdRef,
      chatsRef,
      messageCacheRef,
      messagesRef,
      navigate,
      pendingMessageFocusRef,
      prefersReducedMotion,
      setIsDetailsOpen,
      setMessages,
      setSelectedChat,
      setThreadRootMessageId
    ]
  );

  return {
    isVideoPictureInPictureActive,
    setIsVideoPictureInPictureActive,
    videoPictureInPictureActiveRef,
    lastNativeVideoRevisionRef,
    restoreActiveVideoSurface
  };
}

export type VideoPictureInPictureBridge = ReturnType<typeof useVideoPictureInPictureBridge>;
