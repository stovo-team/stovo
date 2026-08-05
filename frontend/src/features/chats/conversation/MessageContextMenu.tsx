import { Forward, Pencil, Pin, Reply, Star, X } from "lucide-react";

import type { Chat } from "../../../api/chats";
import type { User } from "../../../api/auth";
import { MESSAGE_REACTION_CHOICES } from "../shared/messagePresentation";
import { isMultiMemberChat } from "../shared/messagePresentation";
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
  isPinned,
  seenBy,
  onReact,
  onReply,
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
  isPinned: boolean;
  seenBy: ContextMenuSeenByEntry[];
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onTogglePin: () => void;
  onForward: () => void;
  onArchive: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const currentReaction = currentUser
    ? menu.message.reactions.find((reaction) => reaction.userIds.includes(currentUser.id)) ?? null
    : null;
  const canManagePins =
    !selectedChat ||
    selectedChat.pinPermission !== "admins_only" ||
    (currentUser !== null && (currentUser.role === "owner" || currentUser.role === "admin"));

  return (
    <div
      className="action-menu message-context-menu"
      role="menu"
      style={{ left: menu.x, top: menu.y }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="message-context-reactions" aria-label="React to message">
        {MESSAGE_REACTION_CHOICES.map((emoji) => (
          <button
            type="button"
            className={currentReaction?.emoji === emoji ? "active" : ""}
            aria-label={`React with ${emoji}`}
            title={`React with ${emoji}`}
            key={emoji}
            disabled={menu.message.id.startsWith("pending:")}
            onClick={() => onReact(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
      <button type="button" role="menuitem" disabled={channelCommentsDisabledForViewer} onClick={onReply}>
        <Reply aria-hidden="true" size={16} />
        {selectedChat?.type === "channel" ? "Comment" : "Reply"}
      </button>
      <button type="button" role="menuitem" disabled={!menu.message.content} onClick={onCopy}>
        <span className="ms-icon ms-icon--20" aria-hidden={true}>
          content_copy
        </span>
        Copy
      </button>
      {selectedChat && canManagePins && (
        <button
          type="button"
          role="menuitem"
          disabled={menu.message.id.startsWith("pending:")}
          onClick={onTogglePin}
        >
          <Pin aria-hidden="true" size={16} />
          {isPinned ? "Unpin message" : "Pin message"}
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        disabled={menu.message.id.startsWith("pending:")}
        onClick={onForward}
      >
        <Forward aria-hidden="true" size={16} />
        Forward
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={menu.message.id.startsWith("pending:")}
        onClick={onArchive}
      >
        <Star aria-hidden="true" size={16} />
        Save to Message Archive
      </button>
      {menu.message.senderId === currentUser?.id && Boolean(menu.message.content?.trim()) && (
        <button
          type="button"
          role="menuitem"
          disabled={menu.message.id.startsWith("pending:")}
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
          disabled={menu.message.id.startsWith("pending:")}
          onClick={onDelete}
        >
          <X aria-hidden="true" size={16} />
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
