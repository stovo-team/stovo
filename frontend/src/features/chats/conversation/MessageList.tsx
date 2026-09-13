import {
  Fragment,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject
} from "react";
import { ChevronDown, MessageCircle } from "lucide-react";

import { useStrings } from "../../../i18n/LanguageContext";
import type { User } from "../../../api/auth";
import type { Chat } from "../../../api/chats";
import type { FamilyFile } from "../../../api/files";
import {
  formatDateSeparator,
  firstImageAttachment,
  messageActionSummary,
  shouldShowDateSeparator
} from "../shared/messagePresentation";
import type { Message, SwipeReplyState } from "../shared/types";
import { ComposerContextThumb } from "./MessageAttachmentThumbs";
import { MessageBubble } from "./MessageBubble";

export function MessageList({
  accessToken,
  currentUser,
  selectedChat,
  chats,
  messages,
  visibleMessages,
  threadRootMessage,
  threadRootMessageId,
  memberLookup,
  isChatLoading,
  videoAutoplay,
  renderMarkdown,
  callActive,
  messageSearchActive,
  selectedMessageIds,
  isMessageSelectionMode,
  editTargetMessage,
  swipeReplyState,
  threadReplyCounts,
  showScrollToBottom,
  pendingNewBelowCount,
  messagesPanelRef,
  showDockedEmojiPicker,
  onScroll,
  onScrollToBottomClick,
  onBackFromThread,
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
  onOpenThread,
  onSaveEdit,
  onCancelEdit,
  onVotePoll,
  onClosePoll,
  onViewPollVoters
}: {
  accessToken: string | null;
  currentUser: User | null;
  selectedChat: Chat;
  chats: Chat[];
  messages: Message[];
  visibleMessages: Message[];
  threadRootMessage: Message | null;
  threadRootMessageId: string | null;
  memberLookup: Map<string, { displayName: string; username?: string }>;
  isChatLoading: boolean;
  videoAutoplay: boolean;
  renderMarkdown: boolean;
  callActive: boolean;
  messageSearchActive: boolean;
  selectedMessageIds: string[];
  isMessageSelectionMode: boolean;
  editTargetMessage: Message | null;
  swipeReplyState: SwipeReplyState | null;
  threadReplyCounts: Map<string, number>;
  showScrollToBottom: boolean;
  pendingNewBelowCount: number;
  messagesPanelRef: RefObject<HTMLDivElement | null>;
  showDockedEmojiPicker: boolean;
  onScroll: () => void;
  onScrollToBottomClick: () => void;
  onBackFromThread: () => void;
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
  onSaveEdit?: (message: Message, content: string) => Promise<void>;
  onCancelEdit?: () => void;
  onVotePoll?: (pollId: string, optionIds: string[]) => Promise<void> | void;
  onClosePoll?: (pollId: string) => Promise<void> | void;
  onViewPollVoters?: (poll: any) => void;
}) {
  const strings = useStrings();
  const threadComments = threadRootMessageId
    ? visibleMessages.filter((message) => message.id !== threadRootMessageId)
    : [];

  const renderMessage = (message: Message, previousMessage: Message | undefined) => (
    <MessageBubble
      key={message.clientMessageId || message.id}
      message={message}
      previousMessage={previousMessage}
      currentUserId={currentUser?.id}
      selectedChat={selectedChat}
      chats={chats}
      messages={messages}
      memberLookup={memberLookup}
      accessToken={accessToken}
      videoAutoplay={videoAutoplay}
      renderMarkdown={renderMarkdown}
      callActive={callActive}
      isMessageSelectionMode={isMessageSelectionMode}
      isSelected={selectedMessageIds.includes(message.id)}
      swipeReplyState={swipeReplyState}
      threadReplyCount={threadReplyCounts.get(message.id) ?? 0}
      showThreadButton={!threadRootMessageId}
      isEditing={editTargetMessage?.id === message.id}
      onSaveEdit={onSaveEdit}
      onCancelEdit={onCancelEdit}
      onBubbleClick={onBubbleClick}
      onContextMenu={onContextMenu}
      onSwipePointerDown={onSwipePointerDown}
      onSwipePointerMove={onSwipePointerMove}
      onSwipePointerUp={onSwipePointerUp}
      onSwipePointerCancel={onSwipePointerCancel}
      onOpenImage={onOpenImage}
      onFocusRepliedMessage={onFocusRepliedMessage}
      onOpenOriginChat={onOpenOriginChat}
      onReact={onReact}
      onOpenThread={onOpenThread}
      onVotePoll={onVotePoll}
      onClosePoll={onClosePoll}
      onViewPollVoters={onViewPollVoters}
    />
  );

  const renderMessagesWithDateSeparators = (
    messagesToRender: Message[],
    messageBeforeList?: Message
  ) =>
    messagesToRender.map((message, messageIndex) => {
      const previousMessage = messageIndex > 0 ? messagesToRender[messageIndex - 1] : messageBeforeList;

      return (
        <Fragment key={message.clientMessageId || message.id}>
          {shouldShowDateSeparator(message.createdAt, previousMessage?.createdAt) && (
            <div className="date-separator">{formatDateSeparator(message.createdAt)}</div>
          )}
          {renderMessage(message, previousMessage)}
        </Fragment>
      );
    });

  return (
    <>
      <div
        className={
          messages.length === 0 && !isChatLoading
            ? "phase-empty-state"
            : `messages-panel${showDockedEmojiPicker ? " messages-panel--emoji-docked" : ""}${
                isChatLoading && messages.length === 0 ? " messages-panel--loading" : ""
              }`
        }
        aria-busy={isChatLoading}
        ref={messagesPanelRef}
        onScroll={onScroll}
      >
        {isChatLoading && messages.length === 0 ? (
          <div className="message-list skeleton-message-list" aria-label="Loading chat messages">
            <div className="chat-message-row message-incoming skeleton-message-row">
              <span className="skeleton-avatar" />
              <div className="message-bubble skeleton-bubble wide">
                <span className="skeleton-line wide" />
                <span className="skeleton-line" />
              </div>
            </div>
            <div className="chat-message-row message-outgoing skeleton-message-row">
              <div className="message-bubble skeleton-bubble medium">
                <span className="skeleton-line wide" />
              </div>
            </div>
            <div className="chat-message-row message-incoming skeleton-message-row">
              <span className="skeleton-avatar" />
              <div className="message-bubble skeleton-bubble short">
                <span className="skeleton-line" />
              </div>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <>
            <MessageCircle aria-hidden="true" size={36} />
            <strong>No messages yet</strong>
            <p>Send the first message to start the conversation.</p>
          </>
        ) : visibleMessages.length === 0 && !(threadRootMessageId && threadRootMessage) ? (
          <div className="phase-empty-state compact-empty">
            <span className="ms-icon ms-icon--20" aria-hidden={true}>
              search
            </span>
            <strong>{threadRootMessageId ? strings.comments.noComments : "No matches"}</strong>
            <p>
              {threadRootMessageId
                ? strings.comments.firstComment
                : "Try another word or close search to return to the full chat."}
            </p>
          </div>
        ) : (
          <div className="message-list">
            {threadRootMessageId && threadRootMessage ? (
              <>
                <div className="date-separator">{formatDateSeparator(threadRootMessage.createdAt)}</div>
                {renderMessage(threadRootMessage, undefined)}
                <div className="thread-comments-divider" role="separator">
                  <span>{strings.comments.title}</span>
                </div>
                {threadComments.length === 0 ? (
                  <div className="thread-comments-empty">
                    <strong>{strings.comments.noComments}</strong>
                    <p>{strings.comments.firstComment}</p>
                  </div>
                ) : (
                  renderMessagesWithDateSeparators(threadComments, threadRootMessage)
                )}
              </>
            ) : (
              renderMessagesWithDateSeparators(visibleMessages)
            )}
          </div>
        )}
      </div>
      {showScrollToBottom && messages.length > 0 && !messageSearchActive && (
        <button
          type="button"
          className="scroll-to-bottom-fab"
          aria-label={
            pendingNewBelowCount > 0
              ? `Scroll to bottom, ${pendingNewBelowCount} new ${pendingNewBelowCount === 1 ? "message" : "messages"}`
              : "Scroll to bottom"
          }
          title="Scroll to bottom"
          onClick={onScrollToBottomClick}
        >
          {pendingNewBelowCount > 0 && (
            <span className="scroll-to-bottom-fab-count" aria-hidden="true">
              {pendingNewBelowCount > 99 ? "99+" : pendingNewBelowCount}
            </span>
          )}
          <ChevronDown aria-hidden="true" size={22} strokeWidth={2.4} />
        </button>
      )}
    </>
  );
}
