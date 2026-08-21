import { useEffect, useState } from "react";

/** Keeps a delayed-chat send countdown current without leaking timer details to the composer. */
export function useMessageCooldown(chatId: string | undefined, delaySeconds: number | undefined) {
  const [lastSentByChat, setLastSentByChat] = useState<Record<string, number>>({});
  const [, setTick] = useState(0);
  const lastSentAt = chatId ? (lastSentByChat[chatId] ?? 0) : 0;
  const remaining = delaySeconds && delaySeconds > 0 && lastSentAt > 0
    ? Math.max(0, Math.ceil((lastSentAt + delaySeconds * 1000 - Date.now()) / 1000))
    : 0;

  useEffect(() => {
    if (remaining <= 0) return;
    const interval = window.setInterval(() => setTick((tick) => tick + 1), 250);
    return () => window.clearInterval(interval);
  }, [remaining]);

  function markSent(targetChatId: string | undefined) {
    if (!targetChatId) return;
    setLastSentByChat((current) => ({ ...current, [targetChatId]: Date.now() }));
  }

  return { remaining, markSent };
}
