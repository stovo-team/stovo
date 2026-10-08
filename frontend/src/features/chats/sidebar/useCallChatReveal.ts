import { useEffect, useLayoutEffect, useRef, useState } from "react";

const eventName = "stovo:reveal-call-chat";
export function requestCallChatReveal(chatId: string) {
  window.dispatchEvent(new CustomEvent(eventName, { detail: chatId }));
}

export function useCallChatReveal(openSections: () => void) {
  const open = useRef(openSections);
  open.current = openSections;
  const [request, setRequest] = useState<{ id: string } | null>(null);
  useEffect(() => {
    const reveal = (event: Event) => {
      const id = (event as CustomEvent<unknown>).detail;
      if (typeof id !== "string") return;
      open.current();
      setRequest({ id });
    };
    window.addEventListener(eventName, reveal);
    return () => window.removeEventListener(eventName, reveal);
  }, []);
  useLayoutEffect(() => {
    if (!request) return;
    const frame = requestAnimationFrame(() => {
      const row = Array.from(document.querySelectorAll<HTMLElement>('.chat-list-item[data-chat-id]')).find((element) => element.dataset.chatId === request.id);
      row?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [request]);
}
