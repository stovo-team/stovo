import { useMemo, useState } from "react";
import {
  Archive,
  ChevronDown,
  Copy,
  Forward,
  MessageCircle,
  Pencil,
  Pin,
  Reply,
  Trash2
} from "lucide-react";

import type { Chat } from "../../../api/chats";
import type { User } from "../../../api/auth";
import {
  MESSAGE_REACTION_CHOICES,
  MESSAGE_REACTION_EXTENDED,
  isMultiMemberChat
} from "../shared/messagePresentation";
import { canPostToChannel } from "../shared/chatPresentation";
import type { Message } from "../shared/types";

export type MessageContextMenuState = {
  message: Message;
  x: number;
  y: number;
};

export type ContextMenuSeenByEntry = {
  userId: string;
  displayName: string;
  createdAt: string;
};

export function MessageContextMenu({
  menu,
  currentUser,
  selectedChat,
  channelCommentsDisabledForViewer,
  isInThreadMode = false,
  isPinned,
  seenBy,
  onReact,
  onReply,
  onComment,
  onCopy,
  onTogglePin,
  onForward,
  onArchive,
  onEdit,
  onDelete
}: {
  menu: MessageContextMenuState;
  currentUser: User | null;
  selectedChat: Chat | null;
  channelCommentsDisabledForViewer: boolean;
  isInThreadMode?: boolean;
  isPinned: boolean;
  seenBy: ContextMenuSeenByEntry[];
  resolvedThemeMode?: "light" | "dark";
  onReact: (emoji: string) => void;
  onReply: () => void;
  onComment?: () => void;
  onCopy: () => void;
  onTogglePin: () => void;
  onForward: () => void;
  onArchive: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [reactionsExpanded, setReactionsExpanded] = useState(false);
  const currentReaction = currentUser
    ? menu.message.reactions.find((reaction) => reaction.userIds.includes(currentUser.id)) ?? null
    : null;
  const canPostInChannel = Boolean(
    !selectedChat ||
      selectedChat.type !== "channel" ||
      canPostToChannel(selectedChat, currentUser)
  );

  const canManagePins =
    !selectedChat ||
    selectedChat.pinPermission !== "admins_only" ||
    (currentUser !== null && (currentUser.role === "owner" || currentUser.role === "admin"));

  const scrollableReactions = useMemo(() => {
    const seen = new Set(MESSAGE_REACTION_CHOICES);
    return MESSAGE_REACTION_EXTENDED.filter((emoji) => {
      if (seen.has(emoji)) return false;
      seen.add(emoji);
      return true;
    });
  }, []);

  const pending = menu.message.id.startsWith("pending:");

  return (
    <div
      className={`action-menu message-context-menu${reactionsExpanded ? " message-context-menu--reactions-expanded" : ""}`}
      role="menu"
      style={{ left: menu.x, top: menu.y }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div
        className={`message-context-reactions${reactionsExpanded ? " message-context-reactions--expanded" : ""}`}
        aria-label="React to message"
      >
        <div className="message-context-reactions-grid">
          {MESSAGE_REACTION_CHOICES.map((emoji) => (
            <button
              type="button"
              className={currentReaction?.emoji === emoji ? "active" : ""}
              aria-label={`React with ${emoji}`}
              title={`React with ${emoji}`}
              key={emoji}
              disabled={pending}
              onClick={() => onReact(emoji)}
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            className={`message-context-reactions-expand${reactionsExpanded ? " active" : ""}`}
            aria-label={reactionsExpanded ? "Hide more reactions" : "Show more reactions"}
            aria-expanded={reactionsExpanded}
            title={reactionsExpanded ? "Hide more reactions" : "More reactions"}
            disabled={pending}
            onClick={() => setReactionsExpanded((open) => !open)}
          >
            <ChevronDown aria-hidden="true" size={18} />
          </button>
          {reactionsExpanded &&
            scrollableReactions.map((emoji) => (
              <button
                type="button"
                className={currentReaction?.emoji === emoji ? "active" : ""}
                aria-label={`React with ${emoji}`}
                title={`React with ${emoji}`}
                key={emoji}
                disabled={pending}
                onClick={() => onReact(emoji)}
              >
                {emoji}
              </button>
            ))}
        </div>
      </div>
      {!isInThreadMode && onComment && (
        <button
          type="button"
          role="menuitem"
          disabled={channelCommentsDisabledForViewer || pending}
          onClick={onComment}
        >
          <MessageCircle aria-hidden="true" size={16} />
          Comment
        </button>
      )}
      {(canPostInChannel || isInThreadMode) && (
        <button
          type="button"
          role="menuitem"
          disabled={channelCommentsDisabledForViewer || pending}
          onClick={onReply}
        >
          <Reply aria-hidden="true" size={16} />
          Reply
        </button>
      )}
      <button type="button" role="menuitem" disabled={!menu.message.content} onClick={onCopy}>
        <Copy aria-hidden="true" size={16} />
        Copy
      </button>
      {selectedChat && canManagePins && (
        <button
          type="button"
          role="menuitem"
          disabled={pending}
          onClick={onTogglePin}
        >
          <Pin aria-hidden="true" size={16} />
          {isPinned ? "Unpin message" : "Pin message"}
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        disabled={pending}
        onClick={onForward}
      >
        <Forward aria-hidden="true" size={16} />
        Forward
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={pending}
        onClick={onArchive}
      >
        <Archive aria-hidden="true" size={16} />
        Save to Message Archive
      </button>
      {menu.message.senderId === currentUser?.id && Boolean(menu.message.content?.trim()) && (
        <button
          type="button"
          role="menuitem"
          disabled={pending}
          onClick={onEdit}
        >
          <Pencil aria-hidden="true" size={16} />
          Edit
        </button>
      )}
      {menu.message.senderId === currentUser?.id && (
        <button
          type="button"
          role="menuitem"
          disabled={pending}
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" size={16} />
          Delete
        </button>
      )}
      {isMultiMemberChat(selectedChat?.type ?? "direct") && (
        <div className="message-context-seen-by" aria-live="polite">
          <strong>Seen by</strong>
          {seenBy.length > 0 ? (
            <ul>
              {seenBy.map((status) => (
                <li key={status.userId}>
                  <span>{status.displayName}</span>
                  <time dateTime={status.createdAt}>
                    {new Date(status.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p>No readers yet</p>
          )}
        </div>
      )}
    </div>
  );
}
