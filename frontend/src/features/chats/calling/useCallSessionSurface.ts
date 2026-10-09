import { useCallback } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";

import type { Message, Chat } from "../../../api/chats";
import {
  isNativeCallPluginAvailable,
  setNativeActiveCallState
} from "../../../native/callPlugin";
import { navigateWithMotion } from "../../../motion/navigation";
import { activeSessionVideoElement } from "../shared/callLifecycle";
import type { CallPhase } from "../shared/types";

type CallSessionSurfaceParams = {
  callPhaseRef: RefObject<CallPhase>;
  activeCallChatIdRef: RefObject<string | null>;
  activeCallSessionIdRef: RefObject<string | null>;
  activeChatIdRef: RefObject<string | undefined>;
  chatsRef: RefObject<Chat[]>;
  messageCacheRef: RefObject<Record<string, Message[]>>;
  navigate: NavigateFunction;
  prefersReducedMotion: boolean;
  setIsCallMinimized: Dispatch<SetStateAction<boolean>>;
  setIsDetailsOpen: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setSelectedChat: Dispatch<SetStateAction<Chat | null>>;
  setIsVideoPictureInPictureActive: Dispatch<SetStateAction<boolean>>;
  videoPictureInPictureActiveRef: RefObject<boolean>;
};

export function useCallSessionSurface({
  callPhaseRef,
  activeCallChatIdRef,
  activeCallSessionIdRef,
  activeChatIdRef,
  chatsRef,
  messageCacheRef,
  navigate,
  prefersReducedMotion,
  setIsCallMinimized,
  setIsDetailsOpen,
  setMessages,
  setSelectedChat,
  setIsVideoPictureInPictureActive,
  videoPictureInPictureActiveRef
}: CallSessionSurfaceParams) {
  const syncNativePictureInPictureCallState = useCallback(() => {
    const phase = callPhaseRef.current;
    if (phase !== "idle") {
      videoPictureInPictureActiveRef.current = false;
      setIsVideoPictureInPictureActive(false);
      try {
        activeSessionVideoElement()?.pause();
      } catch {
        // Detached media can reject a synchronous pause during route changes.
      }
    }
    if (!isNativeCallPluginAvailable()) return;

    const hasLiveSession = Boolean(activeCallSessionIdRef.current);
    const active = phase !== "idle" && hasLiveSession;
    // Android PiP keeps the active call WebView alive, including audio-only calls.
    const video = active;

    void setNativeActiveCallState({
      active,
      video,
      chatId: active ? activeCallChatIdRef.current : null,
      sessionId: active ? activeCallSessionIdRef.current : null
    });
  }, [
    activeCallChatIdRef,
    activeCallSessionIdRef,
    callPhaseRef,
    setIsVideoPictureInPictureActive,
    videoPictureInPictureActiveRef
  ]);

  const restoreActiveCallSurface = useCallback(() => {
    if (callPhaseRef.current === "idle") {
      return;
    }

    setIsCallMinimized(false);
    setIsDetailsOpen(false);

    const callChatId = activeCallChatIdRef.current;
    if (!callChatId || activeChatIdRef.current === callChatId) {
      return;
    }

    const callChat = chatsRef.current.find((candidate) => candidate.id === callChatId) ?? null;
    if (callChat) {
      setSelectedChat(callChat);
      const cachedMessages = messageCacheRef.current[callChat.id];
      if (cachedMessages) {
        setMessages(cachedMessages);
      }
    }

    navigateWithMotion(navigate, `/app/chats/${callChatId}`, {
      reducedMotion: prefersReducedMotion
    });
  }, [
    activeCallChatIdRef,
    activeChatIdRef,
    callPhaseRef,
    chatsRef,
    messageCacheRef,
    navigate,
    prefersReducedMotion,
    setIsCallMinimized,
    setIsDetailsOpen,
    setMessages,
    setSelectedChat
  ]);

  return { syncNativePictureInPictureCallState, restoreActiveCallSurface };
}
