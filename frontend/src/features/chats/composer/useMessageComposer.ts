import {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject,
  SetStateAction,
  useCallback,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { EmojiClickData } from "emoji-picker-react";
import { Capacitor } from "@capacitor/core";
import type { Socket } from "socket.io-client";

import { Chat, Message, attachMessageFiles, editMessage } from "../../../api/chats";
import { uploadFile } from "../../../api/files";
import {
  applyFormattingToTextarea,
  measureTextareaSelectionAnchor
} from "../../../composerFormatting";
import type { FormattingKind, TextSelection, ToolbarAnchor } from "../../../composerFormatting";
import { AttachmentPickerOption, type AttachmentPickerTab } from "../../../components/AttachmentPickerSheet";
import type { NativeMediaItem } from "../../../native/mediaLibraryPlugin";
import { parseScheduleCommand } from "../../../plans/scheduleCommand";
import {
  formatMacroCommand,
  parseRemindCommand,
  parseSplitCommand,
  parseTodoCommand
} from "./slashCommandRegistry";
import { createGuestMeeting } from "../../../api/guestMeetings";
import { applyMessagePreviewToChat } from "../shared/chatPresentation";
import { markPendingMessageFailed } from "../shared/messageState";
import type { MessageStateUpdate, PendingLocalAttachment } from "../shared/types";
import {
  enqueueOutboxMessage,
  type ReminderRule
} from "../outbox/messageOutboxStore";
import { computeInitialReminderDate } from "../outbox/reminderSchedule";
import { drainOutboxQueue } from "../outbox/messageOutboxProcessor";
import { useMessageCooldown } from "./useMessageCooldown";
import { useComposerAttachments } from "./useComposerAttachments";
import { useVoiceMessageRecording } from "./useVoiceMessageRecording";
import { createQueuedComposerMessage } from "./createQueuedComposerMessage";
import { useComposerDraftPersistence } from "./useComposerDraftPersistence";
import { useComposerUiActions } from "./useComposerUiActions";
import { sendQueuedNotificationReply as sendQueuedReply } from "./sendQueuedNotificationReply";

export type UseMessageComposerParams = {
  chatId: string | undefined;
  accessToken: string | null;
  currentUser: { id: string; displayName: string } | null;
  selectedChat: Chat | null;
  sendOnEnter: boolean;
  channelCommentsDisabledForViewer: boolean;
  missingCommentThread: boolean;
  canPostInSelectedChannel: boolean;
  threadRootMessageId: string | null;
  replyTarget: Message | null;
  setReplyTarget: (message: Message | null) => void;
  editTargetMessage: Message | null;
  setEditTargetMessage: (message: Message | null) => void;
  setMessageContextMenu: (menu: null) => void;
  draftBeforeEditRef: RefObject<string>;
  editInFlightRef: RefObject<boolean>;
  applyMessagesForChat: (chatId: string, next: MessageStateUpdate) => void;
  onChatsUpdate: Dispatch<SetStateAction<Chat[]>>;
  onError: (message: string | null) => void;
  navigate: (path: string) => void;
  socketRef: RefObject<Socket | null>;
  composerInputRef: RefObject<HTMLTextAreaElement | null>;
  onComposerFocus?: () => void;
  chatsRef?: RefObject<Chat[]>;
  triggerDrain?: () => Promise<void>;
};

export function extractMentionedUserIds(
  members: Chat["members"] | undefined,
  currentUserId: string | undefined,
  content: string | null | undefined
): string[] {
  if (!members || members.length === 0 || !content) return [];
  const text = content.trim();
  if (!text) return [];

  return members
    .filter((member) => {
      const handles: string[] = [];
      if (member.username?.trim()) handles.push(member.username.trim());
      if (member.displayName?.trim()) handles.push(member.displayName.trim());
      if (handles.length === 0) return false;

      return handles.some((handle) => {
        const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(^|\\s)@${escaped}(?=\\s|$|[.,!?])`, "i");
        return regex.test(text);
      });
    })
    .map((member) => member.id);
}

const COMPOSER_MAX_LINES = 3;

export function useMessageComposer({
  chatId,
  accessToken,
  currentUser,
  selectedChat,
  sendOnEnter,
  channelCommentsDisabledForViewer,
  missingCommentThread,
  canPostInSelectedChannel,
  threadRootMessageId,
  replyTarget,
  setReplyTarget,
  editTargetMessage,
  setEditTargetMessage,
  setMessageContextMenu,
  draftBeforeEditRef,
  editInFlightRef,
  applyMessagesForChat,
  onChatsUpdate,
  onError,
  navigate,
  socketRef,
  composerInputRef,
  onComposerFocus,
  chatsRef,
  triggerDrain
}: UseMessageComposerParams) {
  const [composer, setComposer] = useState("");
  const [formattingToolbarAnchor, setFormattingToolbarAnchor] = useState<ToolbarAnchor | null>(null);
  const [composerIsMultiline, setComposerIsMultiline] = useState(false);
  const [composerLineCount, setComposerLineCount] = useState(1);
  const [composerEnlargeOpen, setComposerEnlargeOpen] = useState(false);
  const [isAttachmentSheetOpen, setIsAttachmentSheetOpen] = useState(false);
  const [attachmentSheetInitialTab, setAttachmentSheetInitialTab] = useState<AttachmentPickerTab>("gallery");
  const [galleryPreviewMediaItem, setGalleryPreviewMediaItem] = useState<NativeMediaItem | null>(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const { remaining: messageDelayRemaining, markSent } = useMessageCooldown(
    selectedChat?.id,
    selectedChat?.messageDelaySeconds
  );

  const composerFormattingSelectionRef = useRef<TextSelection | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerDockRef = useRef<HTMLDivElement | null>(null);
  const sendInFlightRef = useRef(false);
  const {
    pendingAttachments, setPendingAttachments, attachmentInputRef, galleryAttachmentInputRef,
    cameraAttachmentInputRef, audioAttachmentInputRef, documentAttachmentInputRef,
    handleFileSelect, addSharedFileAttachments, removePendingAttachment, updatePendingAttachment
  } = useComposerAttachments();
  const { handleComposerChange } = useComposerDraftPersistence({
    chatId, selectedChatId: selectedChat?.id, setComposer, socketRef
  });

  const getComposerHeightLimits = useCallback((textarea: HTMLTextAreaElement) => {
    const style = window.getComputedStyle(textarea);
    const fontSize = Number.parseFloat(style.fontSize) || 16;
    const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.4;
    const verticalChrome =
      Number.parseFloat(style.paddingTop) +
      Number.parseFloat(style.paddingBottom) +
      Number.parseFloat(style.borderTopWidth) +
      Number.parseFloat(style.borderBottomWidth);
    const minHeight = Number.parseFloat(style.minHeight) || lineHeight + verticalChrome;
    const maxHeight = lineHeight * COMPOSER_MAX_LINES + verticalChrome;
    return { minHeight, maxHeight, lineHeight, verticalChrome };
  }, []);

  const applyComposerActionInsets = useCallback((textarea: HTMLTextAreaElement, nextHeight: number, minHeight: number) => {
    const composerEl = textarea.closest(".message-composer") as HTMLElement | null;
    if (!composerEl) return;
    const growth = Math.max(0, nextHeight - minHeight);
    const inset = Math.min(6, Math.round(growth * 0.12));
    const bottom = Math.min(4, Math.round(growth * 0.08));
    composerEl.style.setProperty("--composer-action-inset", `${inset}px`);
    composerEl.style.setProperty("--composer-action-bottom", `${bottom}px`);
  }, []);

  const clearComposerActionInsets = useCallback((textarea: HTMLTextAreaElement | null) => {
    const composerEl = textarea?.closest(".message-composer") as HTMLElement | null;
    if (!composerEl) return;
    composerEl.style.setProperty("--composer-action-inset", "0px");
    composerEl.style.setProperty("--composer-action-bottom", "0px");
  }, []);

  const adjustComposerHeight = useCallback(() => {
    const textarea = composerInputRef.current;
    if (!textarea) return;
    const { minHeight, maxHeight, lineHeight, verticalChrome } = getComposerHeightLimits(textarea);
    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    const nextHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";

    const contentHeight = Math.max(0, scrollHeight - verticalChrome);
    const lineCountFromHeight = Math.max(1, Math.round(contentHeight / lineHeight));
    const newlineCount = composer.split("\n").length;
    const lineCount = Math.max(lineCountFromHeight, newlineCount);

    setComposerLineCount(lineCount);
    setComposerIsMultiline(lineCount > 1);
    applyComposerActionInsets(textarea, nextHeight, minHeight);
  }, [composer, applyComposerActionInsets, getComposerHeightLimits]);

  const resetComposerHeight = useCallback(() => {
    const textarea = composerInputRef.current;
    if (!textarea) return;
    const { minHeight } = getComposerHeightLimits(textarea);
    textarea.style.height = `${minHeight}px`;
    textarea.style.overflowY = "hidden";
    setComposerIsMultiline(false);
    setComposerLineCount(1);
    clearComposerActionInsets(textarea);
  }, [clearComposerActionInsets, getComposerHeightLimits]);

  useLayoutEffect(() => {
    adjustComposerHeight();
  }, [composer, composerEnlargeOpen, adjustComposerHeight]);

  function clearComposerFormattingSelection() {
    composerFormattingSelectionRef.current = null;
    setFormattingToolbarAnchor(null);
  }

  function updateComposerFormattingSelection() {
    const textarea = composerInputRef.current;
    if (!textarea) {
      clearComposerFormattingSelection();
      return;
    }
    const selection = { start: textarea.selectionStart, end: textarea.selectionEnd };
    if (selection.start === selection.end) {
      clearComposerFormattingSelection();
      return;
    }
    composerFormattingSelectionRef.current = selection;
    setFormattingToolbarAnchor(measureTextareaSelectionAnchor(textarea, selection));
  }

  function closeEmojiPicker() {
    setIsEmojiPickerOpen(false);
  }

  function openEmojiPicker() {
    setIsAttachmentSheetOpen(false);
    if (Capacitor.isNativePlatform()) {
      composerInputRef.current?.blur();
    }
    setIsEmojiPickerOpen(true);
  }

  function toggleEmojiPicker() {
    if (isEmojiPickerOpen) {
      closeEmojiPicker();
      return;
    }
    openEmojiPicker();
  }

  const { focusInput, handleAttachButtonClick, handleEditMessage, cancelEditMode } = useComposerUiActions({
    inputRef: composerInputRef,
    setAttachmentSheetOpen: setIsAttachmentSheetOpen, setAttachmentSheetInitialTab,
    closeEmojiPicker,
    setEditTargetMessage,
    setMessageContextMenu
  });

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape" && editTargetMessage !== null) {
      cancelEditMode();
      event.preventDefault();
      return;
    }
    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
      return;
    }
    const sendWithModifier = event.ctrlKey || event.metaKey;
    if (sendOnEnter) {
      if (event.shiftKey) {
        return;
      }
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
      return;
    }
    if (sendWithModifier) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function handleAttachmentSheetPick(option: AttachmentPickerOption) {
    if (option === "poll") {
      setAttachmentSheetInitialTab("poll");
      setIsAttachmentSheetOpen(true);
      return;
    }
    if (option === "checklist") {
      setAttachmentSheetInitialTab("checklist");
      setIsAttachmentSheetOpen(true);
      return;
    }
    setIsAttachmentSheetOpen(false);
    if (option === "gallery") {
      galleryAttachmentInputRef.current?.click();
      return;
    }
    if (option === "camera") {
      cameraAttachmentInputRef.current?.click();
      return;
    }
    if (option === "audio") {
      audioAttachmentInputRef.current?.click();
      return;
    }
    if (option === "file") {
      documentAttachmentInputRef.current?.click();
      return;
    }
  }

  function handleComposerCut() {
    const textarea = composerInputRef.current;
    const selection = composerFormattingSelectionRef.current;
    if (!textarea || !selection || selection.end <= selection.start) return;
    const selected = composer.slice(selection.start, selection.end);
    void navigator.clipboard?.writeText(selected).catch(() => undefined);
    const next = composer.slice(0, selection.start) + composer.slice(selection.end);
    handleComposerChange(next);
    requestAnimationFrame(() => {
      const current = composerInputRef.current;
      if (!current) return;
      current.focus();
      current.setSelectionRange(selection.start, selection.start);
      clearComposerFormattingSelection();
    });
  }

  function handleComposerCopy() {
    const selection = composerFormattingSelectionRef.current;
    if (!selection || selection.end <= selection.start) return;
    const selected = composer.slice(selection.start, selection.end);
    void navigator.clipboard?.writeText(selected).catch(() => undefined);
  }

  async function handleComposerPaste() {
    const textarea = composerInputRef.current;
    const selection = composerFormattingSelectionRef.current;
    if (!textarea) return;
    let pasted = "";
    try {
      pasted = await navigator.clipboard.readText();
    } catch {
      return;
    }
    if (!pasted) return;
    const start = selection?.start ?? textarea.selectionStart;
    const end = selection?.end ?? textarea.selectionEnd;
    const next = composer.slice(0, start) + pasted + composer.slice(end);
    const caret = start + pasted.length;
    handleComposerChange(next);
    requestAnimationFrame(() => {
      const current = composerInputRef.current;
      if (!current) return;
      current.focus();
      current.setSelectionRange(caret, caret);
      clearComposerFormattingSelection();
    });
  }

  function handleComposerFormat(kind: FormattingKind) {
    const textarea = composerInputRef.current;
    const selection = composerFormattingSelectionRef.current;
    if (
      !textarea ||
      !selection ||
      selection.start < 0 ||
      selection.end <= selection.start ||
      selection.end > composer.length ||
      textarea.value !== composer ||
      textarea.selectionStart !== selection.start ||
      textarea.selectionEnd !== selection.end
    ) {
      clearComposerFormattingSelection();
      return;
    }

    const edit = applyFormattingToTextarea(textarea, selection, kind, 4000);
    if (!edit.changed) return;

    handleComposerChange(edit.value);
    requestAnimationFrame(() => {
      const currentTextarea = composerInputRef.current;
      if (!currentTextarea || currentTextarea.value !== edit.value) {
        clearComposerFormattingSelection();
        return;
      }
      currentTextarea.focus();
      currentTextarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
      const nextSelection = { start: edit.selectionStart, end: edit.selectionEnd };
      composerFormattingSelectionRef.current = nextSelection;
      setFormattingToolbarAnchor(measureTextareaSelectionAnchor(currentTextarea, nextSelection));
    });
  }

  function insertEmoji(emoji: string) {
    const input = composerInputRef.current;
    const start = input?.selectionStart ?? composer.length;
    const end = input?.selectionEnd ?? composer.length;
    const nextValue = `${composer.slice(0, start)}${emoji}${composer.slice(end)}`.slice(0, 4000);
    clearComposerFormattingSelection();
    setComposer(nextValue);
    window.setTimeout(() => {
      const cursor = Math.min(start + emoji.length, nextValue.length);
      if (!Capacitor.isNativePlatform()) {
        composerInputRef.current?.focus();
        composerInputRef.current?.setSelectionRange(cursor, cursor);
      }
    }, 0);
  }

  function handleComposerEmojiPick(emojiData: EmojiClickData) {
    insertEmoji(emojiData.emoji);
  }

  function handleComposerFocus() {
    onComposerFocus?.();
    if (Capacitor.isNativePlatform() && isEmojiPickerOpen) {
      closeEmojiPicker();
    }
  }

  async function handleSendMessage(event?: { preventDefault?: () => void }, attachmentOverride?: PendingLocalAttachment[], contentOverride?: string) {
    event?.preventDefault?.();
    if (sendInFlightRef.current) return;
    let content = (contentOverride ?? composer).trim();
    const localAttachments = attachmentOverride ?? pendingAttachments;
    if (!accessToken || !currentUser || !selectedChat || (!content && localAttachments.length === 0)) {
      return;
    }

    // Text Macros & Formatting Transforms
    if (/^\/(?:shrug|tableflip|spoiler|silent|urgent|disappear)\b/i.test(content)) {
      const macroMatch = content.match(/^\/([a-zA-Z]+)(?:\s+([\s\S]*))?$/);
      if (macroMatch) {
        const cmd = macroMatch[1].toLowerCase();
        const args = macroMatch[2] || "";
        content = formatMacroCommand(cmd, args);
      }
    }

    // Expense / Split Command
    if (/^\/(?:split|expense)\b/i.test(content)) {
      const splitData = parseSplitCommand(content);
      if (splitData) {
        content = splitData.formattedMessage;
      }
    }

    if (content.toLowerCase() === "/poll") {
      setComposer("");
      resetComposerHeight();
      setAttachmentSheetInitialTab("poll");
      setIsAttachmentSheetOpen(true);
      return;
    }
    if (content.toLowerCase() === "/checklist") {
      setComposer("");
      resetComposerHeight();
      setAttachmentSheetInitialTab("checklist");
      setIsAttachmentSheetOpen(true);
      return;
    }
    const scheduleDraft = localAttachments.length === 0 ? parseScheduleCommand(content) : null;
    if (scheduleDraft) {
      window.sessionStorage.setItem(
        "stovo:plan-draft",
        JSON.stringify({
          title: scheduleDraft.title,
          durationMinutes: scheduleDraft.durationMinutes,
          sourceChatId: selectedChat.id
        })
      );
      setComposer("");
      resetComposerHeight();
      navigate("/app/plans");
      return;
    }

    if (/^\/remind\s+/i.test(content)) {
      const parsedRemind = parseRemindCommand(content);
      if (parsedRemind) {
        setComposer("");
        resetComposerHeight();
        void handleScheduleMessage(parsedRemind.scheduledDate, localAttachments, parsedRemind.text);
        return;
      }
    }

    if (/^\/(?:todo|task)\s+/i.test(content)) {
      const taskText = parseTodoCommand(content);
      if (taskText) {
        setComposer("");
        resetComposerHeight();
        setAttachmentSheetInitialTab("checklist");
        setIsAttachmentSheetOpen(true);
        return;
      }
    }

    if (content.toLowerCase() === "/location") {
      setComposer("");
      resetComposerHeight();
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude.toFixed(6);
            const lon = pos.coords.longitude.toFixed(6);
            const locMessage = `📍 Location: https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
            void handleSendMessage(undefined, localAttachments, locMessage);
          },
          (err) => {
            onError(err?.message || "Location permission denied or unavailable");
          }
        );
      } else {
        onError("Geolocation is not supported on this device");
      }
      return;
    }

    if (/^\/meet\b/i.test(content)) {
      const topicMatch = content.match(/^\/meet(?:\s+(.*))?$/i);
      const topic = topicMatch?.[1]?.trim() || "Guest Meeting";
      setComposer("");
      resetComposerHeight();
      try {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const meeting = await createGuestMeeting(accessToken, {
          chatId: selectedChat.id,
          title: topic,
          admissionMode: "immediate",
          expiresAt
        });
        const meetingMsg = `📹 **Join Guest Meeting: ${topic}**\n${meeting.meetingUrl}`;
        void handleSendMessage(undefined, localAttachments, meetingMsg);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Could not create guest meeting");
      }
      return;
    }
    if (channelCommentsDisabledForViewer) {
      onError("Comments are disabled for this channel");
      return;
    }
    if (missingCommentThread) {
      onError("Choose a post thread before commenting");
      return;
    }
    if (messageDelayRemaining > 0) {
      onError(`Please wait ${messageDelayRemaining}s before sending another message`);
      return;
    }

    const { optimisticMessage, outboxItem } = createQueuedComposerMessage({
      chat: selectedChat, user: currentUser, content, attachments: localAttachments,
      replyTarget, threadRootMessageId,
      mentionedUserIds: extractMentionedUserIds(selectedChat.members, currentUser.id, content)
    });

    try {
      sendInFlightRef.current = true;
      setIsSendingMessage(true);
      setIsUploading(localAttachments.length > 0);
      onError(null);

      // Clear composer state immediately and keep focus synchronously so mobile keyboard never dismisses
      clearComposerFormattingSelection();
      setComposer("");
      resetComposerHeight();
      setPendingAttachments([]);
      setReplyTarget(null);
      if (chatId) {
        window.localStorage.removeItem(`stovo:draft:${chatId}`);
      }
      socketRef.current?.emit("typing:stop", { chatId: selectedChat.id });
      composerInputRef.current?.focus({ preventScroll: true });

      // Optimistically display in conversation immediately
      applyMessagesForChat(selectedChat.id, (current) => [...current, optimisticMessage]);
      onChatsUpdate((current) =>
        current.map((chat) =>
          chat.id === selectedChat.id
            ? { ...applyMessagePreviewToChat(chat, optimisticMessage), unreadCount: 0 }
            : chat
        )
      );

      // Persist to local outbox queue
      await enqueueOutboxMessage(outboxItem);
      markSent(selectedChat.id);

      // Ensure focus remains persistent after async queuing
      composerInputRef.current?.focus({ preventScroll: true });

      // Trigger background outbox drain
      if (triggerDrain) {
        void triggerDrain();
      } else if (accessToken && currentUser) {
        void drainOutboxQueue({
          accessToken,
          currentUser: currentUser as any,
          chats: chatsRef?.current ?? [selectedChat],
          applyMessagesForChat,
          onChatsUpdate,
          onError: (err) => onError(err)
        });
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not queue message");
    } finally {
      sendInFlightRef.current = false;
      setIsSendingMessage(false);
      setIsUploading(false);
    }
  }

  async function handleScheduleMessage(
    scheduledDate: Date,
    attachmentOverride?: PendingLocalAttachment[],
    contentOverride?: string
  ) {
    if (sendInFlightRef.current) return;
    const content = (contentOverride ?? composer).trim();
    const localAttachments = attachmentOverride ?? pendingAttachments;
    if (!accessToken || !currentUser || !selectedChat || (!content && localAttachments.length === 0)) {
      return;
    }
    if (channelCommentsDisabledForViewer) {
      onError("Comments are disabled for this channel");
      return;
    }
    if (missingCommentThread) {
      onError("Choose a post thread before commenting");
      return;
    }
    if (messageDelayRemaining > 0) {
      onError(`Please wait ${messageDelayRemaining}s before sending another message`);
      return;
    }

    const scheduledFor = scheduledDate.toISOString();
    const { optimisticMessage, outboxItem } = createQueuedComposerMessage({
      chat: selectedChat, user: currentUser, content, attachments: localAttachments,
      replyTarget, threadRootMessageId, scheduledFor,
      mentionedUserIds: extractMentionedUserIds(selectedChat.members, currentUser.id, content)
    });

    try {
      // Clear composer state immediately
      clearComposerFormattingSelection();
      setComposer("");
      resetComposerHeight();
      composerInputRef.current?.focus({ preventScroll: true });
      setPendingAttachments([]);
      setReplyTarget(null);
      if (chatId) {
        window.localStorage.removeItem(`stovo:draft:${chatId}`);
      }
      socketRef.current?.emit("typing:stop", { chatId: selectedChat.id });

      await enqueueOutboxMessage(outboxItem);

      // Optimistically display in conversation
      applyMessagesForChat(selectedChat.id, (current) => [...current, optimisticMessage]);
      onChatsUpdate((current) =>
        current.map((chat) =>
          chat.id === selectedChat.id
            ? { ...applyMessagePreviewToChat(chat, optimisticMessage), unreadCount: 0 }
            : chat
        )
      );

      composerInputRef.current?.focus({ preventScroll: true });

      if (triggerDrain) {
        void triggerDrain();
      } else if (accessToken && currentUser) {
        // Scheduling can be used while the page controller is still mounting.
        // Normal sends already have this direct fallback; without it a due
        // scheduled message was persisted but never handed to the outbox.
        void drainOutboxQueue({
          accessToken,
          currentUser: currentUser as any,
          chats: chatsRef?.current ?? [selectedChat],
          applyMessagesForChat,
          onChatsUpdate,
          onError: (err) => onError(err)
        });
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not schedule message");
    }
  }

  async function handleSetReminder(
    rule: ReminderRule,
    attachmentOverride?: PendingLocalAttachment[],
    contentOverride?: string
  ) {
    if (sendInFlightRef.current) return;
    const content = (contentOverride ?? composer).trim();
    const localAttachments = attachmentOverride ?? pendingAttachments;
    if (!accessToken || !currentUser || !selectedChat || (!content && localAttachments.length === 0)) {
      return;
    }
    if (channelCommentsDisabledForViewer) {
      onError("Comments are disabled for this channel");
      return;
    }
    if (missingCommentThread) {
      onError("Choose a post thread before commenting");
      return;
    }
    if (messageDelayRemaining > 0) {
      onError(`Please wait ${messageDelayRemaining}s before sending another message`);
      return;
    }

    const initialDate = computeInitialReminderDate(rule, new Date());
    const scheduledFor = initialDate.toISOString();
    const { optimisticMessage, outboxItem } = createQueuedComposerMessage({
      chat: selectedChat, user: currentUser, content, attachments: localAttachments,
      replyTarget, threadRootMessageId, scheduledFor, reminderRule: rule,
      mentionedUserIds: extractMentionedUserIds(selectedChat.members, currentUser.id, content)
    });

    try {
      // Clear composer state immediately
      clearComposerFormattingSelection();
      setComposer("");
      resetComposerHeight();
      composerInputRef.current?.focus({ preventScroll: true });
      setPendingAttachments([]);
      setReplyTarget(null);
      if (chatId) {
        window.localStorage.removeItem(`stovo:draft:${chatId}`);
      }
      socketRef.current?.emit("typing:stop", { chatId: selectedChat.id });

      await enqueueOutboxMessage(outboxItem);

      // Optimistically display in conversation
      applyMessagesForChat(selectedChat.id, (current) => [...current, optimisticMessage]);
      onChatsUpdate((current) =>
        current.map((chat) =>
          chat.id === selectedChat.id
            ? { ...applyMessagePreviewToChat(chat, optimisticMessage), unreadCount: 0 }
            : chat
        )
      );

      composerInputRef.current?.focus({ preventScroll: true });

      if (triggerDrain) {
        void triggerDrain();
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not set reminder");
    }
  }

  const sendQueuedNotificationReply = (text: string) => sendQueuedReply({
    text, accessToken, currentUser, selectedChat, canPostInSelectedChannel,
    applyMessagesForChat, onChatsUpdate, onError
  });

  const {
    isVoiceRecording,
    cancelVoiceRecording,
    stopAndSendVoiceRecording,
    handleVoicePressStart,
    handleVoicePressEnd,
    handleVoicePressCancel
  } = useVoiceMessageRecording({
    disabled: channelCommentsDisabledForViewer || missingCommentThread || isUploading || isSendingMessage,
    cooldownSeconds: messageDelayRemaining,
    onError,
    onSend: (attachments) => handleSendMessage(undefined, attachments)
  });

  function resetForChatChange(nextChatId: string | undefined) {
    clearComposerFormattingSelection();
    setPendingAttachments([]);
    cancelVoiceRecording();
    closeEmojiPicker();
    const draft = nextChatId ? window.localStorage.getItem(`stovo:draft:${nextChatId}`) ?? "" : "";
    setComposer(draft);
  }

  const queueMessageToChat = useCallback(async (chat: Chat, content: string) => {
    if (!currentUser) return;
    const { optimisticMessage, outboxItem } = createQueuedComposerMessage({
      chat,
      user: currentUser,
      content,
      attachments: [],
      replyTarget: null,
      threadRootMessageId: null,
      mentionedUserIds: []
    });
    applyMessagesForChat(chat.id, (current) => [...current, optimisticMessage]);
    onChatsUpdate((current) => current.map((item) => item.id === chat.id
      ? applyMessagePreviewToChat(item, optimisticMessage)
      : item));
    try {
      await enqueueOutboxMessage(outboxItem);
      if (triggerDrain) void triggerDrain();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not queue message");
    }
  }, [currentUser, applyMessagesForChat, onChatsUpdate, triggerDrain, onError]);

  return {
    composer,
    setComposer,
    formattingToolbarAnchor,
    pendingAttachments,
    composerIsMultiline,
    composerLineCount,
    composerEnlargeOpen,
    setComposerEnlargeOpen,
    isAttachmentSheetOpen,
    setIsAttachmentSheetOpen,
    closeAttachmentSheet: () => setIsAttachmentSheetOpen(false),
    attachmentSheetInitialTab,
    galleryPreviewMediaItem,
    setGalleryPreviewMediaItem,
    closeGalleryPreview: () => setGalleryPreviewMediaItem(null),
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
    clearComposerFormattingSelection,
    updateComposerFormattingSelection,
    closeEmojiPicker,
    openEmojiPicker,
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
    insertEmoji,
    handleComposerEmojiPick,
    handleComposerFocus,
    focusInput,
    handleEditMessage,
    cancelEditMode,
    resetComposerHeight,
    handleSendMessage,
    queueMessageToChat,
    handleScheduleMessage,
    handleSetReminder,
    sendQueuedNotificationReply,
    cancelVoiceRecording,
    stopAndSendVoiceRecording,
    handleVoicePressStart,
    handleVoicePressEnd,
    handleVoicePressCancel,
    messageDelayRemaining,
    resetForChatChange
  };
}

export type ComposerApi = ReturnType<typeof useMessageComposer>;
