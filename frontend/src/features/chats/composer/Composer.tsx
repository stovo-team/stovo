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
import { BarChart2, CalendarClock, CheckSquare, HelpCircle, Paperclip, Pencil, StickyNote } from "lucide-react";

import type { Chat } from "../../../api/chats";
import type { CreatePollPayload } from "../../../api/polls";
import { AttachmentPickerOption, type AttachmentPickerTab } from "../../../components/AttachmentPickerSheet";
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
import { ALL_SLASH_COMMANDS } from "./slashCommandRegistry";
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
  onStartAudioCall,
  onStartVideoCall,
  onTogglePinned,
  onToggleMuted,
  onPinMessage,
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
  attachmentSheetInitialTab,
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
  allMembers,
  currentUser,
  onSubmit,
  onScheduleMessage,
  onSetReminder,
  onCreatePoll,
  onCreateCanvas,
  onCreateChecklist
}: {
  accessToken: string | null;
  selectedChat: Chat | null;
  allMembers?: Array<{ id: string; displayName: string; username?: string }>;
  currentUser?: { id: string; displayName: string; username?: string } | null;
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
  attachmentSheetInitialTab?: AttachmentPickerTab;
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
  onStartAudioCall?: () => void;
  onStartVideoCall?: () => void;
  onTogglePinned?: () => void;
  onToggleMuted?: () => void;
  onPinMessage?: (message: Message) => void;
  onScheduleMessage?: (scheduledDate: Date) => void | Promise<void>;
  onSetReminder?: (rule: ReminderRule) => void | Promise<void>;
  onCreatePoll?: (payload: CreatePollPayload) => void | Promise<void>;
  onCreateCanvas?: () => void;
  onCreateChecklist?: (payload: {
    title: string;
    category: "grocery" | "errand" | "general";
    items: { text: string; section?: string }[];
  }) => void | Promise<void>;
}) {
  const strings = useStrings();
  const [editingAttachment, setEditingAttachment] = useState<PendingLocalAttachment | null>(null);
  const [isSendSubmenuOpen, setIsSendSubmenuOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const sendPressTimerRef = useRef<number | null>(null);
  const sendPressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = useRef(false);

  const messageDelayLabel = formatMessageDelay(messageDelayRemaining);

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
  const mentionMatch = /(?:^|[\s([{'"<>])@([\p{L}\p{N}_.-]*)$/u.exec(textBeforeCursor);

  const mentionCandidates = useMemo(() => {
    if (!mentionMatch || isMentionDismissed) {
      return [];
    }
    const query = mentionMatch[1].toLowerCase();

    const memberMap = new Map<string, { id: string; displayName: string; username?: string }>();
    if (selectedChat?.members) {
      for (const m of selectedChat.members) {
        if (m && m.id) memberMap.set(m.id, m);
      }
    }
    if (allMembers) {
      for (const m of allMembers) {
        if (m && m.id && !memberMap.has(m.id)) {
          memberMap.set(m.id, m);
        }
      }
    }
    if (currentUser && currentUser.id && !memberMap.has(currentUser.id)) {
      memberMap.set(currentUser.id, currentUser);
    }

    const members = Array.from(memberMap.values()).filter((member) => {
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
  }, [mentionMatch, isMentionDismissed, selectedChat, allMembers, currentUser]);

  const slashMatch = /(?:^|\s)\/([a-zA-Z0-9_.-]*)$/u.exec(textBeforeCursor);
  const slashQuery = slashMatch ? slashMatch[1].toLowerCase() : "";
  const isSlashActive = Boolean(slashMatch && !isMentionDismissed && !mentionMatch);

  const slashCandidates = useMemo(() => {
    if (!isSlashActive) return [];
    return ALL_SLASH_COMMANDS.filter(
      (cmd) => cmd.command.toLowerCase().includes(slashQuery) || cmd.syntax.toLowerCase().includes(slashQuery)
    );
  }, [isSlashActive, slashQuery]);

  function triggerSlashCommand(cmd: string) {
    if (cmd === "poll") {
      onComposerChange("");
      setIsMentionDismissed(true);
      onAttachmentSheetPick("poll");
    } else if (cmd === "checklist") {
      onComposerChange("");
      setIsMentionDismissed(true);
      onAttachmentSheetPick("checklist");
    } else if (cmd === "canvas") {
      onComposerChange("");
      setIsMentionDismissed(true);
      onCreateCanvas?.();
    } else if (cmd === "schedule") {
      const template = "/schedule Meeting | Tomorrow 15:00 | 2h";
      onComposerChange(template);
      setIsMentionDismissed(true);
      requestAnimationFrame(() => {
        const textarea = composerInputRef.current;
        if (textarea) {
          textarea.focus();
          const start = "/schedule ".length;
          const end = start + "Meeting".length;
          textarea.setSelectionRange(start, end);
        }
      });
    } else if (cmd === "remind") {
      const template = "/remind in 2h Check oven";
      onComposerChange(template);
      setIsMentionDismissed(true);
      requestAnimationFrame(() => {
        const textarea = composerInputRef.current;
        if (textarea) {
          textarea.focus();
          const start = "/remind in 2h ".length;
          const end = start + "Check oven".length;
          textarea.setSelectionRange(start, end);
        }
      });
    } else if (cmd === "todo") {
      const template = "/todo Buy almond milk";
      onComposerChange(template);
      setIsMentionDismissed(true);
      requestAnimationFrame(() => {
        const textarea = composerInputRef.current;
        if (textarea) {
          textarea.focus();
          const start = "/todo ".length;
          const end = start + "Buy almond milk".length;
          textarea.setSelectionRange(start, end);
        }
      });
    } else if (cmd === "split") {
      const template = "/split $50 Groceries";
      onComposerChange(template);
      setIsMentionDismissed(true);
      requestAnimationFrame(() => {
        const textarea = composerInputRef.current;
        if (textarea) {
          textarea.focus();
          const start = "/split ".length;
          const end = start + "$50 Groceries".length;
          textarea.setSelectionRange(start, end);
        }
      });
    } else if (cmd === "location") {
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        onComposerChange("📍 Getting location...");
        setIsMentionDismissed(true);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude.toFixed(6);
            const lon = pos.coords.longitude.toFixed(6);
            onComposerChange(`📍 Location: https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`);
          },
          () => {
            onComposerChange("📍 Location permission denied or unavailable");
          }
        );
      } else {
        onComposerChange("📍 Geolocation not supported");
        setIsMentionDismissed(true);
      }
    } else if (cmd === "call") {
      onComposerChange("");
      setIsMentionDismissed(true);
      onStartAudioCall?.();
    } else if (cmd === "meet") {
      const template = "/meet Family Meeting";
      onComposerChange(template);
      setIsMentionDismissed(true);
      requestAnimationFrame(() => {
        const textarea = composerInputRef.current;
        if (textarea) {
          textarea.focus();
          const start = "/meet ".length;
          const end = start + "Family Meeting".length;
          textarea.setSelectionRange(start, end);
        }
      });
    } else if (cmd === "silent") {
      const template = "/silent Sleep well!";
      onComposerChange(template);
      setIsMentionDismissed(true);
      requestAnimationFrame(() => {
        const textarea = composerInputRef.current;
        if (textarea) {
          textarea.focus();
          const start = "/silent ".length;
          const end = start + "Sleep well!".length;
          textarea.setSelectionRange(start, end);
        }
      });
    } else if (cmd === "urgent") {
      const template = "/urgent Call me ASAP";
      onComposerChange(template);
      setIsMentionDismissed(true);
      requestAnimationFrame(() => {
        const textarea = composerInputRef.current;
        if (textarea) {
          textarea.focus();
          const start = "/urgent ".length;
          const end = start + "Call me ASAP".length;
          textarea.setSelectionRange(start, end);
        }
      });
    } else if (cmd === "spoiler") {
      const template = "/spoiler Secret here";
      onComposerChange(template);
      setIsMentionDismissed(true);
      requestAnimationFrame(() => {
        const textarea = composerInputRef.current;
        if (textarea) {
          textarea.focus();
          const start = "/spoiler ".length;
          const end = start + "Secret here".length;
          textarea.setSelectionRange(start, end);
        }
      });
    } else if (cmd === "disappear") {
      const template = "/disappear 24h";
      onComposerChange(template);
      setIsMentionDismissed(true);
      requestAnimationFrame(() => {
        const textarea = composerInputRef.current;
        if (textarea) {
          textarea.focus();
          const start = "/disappear ".length;
          const end = start + "24h".length;
          textarea.setSelectionRange(start, end);
        }
      });
    } else if (cmd === "pin") {
      onComposerChange("");
      setIsMentionDismissed(true);
      if (replyTarget && onPinMessage) {
        onPinMessage(replyTarget);
      } else {
        onTogglePinned?.();
      }
    } else if (cmd === "mute") {
      onComposerChange("");
      setIsMentionDismissed(true);
      onToggleMuted?.();
    } else if (cmd === "shrug") {
      const prefix = composer.trim() ? `${composer.trim()} ` : "";
      onComposerChange(`${prefix}¯\\_(ツ)_/¯`);
      setIsMentionDismissed(true);
    } else if (cmd === "tableflip") {
      const prefix = composer.trim() ? `${composer.trim()} ` : "";
      onComposerChange(`${prefix}(╯°□°)╯︵ ┻━┻`);
      setIsMentionDismissed(true);
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

    const match = /(?:^|[\s([{'"<>])@([\p{L}\p{N}_.-]*)$/u.exec(textBefore);
    if (!match) return;

    const replaceStart = textBefore.slice(0, match.index);
    const matchedToken = match[0];
    const replacedToken = matchedToken.replace(/@[\p{L}\p{N}_.-]*$/u, `@${username} `);
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

    if (isSlashActive) {
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
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setIsMentionDismissed(true);
        return;
      }
    }

    onComposerKeyDown(event);
  }

  function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = composer.trim();
    const lower = trimmed.toLowerCase();
    if (lower === "/remind") {
      onComposerChange("");
      setIsReminderModalOpen(true);
      return;
    }
    if (lower === "/call" || lower === "/call audio") {
      onComposerChange("");
      onStartAudioCall?.();
      return;
    }
    if (lower === "/call video") {
      onComposerChange("");
      onStartVideoCall?.();
      return;
    }
    if (lower === "/pin") {
      onComposerChange("");
      if (replyTarget && onPinMessage) {
        onPinMessage(replyTarget);
      } else {
        onTogglePinned?.();
      }
      return;
    }
    if (lower === "/mute") {
      onComposerChange("");
      onToggleMuted?.();
      return;
    }
    void onSubmit(event);
  }

  return (
    <>
      <form
        className={`message-composer${isDockedEmojiPicker ? " message-composer--emoji-docked" : ""}${showDockedEmojiPicker ? " message-composer--emoji-open" : ""}`}
        onSubmit={handleFormSubmit}
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
          attachmentSheetInitialTab,
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
          isSendingMessage,
          onCreatePoll,
          onCreateCanvas,
          onCreateChecklist
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
            {isSlashActive && (
              <div className="composer-mention-menu composer-slash-menu" role="listbox" aria-label="Slash commands">
                {slashCandidates.length > 0 ? (
                  <>
                    <div className="slash-menu-header">
                      <span>Available Commands</span>
                      <small>Press Enter or click to use</small>
                    </div>
                    {slashCandidates.map((item, index) => {
                      const isSelected = index === selectedMentionIndex;
                      return (
                        <button
                          type="button"
                          key={item.command}
                          role="option"
                          aria-selected={isSelected}
                          className={`slash-command-item ${isSelected ? "active" : ""}`}
                          onMouseEnter={() => setSelectedMentionIndex(index)}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => triggerSlashCommand(item.command)}
                        >
                          <div className="slash-item-left">
                            <span className="slash-item-icon">{item.icon}</span>
                            <div className="slash-item-copy">
                              <strong className="slash-item-syntax">{item.syntax}</strong>
                              <span className="slash-item-desc">{item.description}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <div className="slash-menu-unrecognized">
                    <div className="slash-unrecognized-header">
                      <HelpCircle size={16} />
                      <span>Unrecognized command "/{slashQuery}"</span>
                    </div>
                    <div className="slash-unrecognized-body">
                      <span>Available commands:</span>
                      <div className="slash-unrecognized-actions">
                        {ALL_SLASH_COMMANDS.map((cmd) => (
                          <button
                            key={cmd.command}
                            type="button"
                            className="slash-unrecognized-chip"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => triggerSlashCommand(cmd.command)}
                          >
                            <span className="slash-chip-icon">{cmd.icon}</span>
                            <strong>/{cmd.command}</strong>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
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
          {messageDelayRemaining > 0 && (
            <span
              className="composer-delay-counter"
              role="timer"
              aria-label={`You can send another message in ${messageDelayLabel}`}
            >
              {messageDelayLabel}
            </span>
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
                <span className="ms-icon ms-icon--20" aria-hidden={true}>
                  send
                </span>
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

export function formatMessageDelay(seconds: number) {
  const remainingSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(remainingSeconds / 60);
  const secondsPart = remainingSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${secondsPart.toString().padStart(2, "0")}`;
}
