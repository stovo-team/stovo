import { useEffect } from "react";
import type { Chat } from "../../api/chats";

export function useArchiveSelectionSync(selectedChat: Chat | null, setArchiveOpen: (open: boolean) => void) {
  useEffect(() => {
    setArchiveOpen(selectedChat?.type === "archive");
  }, [selectedChat?.id, selectedChat?.type, setArchiveOpen]);
}
