import {
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
  useRef,
  useState
} from "react";
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
import { createClientMessageId } from "../shared/messageState";
import type { ReminderRule } from "../outbox/messageOutboxStore";
import { ComposerContextThumb } from "../conversation/MessageAttachmentThumbs";
import { AttachmentControls } from "./AttachmentControls";
import { PendingAttachmentCard } from "./PendingAttachmentCard";
import { SendSubmenu } from "./SendSubmenu";
import { ScheduleMessageModal } from "./ScheduleMessageModal";
import { ReminderModal } from "./ReminderModal";

export const EMOJI_CATEGORY_ICONS: Partial<Record<Categories, ReactNode>> = {
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
  messageDelayRemaining = 0,
  onVoicePressStart,
  onVoicePressEnd,
  onVoicePressCancel,
  onSubmit,
  onScheduleMessage,
  onSetReminder
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
  onComposerFocus?: () => void;
  onComposerSelectionUpdate: () => void;
  onComposerFormat: (kind: FormattingKind) => void;
  onComposerCut: () => void;
  onComposerCopy: () => void;
  onComposerPaste: (text?: string) => void;
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
  messageDelayRemaining?: number;
  onVoicePressStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onVoicePressEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onVoicePressCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onSubmit: (event: { preventDefault: () => void }, attachmentOverride?: PendingLocalAttachment[], contentOverride?: string) => void | Promise<void>;
  onScheduleMessage?: (scheduledDate: Date) => void | Promise<void>;
  onSetReminder?: (rule: ReminderRule) => void | Promise<void>;
}) {
  const [editingAttachment, setEditingAttachment] = useState<PendingLocalAttachment | null>(null);
  const [isSendSubmenuOpen, setIsSendSubmenuOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const sendPressTimerRef = useRef<number | null>(null);
  const sendPressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = useRef(false);

  function handleSendPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    longPressTriggeredRef.current = false;
    sendPressStartPosRef.current = { x: event.clientX, y: event.clientY };
    if (sendPressTimerRef.current) {
      window.clearTimeout(sendPressTimerRef.current);
    }
    sendPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setIsSendSubmenuOpen(true);
    }, 450);
  }

  function handleSendPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!sendPressStartPosRef.current) return;
    const dx = Math.abs(event.clientX - sendPressStartPosRef.current.x);
    const dy = Math.abs(event.clientY - sendPressStartPosRef.current.y);
    if (dx > 10 || dy > 10) {
      if (sendPressTimerRef.current) {
        window.clearTimeout(sendPressTimerRef.current);
        sendPressTimerRef.current = null;
      }
      sendPressStartPosRef.current = null;
    }
  }

  function handleSendPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (sendPressTimerRef.current) {
      window.clearTimeout(sendPressTimerRef.current);
      sendPressTimerRef.current = null;
    }
    sendPressStartPosRef.current = null;
    if (longPressTriggeredRef.current) {
      event.preventDefault();
      event.stopPropagation();
      longPressTriggeredRef.current = false;
      return;
    }
  }

  function handleSendPointerCancel() {
    if (sendPressTimerRef.current) {
      window.clearTimeout(sendPressTimerRef.current);
      sendPressTimerRef.current = null;
    }
    sendPressStartPosRef.current = null;
    longPressTriggeredRef.current = false;
  }

  function handleSendContextMenu(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (sendPressTimerRef.current) {
      window.clearTimeout(sendPressTimerRef.current);
      sendPressTimerRef.current = null;
    }
    longPressTriggeredRef.current = false;
    setIsSendSubmenuOpen(true);
  }
  const mentionMatch = /(?:^|\s)@([\w-]*)$/.exec(composer);
  const mentionCandidates = mentionMatch && selectedChat
    ? selectedChat.members.filter((member) => member.username.toLowerCase().startsWith(mentionMatch[1].toLowerCase())).slice(0, 6)
    : [];

  function insertMention(username: string) {
    if (!mentionMatch) return;
    onComposerChange(composer.slice(0, mentionMatch.index) + mentionMatch[0].replace(/@[\w-]*$/, `@${username} `));
  }

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
          onSelectDirectFiles={(files) => {
            onAddSharedFileAttachments?.(files);
            // The picker only stages attachments. Focus the ordinary composer
            // once it closes so the next action is writing the message/caption.
            requestAnimationFrame(() => composerInputRef.current?.focus());
          }}
          onSendSelectedFiles={(files, message) => {
            const attachments = files.map((file) => ({
              localId: `local:${createClientMessageId()}`,
              file,
              previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null
            }));
            return onSubmit({ preventDefault: () => undefined }, attachments, message);
          }}
          composer={composer}
          onComposerChange={onComposerChange}
          resolvedThemeMode={resolvedThemeMode}
          onEnlargeComposer={onEnlargeComposer}
          isUploading={isUploading}
          isSendingMessage={isSendingMessage}
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
                width={360}
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
                isInThreadMode
                  ? "Write a comment…"
                  : selectedChat?.type === "channel"
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
            {mentionCandidates.length > 0 && (
              <div className="composer-mention-menu" role="listbox" aria-label="Mention a member">
                {mentionCandidates.map((member) => (
                  <button type="button" key={member.id} role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => insertMention(member.username)}>
                    <strong>@{member.username}</strong><span>{member.displayName}</span>
                  </button>
                ))}
              </div>
            )}
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
              disabled={isUploading || isSendingMessage || channelCommentsDisabledForViewer || missingCommentThread || messageDelayRemaining > 0}
              onPressStart={(event) => onVoicePressStart(event)}
              onPressEnd={(event) => onVoicePressEnd(event)}
              onPressCancel={onVoicePressCancel}
            />
          ) : (
            <div className="send-button-shell">
              <button
                type="submit"
                aria-label={messageDelayRemaining > 0 ? `Message delay: ${messageDelayRemaining}s` : "Send message"}
                aria-busy={isUploading || isSendingMessage}
                disabled={
                  isUploading ||
                  isSendingMessage ||
                  channelCommentsDisabledForViewer ||
                  missingCommentThread ||
                  messageDelayRemaining > 0 ||
                  (!composer.trim() && pendingAttachments.length === 0)
                }
                onPointerDown={handleSendPointerDown}
                onPointerMove={handleSendPointerMove}
                onPointerUp={handleSendPointerUp}
                onPointerCancel={handleSendPointerCancel}
                onContextMenu={handleSendContextMenu}
              >
                {messageDelayRemaining > 0 ? (
                  <span className="composer-delay-counter" aria-hidden={true}>
                    {messageDelayRemaining}s
                  </span>
                ) : (
                  <span className="ms-icon ms-icon--20" aria-hidden={true}>
                    send
                  </span>
                )}
                {(isUploading || isSendingMessage) && (
                  <span className="visually-hidden">{isUploading ? "Uploading" : "Sending"}</span>
                )}
              </button>
              <SendSubmenu
                isOpen={isSendSubmenuOpen}
                onClose={() => setIsSendSubmenuOpen(false)}
                onSelectSchedule={() => setIsScheduleModalOpen(true)}
                onSelectReminder={() => setIsReminderModalOpen(true)}
              />
            </div>
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
              width="100%"
              height={380}
            />
          </div>
        </div>
      )}
      <ScheduleMessageModal
        isOpen={isScheduleModalOpen}
        messageText={composer}
        attachments={pendingAttachments}
        onClose={() => setIsScheduleModalOpen(false)}
        onConfirmSchedule={(scheduledDate) => {
          setIsScheduleModalOpen(false);
          void onScheduleMessage?.(scheduledDate);
        }}
      />
      <ReminderModal
        isOpen={isReminderModalOpen}
        messageText={composer}
        attachments={pendingAttachments}
        onClose={() => setIsReminderModalOpen(false)}
        onConfirmReminder={(rule) => {
          setIsReminderModalOpen(false);
          void onSetReminder?.(rule);
        }}
      />
    </form>
  );
}
