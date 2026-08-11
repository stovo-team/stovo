import { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject, useState } from "react";
import EmojiPicker, { Categories, EmojiClickData, Theme } from "emoji-picker-react";
import { Bus, Cat, Flag, History, Music, Paperclip, Pencil, Reply, Shirt, Smile, Trophy, Utensils, X } from "lucide-react";

import type { Chat } from "../../../api/chats";
import { AttachmentPickerOption } from "../../../components/AttachmentPickerSheet";
import { FormattingToolbar } from "../../../components/FormattingToolbar";
import { ImageEditorModal } from "../../../components/ImageEditorModal";
import { MessageEnlargeButton } from "../../../components/MessageEnlargeModal";
import { VoiceRecordButton } from "../../../components/VoiceRecordButton";
import type { FormattingKind, TextSelection, ToolbarAnchor } from "../../../composerFormatting";
import { isVoiceRecordingSupported } from "../../../voiceRecording";
import { firstImageAttachment, messageActionSummary } from "../shared/messagePresentation";
import type { Message, PendingLocalAttachment } from "../shared/types";
import { ComposerContextThumb } from "../conversation/MessageAttachmentThumbs";
import { AttachmentControls } from "./AttachmentControls";
import { PendingAttachmentCard } from "./PendingAttachmentCard";

const EMOJI_CATEGORY_ICONS: Partial<Record<Categories, ReactNode>> = {
  [Categories.SUGGESTED]: <History aria-hidden="true" size={18} />,
  [Categories.SMILEYS_PEOPLE]: <Smile aria-hidden="true" size={18} />,
  [Categories.ANIMALS_NATURE]: <Cat aria-hidden="true" size={18} />,
  [Categories.FOOD_DRINK]: <Utensils aria-hidden="true" size={18} />,
  [Categories.TRAVEL_PLACES]: <Bus aria-hidden="true" size={18} />,
  [Categories.ACTIVITIES]: <Trophy aria-hidden="true" size={18} />,
  [Categories.OBJECTS]: <Shirt aria-hidden="true" size={18} />,
  [Categories.SYMBOLS]: <Music aria-hidden="true" size={18} />,
  [Categories.FLAGS]: <Flag aria-hidden="true" size={18} />
};

export function Composer({
  accessToken,
  selectedChat,
  resolvedThemeMode,
  channelCommentsDisabledForViewer,
  missingCommentThread,
  canPostInSelectedChannel,
  replyTarget,
  isInThreadMode = false,
  onCancelReply,
  editTargetMessage,
  onCancelEdit,
  composer,
  onComposerChange,
  onComposerKeyDown,
  onComposerFocus,
  onComposerSelectionUpdate,
  onComposerFormat,
  onComposerCut,
  onComposerCopy,
  onComposerPaste,
  composerInputRef,
  composerFormattingSelectionRef,
  formattingToolbarAnchor,
  composerIsMultiline,
  composerLineCount,
  onEnlargeComposer,
  pendingAttachments,
  onRemovePendingAttachment,
  onUpdatePendingAttachment,
  isAttachmentSheetOpen,
  onAttachButtonClick,
  onAttachmentSheetPick,
  onCloseAttachmentSheet,
  onFileSelect,
  onAddSharedFileAttachments,
  attachmentInputRef,
  galleryAttachmentInputRef,
  cameraAttachmentInputRef,
  audioAttachmentInputRef,
  documentAttachmentInputRef,
  isEmojiPickerOpen,
  emojiPickerRef,
  emojiPickerDockRef,
  isDockedEmojiPicker,
  showDockedEmojiPicker,
  onToggleEmojiPicker,
  onEmojiPick,
  isUploading,
  isSendingMessage,
  isVoiceRecording,
  onVoicePressStart,
  onVoicePressEnd,
  onVoicePressCancel,
  onSubmit
}: {
  accessToken: string | null;
  selectedChat: Chat | null;
  resolvedThemeMode: "light" | "dark";
  channelCommentsDisabledForViewer: boolean;
  missingCommentThread: boolean;
  canPostInSelectedChannel: boolean;
  replyTarget: Message | null;
  isInThreadMode?: boolean;
  onCancelReply: () => void;
  editTargetMessage: Message | null;
  onCancelEdit: () => void;
  composer: string;
  onComposerChange: (value: string) => void;
  onComposerKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  onComposerFocus: () => void;
  onComposerSelectionUpdate: () => void;
  onComposerFormat: (kind: FormattingKind) => void;
  onComposerCut: () => void;
  onComposerCopy: () => void;
  onComposerPaste: () => void;
  composerInputRef: RefObject<HTMLTextAreaElement | null>;
  composerFormattingSelectionRef: RefObject<TextSelection | null>;
  formattingToolbarAnchor: ToolbarAnchor | null;
  composerIsMultiline: boolean;
  composerLineCount?: number;
  onEnlargeComposer: () => void;
  pendingAttachments: PendingLocalAttachment[];
  onRemovePendingAttachment: (localId: string) => void;
  onUpdatePendingAttachment?: (localId: string, updatedFile: File) => void;
  isAttachmentSheetOpen: boolean;
  onAttachButtonClick: () => void;
  onAttachmentSheetPick: (option: AttachmentPickerOption) => void;
  onCloseAttachmentSheet: () => void;
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onAddSharedFileAttachments?: (files: File[]) => void;
  attachmentInputRef: RefObject<HTMLInputElement | null>;
  galleryAttachmentInputRef: RefObject<HTMLInputElement | null>;
  cameraAttachmentInputRef: RefObject<HTMLInputElement | null>;
  audioAttachmentInputRef: RefObject<HTMLInputElement | null>;
  documentAttachmentInputRef: RefObject<HTMLInputElement | null>;
  isEmojiPickerOpen: boolean;
  emojiPickerRef: RefObject<HTMLDivElement | null>;
  emojiPickerDockRef: RefObject<HTMLDivElement | null>;
  isDockedEmojiPicker: boolean;
  showDockedEmojiPicker: boolean;
  onToggleEmojiPicker: () => void;
  onEmojiPick: (emojiData: EmojiClickData) => void;
  isUploading: boolean;
  isSendingMessage: boolean;
  isVoiceRecording: boolean;
  onVoicePressStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onVoicePressEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onVoicePressCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onSubmit: (event: { preventDefault: () => void }) => void;
}) {
  const [editingAttachment, setEditingAttachment] = useState<PendingLocalAttachment | null>(null);

  return (
    <form
      className={`message-composer${isDockedEmojiPicker ? " message-composer--emoji-docked" : ""}${showDockedEmojiPicker ? " message-composer--emoji-open" : ""}`}
      onSubmit={onSubmit}
    >
      {pendingAttachments.length > 0 && (
        <div className="composer-attachments-strip" aria-label="Attachments to send">
          <div className="pending-attachments">
            {pendingAttachments.map((pending) => (
              <PendingAttachmentCard
                key={pending.localId}
                pending={pending}
                onRemove={() => onRemovePendingAttachment(pending.localId)}
                onEdit={() => setEditingAttachment(pending)}
              />
            ))}
          </div>
        </div>
      )}
      {editingAttachment && (
        <ImageEditorModal
          pending={editingAttachment}
          onClose={() => setEditingAttachment(null)}
          onSave={(updatedFile) => {
            if (onUpdatePendingAttachment) {
              onUpdatePendingAttachment(editingAttachment.localId, updatedFile);
            }
            setEditingAttachment(null);
          }}
        />
      )}
      {selectedChat?.type === "channel" && channelCommentsDisabledForViewer && (
        <p className="muted-copy">Comments are disabled in this channel.</p>
      )}
      {replyTarget && !isInThreadMode && (
        <div
          className={`reply-composer-preview${
            firstImageAttachment(replyTarget) ? "" : " reply-composer-preview--no-thumb"
          }`}
        >
          <Reply className="reply-composer-icon" aria-hidden="true" size={16} />
          <span className="reply-composer-bar" aria-hidden="true" />
          <ComposerContextThumb accessToken={accessToken} file={firstImageAttachment(replyTarget)} />
          <div className="reply-composer-copy">
            <span className="reply-composer-who">
              Reply to {replyTarget.senderDisplayName ?? "Family member"}
            </span>
            <span className="reply-composer-snip">{messageActionSummary(replyTarget)}</span>
          </div>
          <button
            type="button"
            className="reply-composer-dismiss"
            aria-label="Cancel reply"
            title="Cancel reply"
            onClick={onCancelReply}
          >
            <X aria-hidden="true" size={14} />
          </button>
        </div>
      )}
      <div className={`message-composer-row${composerIsMultiline ? " message-composer-row--multiline" : ""}`}>
        <AttachmentControls
          disabled={isUploading || channelCommentsDisabledForViewer || missingCommentThread}
          isAttachmentSheetOpen={isAttachmentSheetOpen}
          attachmentInputRef={attachmentInputRef}
          galleryAttachmentInputRef={galleryAttachmentInputRef}
          cameraAttachmentInputRef={cameraAttachmentInputRef}
          audioAttachmentInputRef={audioAttachmentInputRef}
          documentAttachmentInputRef={documentAttachmentInputRef}
          onAttachButtonClick={onAttachButtonClick}
          onFileSelect={onFileSelect}
          onCloseSheet={onCloseAttachmentSheet}
          onPickOption={onAttachmentSheetPick}
          onSelectDirectFiles={onAddSharedFileAttachments}
        />
        <div className="emoji-picker-shell" ref={emojiPickerRef}>
          <button
            type="button"
            className="emoji-picker-button"
            aria-label="Add emoji"
            aria-expanded={isEmojiPickerOpen}
            title="Add emoji"
            disabled={channelCommentsDisabledForViewer || missingCommentThread}
            onClick={onToggleEmojiPicker}
          >
            <Smile aria-hidden="true" size={22} />
          </button>
          {!showDockedEmojiPicker && isEmojiPickerOpen && (
            <div className="emoji-picker" role="menu" aria-label="Choose emoji">
              <EmojiPicker
                onEmojiClick={onEmojiPick}
                autoFocusSearch={false}
                lazyLoadEmojis
                previewConfig={{ showPreview: false }}
                searchDisabled
                skinTonesDisabled
                categoryIcons={EMOJI_CATEGORY_ICONS}
                theme={resolvedThemeMode === "light" ? Theme.LIGHT : Theme.DARK}
                width={320}
                height={380}
              />
            </div>
          )}
        </div>
        <div className="message-composer-shell">
          <div className="message-composer-input-wrap">
            <textarea
              ref={composerInputRef}
              rows={1}
              maxLength={4000}
              placeholder={
                selectedChat?.type === "channel"
                  ? channelCommentsDisabledForViewer
                    ? "Comments are disabled"
                    : missingCommentThread
                      ? "Comment…"
                      : canPostInSelectedChannel
                        ? "Post an update"
                        : "Message"
                  : "Message"
              }
              value={composer}
              disabled={channelCommentsDisabledForViewer || missingCommentThread}
              onChange={(event) => {
                onComposerSelectionUpdate();
                onComposerChange(event.target.value);
              }}
              onFocus={onComposerFocus}
              onKeyDown={onComposerKeyDown}
              onKeyUp={onComposerSelectionUpdate}
              onPointerUp={onComposerSelectionUpdate}
              onScroll={onComposerSelectionUpdate}
              onSelect={onComposerSelectionUpdate}
              onContextMenu={(event) => {
                const textarea = event.currentTarget;
                if (textarea.selectionStart !== textarea.selectionEnd) {
                  event.preventDefault();
                  onComposerSelectionUpdate();
                }
              }}
            />
          </div>
        </div>
        <FormattingToolbar
          selection={composerFormattingSelectionRef.current}
          anchor={formattingToolbarAnchor}
          onFormat={onComposerFormat}
          onCut={onComposerCut}
          onCopy={onComposerCopy}
          onPaste={() => onComposerPaste()}
        />
        <div className="message-composer-actions">
          {((composerLineCount ?? composer.split("\n").length) >= 3) && (
            <MessageEnlargeButton onClick={onEnlargeComposer} />
          )}
          {(!composer.trim() && pendingAttachments.length === 0 && isVoiceRecordingSupported()) || isVoiceRecording ? (
            <VoiceRecordButton
              isRecording={isVoiceRecording}
              disabled={isUploading || isSendingMessage || channelCommentsDisabledForViewer || missingCommentThread}
              onPressStart={(event) => onVoicePressStart(event)}
              onPressEnd={(event) => onVoicePressEnd(event)}
              onPressCancel={onVoicePressCancel}
            />
          ) : (
            <button
              type="submit"
              aria-label="Send message"
              aria-busy={isUploading || isSendingMessage}
              disabled={
                isUploading ||
                isSendingMessage ||
                channelCommentsDisabledForViewer ||
                missingCommentThread ||
                (!composer.trim() && pendingAttachments.length === 0)
              }
              onPointerDown={(event) => {
                event.preventDefault();
              }}
            >
              <span className="ms-icon ms-icon--20" aria-hidden={true}>
                send
              </span>
              {(isUploading || isSendingMessage) && (
                <span className="visually-hidden">{isUploading ? "Uploading" : "Sending"}</span>
              )}
            </button>
          )}
        </div>
      </div>
      {showDockedEmojiPicker && (
        <div className="emoji-picker-dock" ref={emojiPickerDockRef} role="group" aria-label="Emoji picker">
          <div className="emoji-picker emoji-picker--docked" role="menu" aria-label="Choose emoji">
            <EmojiPicker
              onEmojiClick={onEmojiPick}
              autoFocusSearch={false}
              lazyLoadEmojis
              previewConfig={{ showPreview: false }}
              searchDisabled
              skinTonesDisabled
              categoryIcons={EMOJI_CATEGORY_ICONS}
              theme={resolvedThemeMode === "light" ? Theme.LIGHT : Theme.DARK}
              width={320}
              height={380}
            />
          </div>
        </div>
      )}
    </form>
  );
}
