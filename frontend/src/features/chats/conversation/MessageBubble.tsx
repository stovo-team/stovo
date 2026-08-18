import { CSSProperties, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent, useState, useEffect } from "react";
import { CalendarClock, Check, Clock3, Phone, Video } from "lucide-react";

import { callHistoryLabel, callHistoryTimestamp } from "../../../callHistory";
import type { Chat } from "../../../api/chats";
import type { FamilyFile } from "../../../api/files";
import { videoPlaybackSession } from "../../../videoPlaybackSession";
import { MessageMarkdown } from "../../../messageMarkdown";
import MessageMediaAlbum, { partitionMessageAttachments } from "../../../components/MessageMediaAlbum";
import { RealAvatar } from "../sidebar/RealAvatar";
import { chatInitials } from "../shared/chatPresentation";
import type { CallPhase } from "../shared/types";
import {
  emojiSizeClass,
  isGroupedMessage,
  isImageAttachment,
  messageActionSummary,
  messageDeliveryLabel,
  messageHasOnlyMediaAttachments,
  messageOriginChatId,
  messageReceiptState,
  shouldShowMessageSender
} from "../shared/messagePresentation";
import { SWIPE_REPLY_TRIGGER_OFFSET } from "../shared/messageGestures";
import { uniqueUserIds } from "../shared/messageState";
import type { Message, SwipeReplyState } from "../shared/types";
import { AttachmentCard, MessageImageAttachment } from "./MessageAttachmentThumbs";

export function MessageBubble({
  message,
  previousMessage,
  currentUserId,
  selectedChat,
  chats,
  messages,
  memberLookup,
  accessToken,
  videoAutoplay,
  renderMarkdown,
  callActive,
  isMessageSelectionMode,
  isSelected,
  swipeReplyState,
  threadReplyCount,
  isEditing = false,
  onSaveEdit,
  onCancelEdit,
  onBubbleClick,
  onContextMenu,
  onSwipePointerDown,
  onSwipePointerMove,
  onSwipePointerUp,
  onSwipePointerCancel,
  onOpenImage,
  onFocusRepliedMessage,
  onOpenOriginChat,
  onReact,
  onOpenThread
}: {
  message: Message;
  previousMessage: Message | undefined;
  currentUserId: string | undefined;
  selectedChat: Chat;
  chats: Chat[];
  messages: Message[];
  memberLookup: Map<string, { displayName: string; username?: string }>;
  accessToken: string | null;
  videoAutoplay: boolean;
  renderMarkdown: boolean;
  callActive: boolean;
  isMessageSelectionMode: boolean;
  isSelected: boolean;
  swipeReplyState: SwipeReplyState | null;
  threadReplyCount: number;
  isEditing?: boolean;
  onSaveEdit?: (message: Message, newContent: string) => Promise<void>;
  onCancelEdit?: () => void;
  onBubbleClick: (event: ReactMouseEvent<HTMLElement>, message: Message) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>, message: Message) => void;
  onSwipePointerDown: (event: ReactPointerEvent<HTMLElement>, message: Message) => void;
  onSwipePointerMove: (event: ReactPointerEvent<HTMLElement>, message: Message) => void;
  onSwipePointerUp: (event: ReactPointerEvent<HTMLElement>, message: Message) => void;
  onSwipePointerCancel: (event: ReactPointerEvent<HTMLElement>, message: Message) => void;
  onOpenImage: (file: FamilyFile, previewUrl: string, messageId?: string) => void;
  onFocusRepliedMessage: (messageId: string) => void;
  onOpenOriginChat: (chat: Chat) => void;
  onReact: (message: Message, emoji: string) => void;
  onOpenThread: (message: Message) => void;
}) {
  const mine = message.senderId === currentUserId;
  const [inlineContent, setInlineContent] = useState(message.content ?? "");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    if (isEditing) {
      setInlineContent(message.content ?? "");
      setIsSavingEdit(false);
    }
  }, [isEditing, message.content]);

  const handleInlineSave = async () => {
    if (!onSaveEdit || !inlineContent.trim() || isSavingEdit) return;
    try {
      setIsSavingEdit(true);
      await onSaveEdit(message, inlineContent.trim());
    } finally {
      setIsSavingEdit(false);
    }
  };

  if (message.type === "call" && message.call) {
    const isVideoCall = message.call.callType === "video";
    const CallIcon = isVideoCall ? Video : Phone;
    return (
      <article className="call-history-message" id={message.id} key={message.id}>
        <CallIcon aria-hidden="true" size={18} />
        <span>
          <strong>{callHistoryLabel(message.call)}</strong>
          <small>{isVideoCall ? "Video call" : "Audio call"}</small>
        </span>
        <time>{callHistoryTimestamp(message.createdAt)}</time>
      </article>
    );
  }

  const grouped = isGroupedMessage(message, previousMessage, currentUserId);
  const repliedMessage = message.replyToMessageId
    ? messages.find((candidate) => candidate.id === message.replyToMessageId)
    : null;
  const senderProfile = selectedChat.members.find((member) => member.id === message.senderId);
  const showSenderIdentity = shouldShowMessageSender(selectedChat.type, mine);
  const mediaOnlyMessage = messageHasOnlyMediaAttachments(message);
  const hasCaption = Boolean(message.content?.trim());
  const swipeStateForMessage = swipeReplyState?.messageId === message.id ? swipeReplyState : null;
  const swipeProgress = swipeStateForMessage
    ? Math.min(swipeStateForMessage.offset / SWIPE_REPLY_TRIGGER_OFFSET, 1)
    : 0;
  const swipeStyle = swipeStateForMessage
    ? ({
        "--message-swipe-offset": `${swipeStateForMessage.offset}px`,
        "--message-swipe-progress": String(swipeProgress)
      } as CSSProperties)
    : undefined;
  const originChatId = messageOriginChatId(chats, message.forwardedFrom?.chatId, repliedMessage?.senderId);
  const originChat = originChatId ? chats.find((chat) => chat.id === originChatId) ?? null : null;
  const receiptState = messageReceiptState(message, mine);
  const messageMeta = (
    <span className="message-meta">
      {messageDeliveryLabel(message, mine)}
      {mine && message.deliveryState === "sending" ? (
        <Clock3
          aria-label="message queued for delivery"
          className="message-receipt message-receipt--sending"
          role="img"
          size={14}
        />
      ) : mine && message.deliveryState === "scheduled" ? (
        <CalendarClock
          aria-label="message scheduled"
          className="message-receipt message-receipt--scheduled"
          role="img"
          size={14}
        />
      ) : receiptState ? (
        <svg
          aria-label={`${receiptState} message`}
          className={`message-receipt message-receipt--${receiptState}`}
          role="img"
          viewBox="0 0 24 24"
        >
          {receiptState === "sent" ? (
            <path d="m2 12 4 4 9-10" />
          ) : (
            <>
              <path d="m2 12 4 4 9-10" />
              <path d="m9 12 4 4 9-10" />
            </>
          )}
        </svg>
      ) : null}
    </span>
  );

  return (
    <article
      className={`message-bubble ${selectedChat.type === "direct" ? "direct" : ""} ${mine ? "mine" : ""} ${grouped ? "grouped" : ""} ${message.deliveryState ?? ""} ${mediaOnlyMessage ? "has-photo-attachments" : ""} ${emojiSizeClass(message.content)}${swipeStateForMessage ? " is-swipe-active" : ""}${swipeStateForMessage?.activated ? " is-swipe-armed" : ""}${isMessageSelectionMode ? " is-selection-mode" : ""}${isSelected ? " is-selected" : ""}`}
      id={message.id}
      aria-pressed={isMessageSelectionMode ? isSelected : undefined}
      onClick={(event) => onBubbleClick(event, message)}
      onContextMenu={(event) => onContextMenu(event, message)}
      onPointerCancel={(event) => onSwipePointerCancel(event, message)}
      onPointerDown={(event) => onSwipePointerDown(event, message)}
      onPointerMove={(event) => onSwipePointerMove(event, message)}
      onPointerUp={(event) => onSwipePointerUp(event, message)}
      style={swipeStyle}
    >
      {isSelected && (
        <span className="message-selection-indicator" aria-hidden="true">
          <Check size={14} />
        </span>
      )}
      {swipeStateForMessage && <span className="message-swipe-affordance" aria-hidden="true" />}
      {showSenderIdentity && (
        <div className="message-sender-row">
          <RealAvatar
            accessToken={accessToken}
            className="avatar message-sender-avatar"
            file={senderProfile?.profilePhoto ?? null}
            label={message.senderDisplayName ?? senderProfile?.displayName ?? "Family member"}
          />
          <strong className="message-sender">
            {message.senderDisplayName ?? senderProfile?.displayName ?? "Family member"}
          </strong>
        </div>
      )}
      {(repliedMessage || message.forwardedFrom) && (
        <div
          className={
            repliedMessage ? "message-origin-card" : "message-origin-card message-origin-card--forwarded"
          }
        >
          <span className="message-origin-label">
            {repliedMessage ? "Reply to " : "Forwarded from "}
            {originChat ? (
              <button
                type="button"
                className="message-origin-name"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenOriginChat(originChat);
                }}
              >
                {repliedMessage?.senderDisplayName ?? message.forwardedFrom?.senderDisplayName ?? "Family member"}
              </button>
            ) : (
              <span className="message-origin-name">
                {repliedMessage?.senderDisplayName ?? message.forwardedFrom?.senderDisplayName ?? "Family member"}
              </span>
            )}
          </span>
          {repliedMessage && (
            <button
              type="button"
              className="message-origin-preview"
              onClick={(event) => {
                event.stopPropagation();
                onFocusRepliedMessage(repliedMessage.id);
              }}
            >
              {messageActionSummary(repliedMessage)}
            </button>
          )}
        </div>
      )}
      {message.attachments.length > 0 &&
        (() => {
          const { media, other } = partitionMessageAttachments(message.attachments);
          const showAlbumMeta = mediaOnlyMessage && !hasCaption && media.length > 0;
          const mediaDisabledReason = callActive ? "Media playback is paused while a call is active" : undefined;
          const renderSingleAttachment = (file: FamilyFile) => (
            <AttachmentCard
              accessToken={accessToken}
              chatId={message.chatId}
              file={file}
              messageId={message.id}
              disabledReason={mediaDisabledReason}
              onBeforeAudioPlay={async () => {
                videoPlaybackSession.pauseActive();
              }}
              compact
              onOpenImage={onOpenImage}
              videoAutoplay={videoAutoplay}
            />
          );

          return (
            <div className="message-attachments">
              {media.length > 1 ? (
                <div className={showAlbumMeta ? "message-photo-stack message-media-album-stack" : "message-media-album-stack"}>
                  <MessageMediaAlbum
                    accessToken={accessToken}
                    chatId={message.chatId}
                    messageId={message.id}
                    files={media}
                    disabledReason={mediaDisabledReason}
                    videoAutoplay={videoAutoplay}
                    renderImage={(file) => (
                      <MessageImageAttachment accessToken={accessToken} file={file} onOpenImage={onOpenImage} />
                    )}
                  />
                  {showAlbumMeta ? messageMeta : null}
                </div>
              ) : (
                media.map((file) => {
                  const showOverlayMeta = showAlbumMeta && isImageAttachment(file);
                  const attachment = renderSingleAttachment(file);
                  if (!showOverlayMeta) {
                    return <div key={file.id}>{attachment}</div>;
                  }
                  return (
                    <div className="message-photo-stack" key={file.id}>
                      {attachment}
                      {messageMeta}
                    </div>
                  );
                })
              )}
              {other.map((file) => (
                <div key={file.id}>{renderSingleAttachment(file)}</div>
              ))}
            </div>
          );
        })()}
      {(hasCaption || message.deliveryError || !mediaOnlyMessage || isEditing) && (
        <div className="message-bubble-inner">
          {isEditing ? (
            <div
              className="message-inline-editor"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <textarea
                className="message-inline-editor-textarea"
                value={inlineContent}
                onChange={(e) => setInlineContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleInlineSave();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    onCancelEdit?.();
                  }
                }}
                autoFocus
                rows={Math.max(2, inlineContent.split("\n").length)}
              />
              <div className="message-inline-editor-actions">
                <button
                  type="button"
                  className="message-inline-editor-btn cancel"
                  disabled={isSavingEdit}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelEdit?.();
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="message-inline-editor-btn save"
                  disabled={isSavingEdit || !inlineContent.trim()}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleInlineSave();
                  }}
                >
                  {isSavingEdit ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {hasCaption ? (
                <div className="message-body">
                  {renderMarkdown ? <MessageMarkdown source={message.content} /> : message.content}
                  {message.isEdited && (
                    <span className="message-edited-label" aria-label="Edited">
                      (edited)
                    </span>
                  )}
                </div>
              ) : null}
              {message.deliveryError ? <p className="encrypted-message-unavailable">{message.deliveryError}</p> : null}
              {(!mediaOnlyMessage || hasCaption) && messageMeta}
            </>
          )}
        </div>
      )}
      {message.reactions.length > 0 && (
        <div className="message-reactions" aria-label="Message reactions">
          {message.reactions.map((reaction) => {
            const userIds = uniqueUserIds(reaction.userIds);
            const names = userIds
              .map((userId) => memberLookup.get(userId)?.displayName ?? "Family member")
              .join(", ");
            const reacted = currentUserId ? userIds.includes(currentUserId) : reaction.reacted;
            return (
              <button
                type="button"
                className={`reaction-pill ${reacted ? "active" : ""}`}
                aria-label={`${reaction.emoji} reaction from ${names}`}
                title={names}
                key={reaction.emoji}
                onClick={() => onReact(message, reaction.emoji)}
              >
                <span className="reaction-emoji">{reaction.emoji}</span>
                {userIds.length > 3 ? (
                  <span className="reaction-count">{reaction.count}</span>
                ) : (
                  <span className="reaction-avatar-stack" aria-hidden="true">
                    {userIds.map((userId) => {
                      const user = memberLookup.get(userId);
                      return (
                        <span className="reaction-avatar" key={userId}>
                          {chatInitials(user?.displayName ?? "?")}
                        </span>
                      );
                    })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {threadReplyCount > 0 && (
        <button
          type="button"
          className="thread-open-button"
          onClick={() => {
            onOpenThread(message);
          }}
        >
          {threadReplyCount} {threadReplyCount === 1 ? "comment" : "comments"}
        </button>
      )}
    </article>
  );
}
