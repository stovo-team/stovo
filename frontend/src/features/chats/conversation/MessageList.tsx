import {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject
} from "react";
import { ChevronDown, MessageCircle } from "lucide-react";

import type { User } from "../../../api/auth";
import type { Chat } from "../../../api/chats";
import type { FamilyFile } from "../../../api/files";
import { formatDateSeparator, firstImageAttachment, messageActionSummary } from "../shared/messagePresentation";
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
  onOpenThread
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
}) {
  return (
    <>
      <div
        className={
          messages.length === 0
            ? "phase-empty-state"
            : `messages-panel${showDockedEmojiPicker ? " messages-panel--emoji-docked" : ""}`
        }
        aria-busy={isChatLoading}
        ref={messagesPanelRef}
        onScroll={onScroll}
      >
        {isChatLoading && messages.length === 0 ? (
          <>
            <MessageCircle aria-hidden="true" size={36} />
            <strong>Loading chat</strong>
            <p>Syncing the latest messages...</p>
          </>
        ) : messages.length === 0 ? (
          <>
            <MessageCircle aria-hidden="true" size={36} />
            <strong>No messages yet</strong>
            <p>Send the first message to start the conversation.</p>
          </>
        ) : visibleMessages.length === 0 ? (
          <div className="phase-empty-state compact-empty">
            <span className="ms-icon ms-icon--20" aria-hidden={true}>
              search
            </span>
            <strong>{threadRootMessageId ? "No messages in this thread" : "No matches"}</strong>
            <p>
              {threadRootMessageId
                ? "Go back to the chat and open another thread."
                : "Try another word or close search to return to the full chat."}
            </p>
          </div>
        ) : (
          <div className="message-list">
            {threadRootMessage && (
              <div
                className={`thread-header${firstImageAttachment(threadRootMessage) ? "" : " thread-header--no-thumb"}`}
              >
                <button
                  type="button"
                  className="thread-header-back"
                  aria-label="Back to chat"
                  title="Back to chat"
                  onClick={onBackFromThread}
                >
                  <span className="ms-icon ms-icon--20" aria-hidden={true}>
                    arrow_back
                  </span>
                </button>
                <div className="thread-header-copy">
                  <span className="thread-header-eyebrow">
                    {selectedChat.type === "channel" ? "Comments" : "Thread"}
                  </span>
                  <strong className="thread-header-title">
                    {messageActionSummary(threadRootMessage)}
                  </strong>
                </div>
                <ComposerContextThumb accessToken={accessToken} file={firstImageAttachment(threadRootMessage)} />
              </div>
            )}
            <div className="date-separator">{formatDateSeparator(visibleMessages[0]?.createdAt)}</div>
            {visibleMessages.map((message, messageIndex) => {
              const previousMessage = messageIndex > 0 ? visibleMessages[messageIndex - 1] : undefined;
              return (
                <MessageBubble
                  key={message.id}
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
                />
              );
            })}
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
