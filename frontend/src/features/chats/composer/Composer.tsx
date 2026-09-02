import {
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
  useMemo,
  useRef,
  useState
} from "react";
import { type EmojiClickData } from "emoji-picker-react";
import { BarChart2, Paperclip, Pencil } from "lucide-react";

import type { Chat } from "../../../api/chats";
import { AttachmentPickerOption } from "../../../components/AttachmentPickerSheet";
import type { NativeMediaItem } from "../../../native/mediaLibraryPlugin";
import { FormattingToolbar } from "../../../components/FormattingToolbar";
import { ImageEditorModal } from "../../../components/ImageEditorModal";
import { MessageEnlargeButton } from "../../../components/MessageEnlargeModal";
import { VoiceRecordButton } from "../../../components/VoiceRecordButton";
import type { FormattingKind, TextSelection, ToolbarAnchor } from "../../../composerFormatting";
import { isVoiceRecordingSupported } from "../../../voiceRecording";
import type { Message, PendingLocalAttachment } from "../shared/types";
import { createClientMessageId } from "../shared/messageState";
import { peekCachedObjectUrl, seedMediaBlobCache } from "../../../mediaBlobCache";
import type { ReminderRule } from "../outbox/messageOutboxStore";
import { AttachmentControls } from "./AttachmentControls";
import { ComposerAttachmentProvider } from "./ComposerAttachmentContext";
import { PendingAttachmentsStrip } from "./PendingAttachmentsStrip";
import { SendSubmenu } from "./SendSubmenu";
import { ScheduleMessageModal } from "./ScheduleMessageModal";
import { ReminderModal } from "./ReminderModal";
import { ComposerReplyBar } from "./ComposerReplyBar";
import { ComposerEmojiPicker, ComposerEmojiPickerDock } from "./ComposerEmojiPicker";
import { useStrings } from "../../../i18n/LanguageContext";
export { EMOJI_CATEGORY_ICONS } from "./emojiCategories";

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
  galleryPreviewMediaItem,
  onGalleryPreviewMediaItemChange,
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
  galleryPreviewMediaItem?: NativeMediaItem | null;
  onGalleryPreviewMediaItemChange?: (item: NativeMediaItem | null) => void;
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
  const strings = useStrings();
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

  const [cursorPos, setCursorPos] = useState<number>(composer.length);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [isMentionDismissed, setIsMentionDismissed] = useState(false);

  const isTextareaFocused = typeof document !== "undefined" && composerInputRef.current && document.activeElement === composerInputRef.current;
  const activeCursor = isTextareaFocused
    ? (composerInputRef.current?.selectionStart ?? cursorPos)
    : (cursorPos > 0 || composer.length === 0 ? cursorPos : composer.length);
  const textBeforeCursor = composer.slice(0, activeCursor);
  const mentionMatch = /(?:^|\s)@([a-zA-Z0-9_.-]*)$/.exec(textBeforeCursor);

  const mentionCandidates = useMemo(() => {
    if (!mentionMatch || isMentionDismissed || !selectedChat?.members?.length) {
      return [];
    }
    const query = mentionMatch[1].toLowerCase();
    const members = selectedChat.members.filter((member) => {
      if (!member.username && !member.displayName) return false;
      const username = (member.username ?? "").toLowerCase();
      const displayName = (member.displayName ?? "").toLowerCase();
      return username.includes(query) || displayName.includes(query);
    });

    members.sort((a, b) => {
      const aUser = (a.username ?? "").toLowerCase();
      const bUser = (b.username ?? "").toLowerCase();
      const aName = (a.displayName ?? "").toLowerCase();
      const bName = (b.displayName ?? "").toLowerCase();
      const aStarts = aUser.startsWith(query) || aName.startsWith(query);
      const bStarts = bUser.startsWith(query) || bName.startsWith(query);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return (a.displayName ?? a.username ?? "").localeCompare(b.displayName ?? b.username ?? "");
    });

    return members.slice(0, 8);
  }, [mentionMatch, isMentionDismissed, selectedChat]);

  const slashMatch = /(?:^|\s)\/([a-zA-Z0-9_]*)$/.exec(textBeforeCursor);
  const slashCandidates = useMemo(() => {
    if (!slashMatch || isMentionDismissed || mentionMatch) {
      return [];
    }
    const query = slashMatch[1].toLowerCase();
    const available = [
      { command: "poll", description: "Create an interactive poll", icon: <BarChart2 size={16} /> }
    ];
    return available.filter((cmd) => cmd.command.toLowerCase().includes(query));
  }, [slashMatch, isMentionDismissed, mentionMatch]);

  function triggerSlashCommand(cmd: string) {
    if (cmd === "poll") {
      onComposerChange("");
      setIsMentionDismissed(true);
      onAttachmentSheetPick("poll");
    }
  }

  function updateCursorPos() {
    const textarea = composerInputRef.current;
    if (textarea) {
      setCursorPos(textarea.selectionStart ?? textarea.value.length);
      setIsMentionDismissed(false);
    }
  }

  function insertMention(username: string) {
    const textarea = composerInputRef.current;
    const isFocused = typeof document !== "undefined" && textarea && document.activeElement === textarea;
    const currentCursor = isFocused
      ? (textarea?.selectionStart ?? cursorPos)
      : (cursorPos > 0 || composer.length === 0 ? cursorPos : composer.length);
    const textBefore = composer.slice(0, currentCursor);
    const textAfter = composer.slice(currentCursor);

    const match = /(?:^|\s)@([a-zA-Z0-9_.-]*)$/.exec(textBefore);
    if (!match) return;

    const replaceStart = textBefore.slice(0, match.index);
    const matchedToken = match[0];
    const replacedToken = matchedToken.replace(/@[a-zA-Z0-9_.-]*$/, `@${username} `);
    const prefix = replaceStart + replacedToken;
    const nextValue = prefix + textAfter;

    onComposerChange(nextValue);
    setIsMentionDismissed(true);
    setSelectedMentionIndex(0);

    const nextPos = prefix.length;
    setCursorPos(nextPos);
    requestAnimationFrame(() => {
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(nextPos, nextPos);
      }
    });
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (mentionCandidates.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedMentionIndex((prev) => (prev + 1) % mentionCandidates.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedMentionIndex((prev) => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          const selected = mentionCandidates[selectedMentionIndex] ?? mentionCandidates[0];
          if (selected) {
            insertMention(selected.username || selected.displayName);
          }
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setIsMentionDismissed(true);
        return;
      }
    }

    if (slashCandidates.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedMentionIndex((prev) => (prev + 1) % slashCandidates.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedMentionIndex((prev) => (prev - 1 + slashCandidates.length) % slashCandidates.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          const selected = slashCandidates[selectedMentionIndex] ?? slashCandidates[0];
          if (selected) {
            triggerSlashCommand(selected.command);
          }
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setIsMentionDismissed(true);
        return;
      }
    }

    onComposerKeyDown(event);
  }

  return (
    <>
      <form
        className={`message-composer${isDockedEmojiPicker ? " message-composer--emoji-docked" : ""}${showDockedEmojiPicker ? " message-composer--emoji-open" : ""}`}
        onSubmit={onSubmit}
      >
      <PendingAttachmentsStrip attachments={pendingAttachments} onRemove={onRemovePendingAttachment} onEdit={setEditingAttachment} />
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
        <p className="muted-copy">{strings.comments.disabledInChannel}</p>
      )}
      {replyTarget && !isInThreadMode && <ComposerReplyBar accessToken={accessToken} replyTarget={replyTarget} onCancel={onCancelReply} />}
      <div className={`message-composer-row${composerIsMultiline ? " message-composer-row--multiline" : ""}`}>
        <ComposerAttachmentProvider value={{
          disabled: isUploading || channelCommentsDisabledForViewer || missingCommentThread,
          isAttachmentSheetOpen,
          previewMediaItem: galleryPreviewMediaItem,
          onPreviewMediaItemChange: onGalleryPreviewMediaItemChange,
          attachmentInputRef,
          galleryAttachmentInputRef,
          cameraAttachmentInputRef,
          audioAttachmentInputRef,
          documentAttachmentInputRef,
          onAttachButtonClick,
          onFileSelect,
          onCloseSheet: onCloseAttachmentSheet,
          onPickOption: onAttachmentSheetPick,
          onSelectDirectFiles: (files) => {
            onAddSharedFileAttachments?.(files);
            requestAnimationFrame(() => composerInputRef.current?.focus());
          },
          onSendSelectedFiles: (files, message) => {
            const attachments = files.map((file) => {
              const localId = `local:${createClientMessageId()}`;
              try {
                seedMediaBlobCache(localId, file);
              } catch {
                // Non-fatal
              }
              const isImage = file.type.startsWith("image/");
              const isVideo = file.type.startsWith("video/");
              return { localId, file, previewUrl: isImage || isVideo ? peekCachedObjectUrl(localId) ?? URL.createObjectURL(file) : null };
            });
            return onSubmit({ preventDefault: () => undefined }, attachments, message);
          },
          composer,
          onComposerChange,
          resolvedThemeMode,
          onEnlargeComposer,
          isUploading,
          isSendingMessage
        }}>
          <AttachmentControls />
        </ComposerAttachmentProvider>
        <ComposerEmojiPicker
          open={isEmojiPickerOpen}
          showDocked={showDockedEmojiPicker}
          theme={resolvedThemeMode}
          disabled={channelCommentsDisabledForViewer || missingCommentThread}
          pickerRef={emojiPickerRef}
          dockRef={emojiPickerDockRef}
          onToggle={onToggleEmojiPicker}
          onEmojiPick={onEmojiPick}
        />
        <div className="message-composer-shell">
          <div className="message-composer-input-wrap">
            <textarea
              ref={composerInputRef}
              rows={1}
              maxLength={4000}
              placeholder={
                isInThreadMode
                  ? strings.comments.write
                  : selectedChat?.type === "channel"
                    ? channelCommentsDisabledForViewer
                      ? strings.comments.disabled
                      : missingCommentThread
                        ? strings.comments.chooseThread
                        : canPostInSelectedChannel
                          ? "Post an update"
                          : "Message"
                    : "Message"
              }
              value={composer}
              disabled={channelCommentsDisabledForViewer || missingCommentThread}
              onChange={(event) => {
                updateCursorPos();
                onComposerSelectionUpdate();
                onComposerChange(event.target.value);
              }}
              onFocus={() => {
                updateCursorPos();
                onComposerFocus?.();
              }}
              onKeyDown={handleKeyDown}
              onKeyUp={(event) => {
                updateCursorPos();
                onComposerSelectionUpdate();
              }}
              onPointerUp={(event) => {
                updateCursorPos();
                onComposerSelectionUpdate();
              }}
              onScroll={onComposerSelectionUpdate}
              onSelect={(event) => {
                updateCursorPos();
                onComposerSelectionUpdate();
              }}
              onContextMenu={(event) => {
                const textarea = event.currentTarget;
                if (textarea.selectionStart !== textarea.selectionEnd) {
                  event.preventDefault();
                  onComposerSelectionUpdate();
                }
                updateCursorPos();
              }}
            />
            {mentionCandidates.length > 0 && (
              <div className="composer-mention-menu" role="listbox" aria-label="Mention a member">
                {mentionCandidates.map((member, index) => {
                  const isSelected = index === selectedMentionIndex;
                  return (
                    <button
                      type="button"
                      key={member.id}
                      role="option"
                      aria-selected={isSelected}
                      className={isSelected ? "active" : ""}
                      onMouseEnter={() => setSelectedMentionIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insertMention(member.username || member.displayName)}
                    >
                      <strong>@{member.username || member.displayName}</strong>
                      <span>{member.displayName}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {slashCandidates.length > 0 && (
              <div className="composer-mention-menu composer-slash-menu" role="listbox" aria-label="Slash commands">
                {slashCandidates.map((item, index) => {
                  const isSelected = index === selectedMentionIndex;
                  return (
                    <button
                      type="button"
                      key={item.command}
                      role="option"
                      aria-selected={isSelected}
                      className={isSelected ? "active" : ""}
                      onMouseEnter={() => setSelectedMentionIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => triggerSlashCommand(item.command)}
                    >
                      <strong>/{item.command}</strong>
                      <span>{item.description}</span>
                    </button>
                  );
                })}
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
          {((!composer.trim() && pendingAttachments.length === 0 && !isSendingMessage && isVoiceRecordingSupported()) || isVoiceRecording) ? (
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
                className={`composer-send-button${isSendingMessage ? " is-sending" : ""}`}
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
                onMouseDown={(event) => {
                  // Prevent default focus steal so mobile virtual keyboard doesn't dismiss and reopen
                  event.preventDefault();
                }}
                onPointerDown={(event) => {
                  if (event.button === 0 && composerInputRef.current) {
                    composerInputRef.current.focus({ preventScroll: true });
                  }
                  handleSendPointerDown(event);
                }}
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
      </form>
      <ComposerEmojiPickerDock show={showDockedEmojiPicker} theme={resolvedThemeMode} dockRef={emojiPickerDockRef} onEmojiPick={onEmojiPick} />
      {isScheduleModalOpen && (
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
      )}
      {isReminderModalOpen && (
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
      )}
    </>
  );
}
