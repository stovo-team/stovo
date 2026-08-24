import { Dispatch, RefObject, SetStateAction, useRef } from "react";
import type { Socket } from "socket.io-client";

type Options = {
  chatId: string | undefined;
  selectedChatId: string | undefined;
  setComposer: Dispatch<SetStateAction<string>>;
  socketRef: RefObject<Socket | null>;
};

export function useComposerDraftPersistence({ chatId, selectedChatId, setComposer, socketRef }: Options) {
  const typingStopTimerRef = useRef<number | null>(null);
  function handleComposerChange(value: string) {
    setComposer(value);
    if (chatId) {
      if (value) window.localStorage.setItem(`stovo:draft:${chatId}`, value);
      else window.localStorage.removeItem(`stovo:draft:${chatId}`);
    }
    if (!selectedChatId || !value.trim()) return;
    socketRef.current?.emit("typing:start", { chatId: selectedChatId });
    if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = window.setTimeout(() => {
      socketRef.current?.emit("typing:stop", { chatId: selectedChatId });
    }, 1400);
  }
  return { handleComposerChange };
}
