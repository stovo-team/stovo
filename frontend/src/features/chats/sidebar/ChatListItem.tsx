import { Archive, BellOff, Hash, LockKeyhole, Pin, Star } from "lucide-react";

import { Chat } from "../../../api/chats";
import {
  chatAvatarFallbackKind,
  chatAvatarFile,
  chatAvatarTypeClass,
  chatPreview,
  chatTransitionName,
  compactChatListLeadingVisual,
  displayChatName,
  formatChatTime,
  transitionAnchorStyle
} from "../shared/chatPresentation";
import { RealAvatar } from "./RealAvatar";

type ChatListItemProps = {
  chat: Chat;
  isActive: boolean;
  isTransitionSource: boolean;
  accessToken: string | null;
  currentUserId?: string;
  minimizedChatLayout?: boolean;
  onSelect: (chat: Chat) => void;
  onOpen: (chat: Chat) => void;
};

export function ChatListItem({
  chat,
  isActive,
  isTransitionSource,
  accessToken,
  currentUserId,
  minimizedChatLayout,
  onSelect,
  onOpen
}: ChatListItemProps) {
  const chatName = displayChatName(chat, currentUserId);
  const hasUnread = chat.unreadCount > 0;
  const compactLeadingVisual = compactChatListLeadingVisual(chat.type);
  const chatListLeadingVisual = minimizedChatLayout || chat.type === "archive"
    ? compactLeadingVisual
    : "avatar";
  const avatarTransitionStyle = transitionAnchorStyle(
    isTransitionSource ? chatTransitionName(chat.id, "avatar") : undefined
  );
  const titleTransitionStyle = transitionAnchorStyle(
    isTransitionSource ? chatTransitionName(chat.id, "title") : undefined
  );

  return (
    <button
      type="button"
      className={`chat-list-item ${isActive ? "active" : ""}`}
      onMouseDown={() => onSelect(chat)}
      onPointerDown={() => onSelect(chat)}
      onClick={() => onOpen(chat)}
    >
      {chatListLeadingVisual !== "avatar" ? (
        <span
          className={`chat-list-type-marker${
            chatListLeadingVisual === "archive" ? " chat-list-type-marker--archive" : ""
          }`}
          aria-hidden="true"
        >
          {chatListLeadingVisual === "lock" ? (
            <LockKeyhole size={16} strokeWidth={2} />
          ) : chatListLeadingVisual === "hash" ? (
            <Hash size={16} strokeWidth={2} />
          ) : (
            <Archive size={16} strokeWidth={2} />
          )}
        </span>
      ) : (
        <RealAvatar
          accessToken={accessToken}
          className={`avatar chat-avatar ${chatAvatarTypeClass(chat)}${
            minimizedChatLayout && chatListLeadingVisual === "avatar"
              ? " chat-avatar--compact"
              : ""
          }`}
          fallbackKind={chatAvatarFallbackKind(chat)}
          file={chatAvatarFile(chat, currentUserId)}
          label={chatName}
          style={avatarTransitionStyle}
        />
      )}
      <span className="chat-list-copy">
        <span className="chat-list-topline">
          <strong style={titleTransitionStyle}>{chatName}</strong>
          <time>{formatChatTime(chat.updatedAt)}</time>
        </span>
        {(() => {
          const draftText = window.localStorage.getItem(`stovo:draft:${chat.id}`);
          return draftText ? (
            <span>
              <span className="chat-list-draft-label">Draft:</span>{" "}
              {draftText.slice(0, 40)}{draftText.length > 40 ? "…" : ""}
            </span>
          ) : (
            <span>{chatPreview(chat)}</span>
          );
        })()}
      </span>
      <span className="chat-row-meta">
        {chat.isMuted && <BellOff aria-label="Muted" size={14} />}
        {chat.isFavorite && <Star aria-label="Favorite" size={14} />}
        {(chat.isPinned || chat.type === "family") && (
          <Pin aria-label={chat.isPinned ? "Pinned" : "Family chat"} size={14} />
        )}
        {hasUnread && (
          <span
            className="tiny-badge"
            aria-label={`${chat.unreadCount} unread ${
              chat.unreadCount === 1 ? "message" : "messages"
            }`}
          >
            {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
          </span>
        )}
      </span>
    </button>
  );
}
