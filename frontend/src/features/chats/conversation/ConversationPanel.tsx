import { RefObject, useMemo, useState } from "react";
import { Forward, MessageCircle, Reply } from "lucide-react";

import type { User } from "../../../api/auth";
import type { Chat } from "../../../api/chats";
import type { FamilyFile } from "../../../api/files";
import type { CallSessionApi } from "../calling/useCallSession";
import { Composer } from "../composer/Composer";
import type { CallPhase } from "../shared/types";
import type { Message } from "../shared/types";
import { messageActionSummary } from "../shared/messagePresentation";
import { ChatHeader } from "./ChatHeader";
import { MessageContextMenu } from "./MessageContextMenu";
import { MessageDialogs } from "./MessageDialogs";
import { MessageList } from "./MessageList";
import { copyToClipboard } from "../../../utils/clipboard";
import type { ComposerController, ConversationController } from "./types";

export type ConversationPanelProps = {
  thread: ConversationController;
  composer: ComposerController;
  accessToken: string | null;
  currentUser: User | null;
  selectedChat: Chat | null;
  activeChatId?: string;
  chats: Chat[];
  memberLookup: Map<string, { displayName: string; username?: string }>;
  isChatLoading: boolean;
  typingNames: string[];
  callPhase: CallPhase;
  activeCallChatId: string | null;
  isChatMenuOpen: boolean;
  chatMenuRef: RefObject<HTMLDivElement | null>;
  onToggleChatMenu: () => void;
  onBack: () => void;
  onOpenDetails: () => void;
  onStartAudioCall: () => void;
  onStartVideoCall: () => void;
  onMarkRead: () => void;
  onTogglePinned: () => void;
  onToggleMuted: () => void;
  onToggleFavorite: () => void;
  channelCommentsDisabledForViewer: boolean;
  missingCommentThread: boolean;
  canPostInSelectedChannel: boolean;
  resolvedThemeMode: "light" | "dark";
  videoAutoplay: boolean;
  renderMarkdown: boolean;
  isDockedEmojiPicker: boolean;
  showDockedEmojiPicker: boolean;
  callSession?: CallSessionApi;
  onOpenChat: (chat: Chat) => void;
  onOpenImage: (file: FamilyFile, previewUrl: string, messageId?: string) => void;
  onOpenNewChat: () => void;
};

export function ConversationPanel({
  thread,
  composer,
  accessToken,
  currentUser,
  selectedChat,
  activeChatId,
  chats,
  memberLookup,
  isChatLoading,
  typingNames,
  callPhase,
  activeCallChatId,
  callSession,
  isChatMenuOpen,
  chatMenuRef,
  onToggleChatMenu,
  onBack,
  onOpenDetails,
  onStartAudioCall,
  onStartVideoCall,
  onMarkRead,
  onTogglePinned,
  onToggleMuted,
  onToggleFavorite,
  channelCommentsDisabledForViewer,
  missingCommentThread,
  canPostInSelectedChannel,
  resolvedThemeMode,
  videoAutoplay,
  renderMarkdown,
  isDockedEmojiPicker,
  showDockedEmojiPicker,
  onOpenChat,
  onOpenImage,
  onOpenNewChat
}: ConversationPanelProps) {
  const {
    messages,
    visibleMessages,
    threadRootMessage,
    threadRootMessageId,
    setThreadRootMessageId,
    messageSearch,
    setMessageSearch,
    isMessageSearchOpen,
    wholeWordSearch,
    setWholeWordSearch,
    caseSensitiveSearch,
    setCaseSensitiveSearch,
    openMessageSearch,
    toggleMessageSearch,
    closeMessageSearch,
    showScrollToBottom,
    pendingNewBelowCount,
    selectedMessageIds,
    isMessageSelectionMode,
    clearSelectedMessages,
    replyTarget,
    setReplyTarget,
    forwardTarget,
    setForwardTarget,
    editTargetMessage,
    swipeReplyState,
    pinnedMessages,
    pinIndex,
    deleteTarget,
    setDeleteTarget,
    deleteForMe,
    setDeleteForMe,
    deleteForEveryone,
    setDeleteForEveryone,
    messageContextMenu,
    setMessageContextMenu,
    computeContextMenuSeenBy,
    messagesPanelRef,
    focusMessageInPanel,
    handleHistoryScroll,
    scrollMessagesToBottom,
    openPinnedMessages,
    handleReplyToMessage,
    handleConfirmDelete,
    handleForwardMessage,
    handlePinMessage,
    handleUnpinMessage,
    handleArchiveMessage,
    handleArchiveSelectedMessages,
    handleCopySelectedMessages,
    handleSaveEditMessage,
    handleMessageReaction,
    handleOpenThread,
    handleMessageBubbleClick,
    openMessageContextMenu,
    beginSwipeReplyGesture,
    handleSwipeReplyMove,
    endSwipeReplyGesture,
    threadReplyCounts
  } = thread;

  const {
    composer: composerText,
    formattingToolbarAnchor,
    pendingAttachments,
    composerIsMultiline,
    setComposerEnlargeOpen,
    isAttachmentSheetOpen,
    setIsAttachmentSheetOpen,
    isEmojiPickerOpen,
    isVoiceRecording,
    isUploading,
    isSendingMessage,
    composerInputRef,
    composerFormattingSelectionRef,
    attachmentInputRef,
    galleryAttachmentInputRef,
    cameraAttachmentInputRef,
    audioAttachmentInputRef,
    documentAttachmentInputRef,
    emojiPickerRef,
    emojiPickerDockRef,
    updateComposerFormattingSelection,
    toggleEmojiPicker,
    handleComposerChange,
    handleComposerKeyDown,
    handleAttachButtonClick,
    handleAttachmentSheetPick,
    handleFileSelect,
    addSharedFileAttachments,
    removePendingAttachment,
    updatePendingAttachment,
    handleComposerCut,
    handleComposerCopy,
    handleComposerPaste,
    handleComposerFormat,
    handleComposerEmojiPick,
    handleComposerFocus,
    handleEditMessage,
    cancelEditMode,
    handleSendMessage,
    handleScheduleMessage,
    handleSetReminder,
    handleVoicePressStart,
    handleVoicePressEnd,
    handleVoicePressCancel,
    messageDelayRemaining
  } = composer;

  const selectedMessages = useMemo(
    () => messages.filter((message) => selectedMessageIds.includes(message.id)),
    [messages, selectedMessageIds]
  );
  const singleSelectedMessage = selectedMessages.length === 1 ? selectedMessages[0] : null;
  const canEditSelected =
    Boolean(singleSelectedMessage) &&
    singleSelectedMessage?.senderId === currentUser?.id &&
    Boolean(singleSelectedMessage?.content?.trim()) &&
    !singleSelectedMessage?.id.startsWith("pending:");
  const canDeleteSelected = selectedMessages.some(
    (message) => message.senderId === currentUser?.id && !message.id.startsWith("pending:")
  );
  const [pendingBulkForward, setPendingBulkForward] = useState<Message[]>([]);

  if (!selectedChat) {
    if (activeChatId) {
      return (
        <div className="chat-loading-surface" aria-busy="true" aria-label="Loading chat">
          <div className="chat-loading-header">
            <span className="skeleton-avatar" />
            <span className="chat-list-copy">
              <span className="skeleton-line wide" />
              <span className="skeleton-line" />
            </span>
          </div>
          <div className="messages-panel messages-panel--loading">
            <div className="message-list skeleton-message-list">
              <div className="chat-message-row message-incoming skeleton-message-row">
                <span className="skeleton-avatar" />
                <div className="message-bubble skeleton-bubble wide"><span className="skeleton-line wide" /></div>
              </div>
              <div className="chat-message-row message-outgoing skeleton-message-row">
                <div className="message-bubble skeleton-bubble medium"><span className="skeleton-line" /></div>
              </div>
            </div>
          </div>
          <div className="chat-loading-composer"><span className="skeleton-line wide" /></div>
        </div>
      );
    }
    return (
      <div className="chat-empty-state-wrapper">
        <div className="chat-empty-state-card">
          <div className="chat-empty-icon-pill">
            <MessageCircle aria-hidden="true" size={38} />
          </div>
          <h2 className="chat-empty-title">Select a chat</h2>
          <p className="chat-empty-subtitle">
            Choose a conversation on the left, or start a new small-circle chat.
          </p>
          <button type="button" className="chat-empty-action-pill" onClick={onOpenNewChat}>
            New message
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <ChatHeader
        accessToken={accessToken}
        currentUser={currentUser}
        selectedChat={selectedChat}
        typingNames={typingNames}
        callPhase={callPhase}
        activeCallChatId={activeCallChatId}
        isChatMenuOpen={isChatMenuOpen}
        chatMenuRef={chatMenuRef}
        onToggleChatMenu={onToggleChatMenu}
        onBack={isMessageSelectionMode ? clearSelectedMessages : onBack}
        onOpenDetails={onOpenDetails}
        onStartAudioCall={onStartAudioCall}
        onStartVideoCall={onStartVideoCall}
        isMessageSearchOpen={isMessageSearchOpen}
        onToggleMessageSearch={toggleMessageSearch}
        onOpenMessageSearch={openMessageSearch}
        onMarkRead={onMarkRead}
        onTogglePinned={onTogglePinned}
        onToggleMuted={onToggleMuted}
        onToggleFavorite={onToggleFavorite}
        isMessageSelectionMode={isMessageSelectionMode}
        selectedCount={selectedMessageIds.length}
        canEditSelected={canEditSelected}
        canDeleteSelected={canDeleteSelected}
        threadRootMessage={threadRootMessage}
        onBackFromThread={() => {
          setThreadRootMessageId(null);
          setReplyTarget(null);
        }}
        onSelectionCopy={handleCopySelectedMessages}
        onSelectionDelete={() => {
          const owned = selectedMessages.find(
            (message) => message.senderId === currentUser?.id && !message.id.startsWith("pending:")
          );
          if (!owned) return;
          setDeleteForMe(true);
          setDeleteForEveryone(true);
          setDeleteTarget(owned);
        }}
        onSelectionArchive={() => void handleArchiveSelectedMessages()}
        onSelectionEdit={() => {
          if (!singleSelectedMessage || !canEditSelected) return;
          handleEditMessage(singleSelectedMessage);
          clearSelectedMessages();
        }}
      />
      {isMessageSearchOpen && (
        <div className="search-field message-search-field" role="search">
          <span className="ms-icon ms-icon--20" aria-hidden={true}>
            search
          </span>
          <input
            autoFocus
            aria-label="Search this chat"
            placeholder="Search this chat"
            value={messageSearch}
            onChange={(event) => setMessageSearch(event.target.value)}
          />
          <button
            type="button"
            className="message-search-option"
            aria-label="Match whole words"
            aria-pressed={wholeWordSearch}
            title="Match whole words"
            onClick={() => setWholeWordSearch((value) => !value)}
          >
            W
          </button>
          <button
            type="button"
            className="message-search-option"
            aria-label="Match case"
            aria-pressed={caseSensitiveSearch}
            title="Match case"
            onClick={() => setCaseSensitiveSearch((value) => !value)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18 9 5l5 13M6 13h6M14 18l3-8 3 8M15.3 14h3.4" /></svg>
          </button>
          <span className="message-search-results" aria-live="polite">{visibleMessages.length} results</span>
          <button
            type="button"
            className="message-search-option message-search-close"
            aria-label="Close message search"
            onClick={closeMessageSearch}
          >
            <span className="ms-icon ms-icon--20" aria-hidden={true}>
              close
            </span>
          </button>
        </div>
      )}
      {pinnedMessages.length > 0 && (
        <div className="pinned-banner" role="status">
          <button
            type="button"
            className="pinned-banner-click-area"
            aria-label="Go to pinned message"
            onClick={openPinnedMessages}
          >
            <span className="pinned-banner-eyebrow" aria-live="polite">
              {pinnedMessages.length === 1
                ? "Pinned message"
                : `Pinned message · ${pinnedMessages.length - pinIndex} of ${pinnedMessages.length}`}
            </span>
            <span className="pinned-banner-preview">
              {messageActionSummary(
                pinnedMessages[pinIndex]?.message ?? pinnedMessages[0].message
              )}
            </span>
          </button>
        </div>
      )}
      <MessageList
        accessToken={accessToken}
        currentUser={currentUser}
        selectedChat={selectedChat}
        chats={chats}
        messages={messages}
        visibleMessages={visibleMessages}
        threadRootMessage={threadRootMessage}
        threadRootMessageId={threadRootMessageId}
        memberLookup={memberLookup}
        isChatLoading={isChatLoading}
        videoAutoplay={videoAutoplay}
        renderMarkdown={renderMarkdown}
        callActive={callPhase !== "idle"}
        messageSearchActive={Boolean(messageSearch.trim())}
        selectedMessageIds={selectedMessageIds}
        isMessageSelectionMode={isMessageSelectionMode}
        editTargetMessage={editTargetMessage}
        swipeReplyState={swipeReplyState}
        threadReplyCounts={threadReplyCounts}
        showScrollToBottom={showScrollToBottom}
        pendingNewBelowCount={pendingNewBelowCount}
        messagesPanelRef={messagesPanelRef}
        showDockedEmojiPicker={showDockedEmojiPicker}
        onScroll={handleHistoryScroll}
        onScrollToBottomClick={() => scrollMessagesToBottom("smooth")}
        onBackFromThread={() => {
          setThreadRootMessageId(null);
          setReplyTarget(null);
        }}
        onBubbleClick={handleMessageBubbleClick}
        onContextMenu={openMessageContextMenu}
        onSwipePointerDown={(event, message) => beginSwipeReplyGesture(event, message, missingCommentThread)}
        onSwipePointerMove={handleSwipeReplyMove}
        onSwipePointerUp={(event, message) => endSwipeReplyGesture(event, message)}
        onSwipePointerCancel={(event, message) => endSwipeReplyGesture(event, message, { commit: false })}
        onOpenImage={onOpenImage}
        onFocusRepliedMessage={(messageId) =>
          focusMessageInPanel({ messageId, highlightClassName: "message-context-flash" })
        }
        onOpenOriginChat={onOpenChat}
        onReact={(message, emoji) => void handleMessageReaction(message, emoji)}
        onOpenThread={(message) => void handleOpenThread(message)}
        onSaveEdit={handleSaveEditMessage}
        onCancelEdit={cancelEditMode}
      />
      {messageContextMenu && (
        <MessageContextMenu
          menu={messageContextMenu}
          currentUser={currentUser}
          selectedChat={selectedChat}
          channelCommentsDisabledForViewer={channelCommentsDisabledForViewer}
          isInThreadMode={Boolean(threadRootMessageId)}
          isPinned={pinnedMessages.some((p) => p.messageId === messageContextMenu.message.id)}
          seenBy={computeContextMenuSeenBy(memberLookup)}
          onReact={(emoji) => {
            setMessageContextMenu(null);
            void handleMessageReaction(messageContextMenu.message, emoji);
          }}
          onComment={() => {
            const targetMessage = messageContextMenu.message;
            setMessageContextMenu(null);
            void handleOpenThread(targetMessage);
          }}
          onReply={() => handleReplyToMessage(messageContextMenu.message)}
          onCopy={() => {
            if (messageContextMenu.message.content) {
              copyToClipboard(messageContextMenu.message.content);
            }
            setMessageContextMenu(null);
          }}
          onTogglePin={() => {
            if (pinnedMessages.some((p) => p.messageId === messageContextMenu.message.id)) {
              void handleUnpinMessage(messageContextMenu.message);
            } else {
              void handlePinMessage(messageContextMenu.message);
            }
          }}
          onForward={() => {
            setPendingBulkForward([]);
            setForwardTarget(messageContextMenu.message);
            setMessageContextMenu(null);
          }}
          onArchive={() => void handleArchiveMessage(messageContextMenu.message)}
          onEdit={() => handleEditMessage(messageContextMenu.message)}
          onDelete={() => {
            setDeleteForMe(true);
            setDeleteForEveryone(true);
            setDeleteTarget(messageContextMenu.message);
            setMessageContextMenu(null);
          }}
        />
      )}
      {isMessageSelectionMode ? (
        <div className="message-selection-actions" role="toolbar" aria-label="Selected message actions">
          {selectedMessageIds.length === 1 && (
            <>
              {!threadRootMessageId && (
                <button
                  type="button"
                  className="message-selection-action"
                  disabled={channelCommentsDisabledForViewer}
                  onClick={() => {
                    if (!singleSelectedMessage) return;
                    void handleOpenThread(singleSelectedMessage);
                    clearSelectedMessages();
                  }}
                >
                  <MessageCircle aria-hidden="true" size={22} />
                  <span>Comment</span>
                </button>
              )}
              {(!selectedChat || selectedChat.type !== "channel" || canPostInSelectedChannel || threadRootMessageId) && (
                <button
                  type="button"
                  className="message-selection-action"
                  disabled={channelCommentsDisabledForViewer || missingCommentThread}
                  onClick={() => {
                    if (!singleSelectedMessage) return;
                    handleReplyToMessage(singleSelectedMessage);
                    clearSelectedMessages();
                  }}
                >
                  <Reply aria-hidden="true" size={22} />
                  <span>Reply</span>
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className="message-selection-action"
            onClick={() => {
              if (selectedMessages.length === 0) return;
              setPendingBulkForward(selectedMessages);
              setForwardTarget(selectedMessages[0]);
            }}
          >
            <Forward aria-hidden="true" size={22} />
            <span>Forward</span>
          </button>
        </div>
      ) : (
        <Composer
          accessToken={accessToken}
          selectedChat={selectedChat}
          resolvedThemeMode={resolvedThemeMode}
          channelCommentsDisabledForViewer={channelCommentsDisabledForViewer}
          missingCommentThread={missingCommentThread}
          canPostInSelectedChannel={canPostInSelectedChannel}
          replyTarget={replyTarget}
          isInThreadMode={Boolean(threadRootMessageId)}
          onCancelReply={() => setReplyTarget(null)}
          editTargetMessage={editTargetMessage}
          onCancelEdit={cancelEditMode}
          composer={composerText}
          onComposerChange={handleComposerChange}
          onComposerKeyDown={handleComposerKeyDown}
          onComposerFocus={handleComposerFocus}
          onComposerSelectionUpdate={updateComposerFormattingSelection}
          onComposerFormat={handleComposerFormat}
          onComposerCut={handleComposerCut}
          onComposerCopy={handleComposerCopy}
          onComposerPaste={handleComposerPaste}
          composerInputRef={composerInputRef}
          composerFormattingSelectionRef={composerFormattingSelectionRef}
          formattingToolbarAnchor={formattingToolbarAnchor}
          composerIsMultiline={composerIsMultiline}
          composerLineCount={composer.composerLineCount}
          onEnlargeComposer={() => setComposerEnlargeOpen(true)}
          pendingAttachments={pendingAttachments}
          onRemovePendingAttachment={removePendingAttachment}
          onUpdatePendingAttachment={updatePendingAttachment}
          isAttachmentSheetOpen={isAttachmentSheetOpen}
          galleryPreviewMediaItem={composer.galleryPreviewMediaItem}
          onGalleryPreviewMediaItemChange={composer.setGalleryPreviewMediaItem}
          onAttachButtonClick={handleAttachButtonClick}
          onAttachmentSheetPick={handleAttachmentSheetPick}
          onCloseAttachmentSheet={() => setIsAttachmentSheetOpen(false)}
          onFileSelect={handleFileSelect}
          onAddSharedFileAttachments={addSharedFileAttachments}
          attachmentInputRef={attachmentInputRef}
          galleryAttachmentInputRef={galleryAttachmentInputRef}
          cameraAttachmentInputRef={cameraAttachmentInputRef}
          audioAttachmentInputRef={audioAttachmentInputRef}
          documentAttachmentInputRef={documentAttachmentInputRef}
          isEmojiPickerOpen={isEmojiPickerOpen}
          emojiPickerRef={emojiPickerRef}
          emojiPickerDockRef={emojiPickerDockRef}
          isDockedEmojiPicker={isDockedEmojiPicker}
          showDockedEmojiPicker={showDockedEmojiPicker}
          onToggleEmojiPicker={toggleEmojiPicker}
          onEmojiPick={handleComposerEmojiPick}
          isUploading={isUploading}
          isSendingMessage={isSendingMessage}
          isVoiceRecording={isVoiceRecording}
          messageDelayRemaining={messageDelayRemaining}
          onVoicePressStart={(event) => void handleVoicePressStart(event)}
          onVoicePressEnd={(event) => void handleVoicePressEnd(event)}
          onVoicePressCancel={handleVoicePressCancel}
          onSubmit={handleSendMessage}
          onScheduleMessage={handleScheduleMessage}
          onSetReminder={handleSetReminder}
        />
      )}
      <MessageDialogs
        accessToken={accessToken}
        currentUserId={currentUser?.id}
        chats={chats}
        forwardTarget={forwardTarget}
        forwardCount={pendingBulkForward.length > 0 ? pendingBulkForward.length : forwardTarget ? 1 : 0}
        onForwardMessage={(targetChatId) => {
          const bulk = pendingBulkForward;
          setPendingBulkForward([]);
          void handleForwardMessage(targetChatId, chats, bulk.length > 0 ? bulk : undefined);
        }}
        onCloseForward={() => {
          setPendingBulkForward([]);
          setForwardTarget(null);
        }}
        deleteTarget={deleteTarget}
        deleteForMe={deleteForMe}
        deleteForEveryone={deleteForEveryone}
        onDeleteForMeChange={setDeleteForMe}
        onDeleteForEveryoneChange={setDeleteForEveryone}
        onConfirmDelete={() => void handleConfirmDelete()}
        onCloseDelete={() => setDeleteTarget(null)}
      />
    </>
  );
}
