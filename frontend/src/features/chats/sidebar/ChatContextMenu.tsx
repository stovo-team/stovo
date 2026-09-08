import { useEffect, useRef } from "react";
import {
  Bell,
  BellOff,
  CheckCheck,
  FolderMinus,
  FolderPlus,
  MessageCircle,
  Star
} from "lucide-react";

import type { Chat } from "../../../api/chats";
import type { ChatFolder } from "./chatFolders";

export type ChatContextMenuState = {
  chat: Chat;
  x: number;
  y: number;
};

export function ChatContextMenu({
  menu,
  folders,
  onClose,
  onOpenChat,
  onToggleMute,
  onToggleFavorite,
  onRemoveFromFolder,
  onMoveToFolder,
  onMarkAsRead
}: {
  menu: ChatContextMenuState;
  folders: ChatFolder[];
  onClose: () => void;
  onOpenChat: (chat: Chat) => void;
  onToggleMute: (chat: Chat) => void;
  onToggleFavorite: (chat: Chat) => void;
  onRemoveFromFolder?: (folder: ChatFolder, chat: Chat) => void;
  onMoveToFolder?: (folder: ChatFolder, chat: Chat) => void;
  onMarkAsRead?: (chat: Chat) => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { chat, x, y } = menu;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    function handleMouseDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handleMouseDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleMouseDown);
    };
  }, [onClose]);

  // Clamp menu inside viewport
  const menuWidth = 220;
  const menuHeight = 260;
  const left = Math.min(x, Math.max(12, window.innerWidth - menuWidth - 12));
  const top = Math.min(y, Math.max(12, window.innerHeight - menuHeight - 12));

  // Check which custom folder this chat currently belongs to
  const containingFolders = folders.filter((f) => f.rules.includedChatIds?.includes(chat.id));
  const otherFolders = folders.filter((f) => !f.rules.includedChatIds?.includes(chat.id));

  return (
    <div
      ref={menuRef}
      className="action-menu chat-context-menu"
      role="menu"
      aria-label="Chat options"
      style={{
        position: "fixed",
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 1000
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onOpenChat(chat);
          onClose();
        }}
      >
        <MessageCircle size={16} aria-hidden="true" />
        <span>Open chat</span>
      </button>

      {chat.unreadCount > 0 && onMarkAsRead && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onMarkAsRead(chat);
            onClose();
          }}
        >
          <CheckCheck size={16} aria-hidden="true" />
          <span>Mark as read</span>
        </button>
      )}

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onToggleMute(chat);
          onClose();
        }}
      >
        {chat.isMuted ? <Bell size={16} aria-hidden="true" /> : <BellOff size={16} aria-hidden="true" />}
        <span>{chat.isMuted ? "Unmute notifications" : "Mute notifications"}</span>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onToggleFavorite(chat);
          onClose();
        }}
      >
        <Star size={16} aria-hidden="true" fill={chat.isFavorite ? "currentColor" : "none"} />
        <span>{chat.isFavorite ? "Remove from favorites" : "Add to favorites"}</span>
      </button>

      {containingFolders.map((folder) => (
        <button
          key={folder.id}
          type="button"
          role="menuitem"
          onClick={() => {
            onRemoveFromFolder?.(folder, chat);
            onClose();
          }}
        >
          <FolderMinus size={16} aria-hidden="true" />
          <span>Remove from {folder.name}</span>
        </button>
      ))}

      {otherFolders.map((folder) => (
        <button
          key={folder.id}
          type="button"
          role="menuitem"
          onClick={() => {
            onMoveToFolder?.(folder, chat);
            onClose();
          }}
        >
          <FolderPlus size={16} aria-hidden="true" />
          <span>Add to {folder.name}</span>
        </button>
      ))}
    </div>
  );
}
