import { Archive, BellOff, Hash, LockKeyhole, Star, Volume2 } from "lucide-react";

import { useStrings } from "../../../i18n/LanguageContext";
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
  shouldShowChatRowMeta,
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
  isDragging?: boolean;
  onSelect: (chat: Chat) => void;
  onOpen: (chat: Chat) => void;
  onDragStart?: (event: React.DragEvent<HTMLElement>, chat: Chat) => void;
  onDragEnd?: (event: React.DragEvent<HTMLElement>, chat: Chat) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLElement>, chat: Chat) => void;
};

export function ChatListItem({
  chat,
  isActive,
  isTransitionSource,
  accessToken,
  currentUserId,
  minimizedChatLayout,
  isDragging,
  onSelect,
  onOpen,
  onDragStart,
  onDragEnd,
  onContextMenu
}: ChatListItemProps) {
  const strings = useStrings();
  const chatName = displayChatName(chat, currentUserId, strings);
  const preview = chatPreview(chat, strings);
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

  const canDrag = Boolean(onDragStart);

  return (
    <div
      role="button"
      tabIndex={0}
      className={`chat-list-item ${isActive ? "active" : ""} ${isDragging ? "is-dragging" : ""}`}
      draggable={canDrag}
      onDragStart={canDrag ? (event) => {
        event.dataTransfer.setData("application/stovo-chat-id", chat.id);
        event.dataTransfer.setData("text/plain", chat.id);
        event.dataTransfer.effectAllowed = "copyMove";
        onDragStart?.(event, chat);
      } : undefined}
      onDragEnd={canDrag ? (event) => {
        onDragEnd?.(event, chat);
      } : undefined}
      onClick={() => {
        onSelect(chat);
        onOpen(chat);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(chat);
          onOpen(chat);
        }
      }}
      onContextMenu={(event) => {
        onContextMenu?.(event, chat);
      }}
    >
      {chatListLeadingVisual !== "avatar" ? (
        <span
          className={`chat-list-type-marker${
            chatListLeadingVisual === "archive"
              ? " chat-list-type-marker--archive"
              : chatListLeadingVisual === "voice"
                ? " chat-list-type-marker--voice"
                : ""
          }`}
          aria-hidden="true"
        >
          {chatListLeadingVisual === "lock" ? (
            <LockKeyhole size={16} strokeWidth={2} />
          ) : chatListLeadingVisual === "hash" ? (
            <Hash size={16} strokeWidth={2} />
          ) : chatListLeadingVisual === "voice" ? (
            <Volume2 size={16} strokeWidth={2} />
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
            <span className="chat-list-preview">
              <span className="chat-list-draft-label">Draft:</span>{" "}
              {draftText.slice(0, 40)}{draftText.length > 40 ? "…" : ""}
            </span>
          ) : preview ? <span className="chat-list-preview">{preview}</span> : null;
        })()}
      </span>
      <span className="chat-row-meta">
        {(chat.type === "group" || chat.type === "family") && chat.activeCall && (
          <span
            className="group-call-pulse-dot"
            title="Group call in progress"
            aria-label="Group call in progress"
          />
        )}
        {chat.isMuted && <BellOff aria-label="Muted" size={14} />}
        {chat.isFavorite && <Star aria-label="Favorite" size={14} />}
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
    </div>
  );
}
