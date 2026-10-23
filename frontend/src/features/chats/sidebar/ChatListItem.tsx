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

type VoiceMember = Chat["members"][number] & {
  directMessagePermission?: "family" | "selected" | "nobody";
  invitePermissionUserIds?: string[];
};

type ChatListItemProps = {
  chat: Chat;
  isActive: boolean;
  isTransitionSource: boolean;
  accessToken: string | null;
  currentUserId?: string;
  activeVoiceCallChatId?: string | null;
  activeVoiceCallParticipantIds?: string[];
  onOpenMemberDm?: (userId: string) => void;
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
  activeVoiceCallChatId,
  activeVoiceCallParticipantIds = [],
  onOpenMemberDm,
  minimizedChatLayout,
  isDragging,
  onSelect,
  onOpen,
  onDragStart,
  onDragEnd,
  onContextMenu
}: ChatListItemProps) {
  const strings = useStrings();
  const copy = strings.chats.sidebar;
  const chatName = displayChatName(chat, currentUserId, strings);
  const preview = chatPreview(chat, strings);
  const voiceParticipantIds = chat.type === "voice"
    ? Array.from(new Set([
        ...((chat.activeCall?.participants as Array<{ userId?: string; state?: string }> | undefined) ?? [])
          .filter((participant) => participant.userId && ["connected", "connecting", "in-call"].includes(participant.state ?? ""))
          .map((participant) => participant.userId as string),
        ...(activeVoiceCallChatId === chat.id ? [...activeVoiceCallParticipantIds, ...(currentUserId ? [currentUserId] : [])] : []),
      ]))
    : [];
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
  const voiceParticipants = (chat.activeCall?.participants as Array<{ userId?: string; state?: string; joinedAt?: string }> | undefined) ?? [];

  const voiceDuration = (joinedAt?: string) => {
    if (!joinedAt) return copy.inVoiceChannel;
    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(joinedAt).getTime()) / 60_000));
    if (!Number.isFinite(elapsedMinutes)) return copy.inVoiceChannel;
    if (elapsedMinutes < 1) return copy.joinedJustNow;
    if (elapsedMinutes < 60) return copy.inVoiceFor(elapsedMinutes);
    const hours = Math.floor(elapsedMinutes / 60);
    const minutes = elapsedMinutes % 60;
    return copy.joinedHours(hours, minutes);
  };

  return (
    <div
      data-chat-id={chat.id}
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
          <time>{formatChatTime(chat.lastMessageCreatedAt || chat.updatedAt)}</time>
        </span>
        {(() => {
          const draftText = window.localStorage.getItem(`stovo:draft:${chat.id}`);
          return draftText ? (
            <span className="chat-list-preview">
              <span className="chat-list-draft-label">{copy.draft}</span>{" "}
              {draftText.slice(0, 40)}{draftText.length > 40 ? "…" : ""}
            </span>
          ) : chat.type === "voice" && voiceParticipantIds.length > 0 ? (
            <span className="chat-list-voice-participants" aria-label={copy.activeVoiceMembers(voiceParticipantIds.length)}>
              {voiceParticipantIds.slice(0, 4).map((userId) => {
                const member = chat.members.find((item) => item.id === userId);
                const memberPolicy = member as VoiceMember | undefined;
                const joinedAt = voiceParticipants.find((participant) => participant.userId === userId)?.joinedAt;
                const canMessage = Boolean(
                  member &&
                  userId !== currentUserId &&
                  memberPolicy?.directMessagePermission !== "nobody" &&
                  (memberPolicy?.directMessagePermission !== "selected" || memberPolicy.invitePermissionUserIds?.includes(currentUserId ?? ""))
                );
                return (
                  <span key={userId} className="chat-list-voice-member">
                    <button
                      type="button"
                      className="chat-list-voice-member-trigger"
                      aria-label={copy.memberLabel(member?.displayName ?? copy.member, canMessage)}
                      disabled={!canMessage || !onOpenMemberDm}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (canMessage) onOpenMemberDm?.(userId);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <RealAvatar
                        accessToken={accessToken}
                        className="avatar chat-list-voice-avatar"
                        file={member?.profilePhoto}
                        label={member?.displayName ?? copy.member}
                      />
                    </button>
                    <span className="chat-list-voice-member-tooltip" role="tooltip">
                      <strong>{member?.displayName ?? copy.member}</strong>
                      <small>{voiceDuration(joinedAt)}</small>
                      {!canMessage && userId !== currentUserId && <small>{copy.directMessagesRestricted}</small>}
                      {userId === currentUserId && <small>{copy.you}</small>}
                    </span>
                  </span>
                );
              })}
              {voiceParticipantIds.length > 4 && <span className="chat-list-voice-overflow">+{voiceParticipantIds.length - 4}</span>}
            </span>
          ) : preview ? <span className="chat-list-preview">{preview}</span> : null;
        })()}
      </span>
      <span className="chat-row-meta">
        {(chat.type === "group" || chat.type === "family") && chat.activeCall && (
          <span
            className="group-call-pulse-dot"
            title={copy.groupCallInProgress}
            aria-label={copy.groupCallInProgress}
          />
        )}
        {chat.isMuted && <BellOff aria-label={copy.muted} size={14} />}
        {chat.isFavorite && <Star aria-label={copy.favorite} size={14} />}
        {hasUnread && (
          <span
            className="tiny-badge"
            aria-label={copy.unreadMessages(chat.unreadCount)}
          >
            {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
          </span>
        )}
      </span>
    </div>
  );
}
