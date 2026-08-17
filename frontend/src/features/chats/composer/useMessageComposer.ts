import {
  ChangeEvent,
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
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

import { Chat, Message, attachMessageFiles, editMessage, sendMessage } from "../../../api/chats";
import { ApiError } from "../../../api/client";
import { decryptMessage } from "../../../api/messageCrypto";
import { encryptMessageContent } from "../../../api/messageCrypto";
import { type FamilyFile, uploadFile } from "../../../api/files";
import {
  applyFormattingToTextarea,
  measureTextareaSelectionAnchor
} from "../../../composerFormatting";
import type { FormattingKind, TextSelection, ToolbarAnchor } from "../../../composerFormatting";
import { AttachmentPickerOption } from "../../../components/AttachmentPickerSheet";
import { parseScheduleCommand } from "../../../plans/scheduleCommand";
import { isVoiceRecordingSupported, startVoiceRecording, type VoiceRecorderHandle } from "../../../voiceRecording";
import { applyMessagePreviewToChat } from "../shared/chatPresentation";
import {
  createClientMessageId,
  inferOptimisticMessageType,
  markPendingMessageFailed,
  mergeIncomingMessage,
} from "../shared/messageState";
import type { MessageStateUpdate, PendingLocalAttachment } from "../shared/types";
import {
  enqueueOutboxMessage,
  type QueuedOutboxAttachment,
  type QueuedOutboxMessage
} from "../outbox/messageOutboxStore";
import { drainOutboxQueue } from "../outbox/messageOutboxProcessor";

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
  const [pendingAttachments, setPendingAttachments] = useState<PendingLocalAttachment[]>([]);
  const [composerIsMultiline, setComposerIsMultiline] = useState(false);
  const [composerLineCount, setComposerLineCount] = useState(1);
  const [composerEnlargeOpen, setComposerEnlargeOpen] = useState(false);
  const [isAttachmentSheetOpen, setIsAttachmentSheetOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  const composerFormattingSelectionRef = useRef<TextSelection | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const galleryAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const cameraAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const audioAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const documentAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const voiceRecorderRef = useRef<VoiceRecorderHandle | null>(null);
  const voiceRecordingPointerIdRef = useRef<number | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerDockRef = useRef<HTMLDivElement | null>(null);
  const typingStopTimerRef = useRef<number | null>(null);
  const sendInFlightRef = useRef(false);

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

  function handleComposerChange(value: string) {
    setComposer(value);
    if (chatId) {
      if (value) {
        window.localStorage.setItem(`stovo:draft:${chatId}`, value);
      } else {
        window.localStorage.removeItem(`stovo:draft:${chatId}`);
      }
    }
    if (selectedChat && value.trim()) {
      socketRef.current?.emit("typing:start", { chatId: selectedChat.id });
      if (typingStopTimerRef.current) {
        window.clearTimeout(typingStopTimerRef.current);
      }
      typingStopTimerRef.current = window.setTimeout(() => {
        socketRef.current?.emit("typing:stop", { chatId: selectedChat.id });
      }, 1400);
    }
  }

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

  function handleAttachButtonClick() {
    closeEmojiPicker();
    setIsAttachmentSheetOpen(true);
  }

  function handleAttachmentSheetPick(option: AttachmentPickerOption) {
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
    documentAttachmentInputRef.current?.click();
  }

  function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selectedFiles.length === 0) return;

    const next: PendingLocalAttachment[] = selectedFiles.map((file) => {
      const isImage = file.type.startsWith("image/");
      return {
        localId: `local:${createClientMessageId()}`,
        file,
        previewUrl: isImage ? URL.createObjectURL(file) : null
      };
    });
    setPendingAttachments((current) => [...current, ...next]);

    const videoPending = next.filter((item) => item.file.type.startsWith("video/"));
    if (videoPending.length === 0) return;
    const schedule =
      typeof window.requestIdleCallback === "function"
        ? (cb: () => void) => window.requestIdleCallback(() => cb())
        : (cb: () => void) => window.setTimeout(cb, 0);
    schedule(() => {
      setPendingAttachments((current) =>
        current.map((item) => {
          if (!videoPending.some((pending) => pending.localId === item.localId)) return item;
          if (item.previewUrl) return item;
          return { ...item, previewUrl: URL.createObjectURL(item.file) };
        })
      );
    });
  }

  function addSharedFileAttachments(files: File[]) {
    if (files.length === 0) return;
    const next: PendingLocalAttachment[] = files.map((file) => ({
      localId: `local:${createClientMessageId()}`,
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null
    }));
    setPendingAttachments((current) => [...current, ...next]);
  }

  function removePendingAttachment(localId: string) {
    setPendingAttachments((current) => {
      const removed = current.find((item) => item.localId === localId);
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return current.filter((item) => item.localId !== localId);
    });
  }

  function updatePendingAttachment(localId: string, updatedFile: File) {
    setPendingAttachments((current) =>
      current.map((item) => {
        if (item.localId !== localId) return item;
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
        return {
          ...item,
          file: updatedFile,
          previewUrl: URL.createObjectURL(updatedFile)
        };
      })
    );
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

  function focusInput() {
    window.setTimeout(() => composerInputRef.current?.focus(), 0);
  }

  function handleEditMessage(message: Message) {
    setEditTargetMessage(message);
    setMessageContextMenu(null);
  }

  function cancelEditMode() {
    setEditTargetMessage(null);
  }

  async function handleSendMessage(event?: { preventDefault?: () => void }, attachmentOverride?: PendingLocalAttachment[], contentOverride?: string) {
    event?.preventDefault?.();
    if (sendInFlightRef.current) return;
    const content = (contentOverride ?? composer).trim();
    const localAttachments = attachmentOverride ?? pendingAttachments;
    if (!accessToken || !currentUser || !selectedChat || (!content && localAttachments.length === 0)) {
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
    if (channelCommentsDisabledForViewer) {
      onError("Comments are disabled for this channel");
      return;
    }
    if (missingCommentThread) {
      onError("Choose a post thread before commenting");
      return;
    }

    const clientMessageId = createClientMessageId();
    const createdAt = new Date().toISOString();
    const isChannelThreadMessage = selectedChat.type === "channel" && Boolean(threadRootMessageId);
    const threadRootForSend = isChannelThreadMessage ? threadRootMessageId : null;
    const replyToMessageId = isChannelThreadMessage ? null : replyTarget?.id ?? null;
    const draftContent = content;

    const outboxAttachments: QueuedOutboxAttachment[] = localAttachments.map((pending) => ({
      id: pending.localId,
      name: pending.file.name,
      mimeType: pending.file.type,
      size: pending.file.size,
      blob: pending.file
    }));

    const previewAttachments: FamilyFile[] = localAttachments.map((pending) => ({
      id: pending.localId,
      familyId: "",
      uploadedBy: currentUser.id,
      chatId: selectedChat.id,
      chatTitle: selectedChat.title ?? null,
      chatType: (selectedChat.type === "archive" ? null : selectedChat.type) as "family" | "direct" | "group" | "channel" | null,
      originMessageId: null,
      accessScope: "chat" as const,
      storageProvider: "local",
      originalName: pending.file.name,
      mimeType: pending.file.type,
      sizeBytes: pending.file.size,
      checksum: null,
      createdAt,
      deletedAt: null,
      isFavorite: false
    }));

    const mentionedUserIds = selectedChat.members
      .filter((member) => member.id !== currentUser.id && new RegExp(`(^|\\s)@${member.username.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}(?=\\s|$|[.,!?])`, "i").test(draftContent))
      .map((member) => member.id);

    const optimisticMessage: Message = {
      id: `pending:${clientMessageId}`,
      chatId: selectedChat.id,
      senderId: currentUser.id,
      senderDisplayName: currentUser.displayName,
      type: inferOptimisticMessageType(previewAttachments, draftContent || null),
      content: draftContent || null,
      encryptionProtocol: selectedChat.encryptionProtocol,
      ciphertext: null,
      nonce: null,
      keyVersion: null,
      encryptionMetadata: null,
      replyToMessageId,
      threadRootMessageId: threadRootForSend,
      messageKind: threadRootForSend ? "thread" : "chat",
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      isEdited: false,
      forwardedFrom: null,
      statuses: [{ userId: currentUser.id, status: "sent", createdAt }],
      reactions: [],
      attachments: previewAttachments,
      clientMessageId,
      deliveryState: "sending"
    };

    const outboxItem: QueuedOutboxMessage = {
      id: clientMessageId,
      clientMessageId,
      chatId: selectedChat.id,
      userId: currentUser.id,
      content: draftContent || null,
      replyToMessageId,
      threadRootMessageId: threadRootForSend,
      mentionedUserIds,
      encryptionProtocol: selectedChat.encryptionProtocol,
      attachments: outboxAttachments,
      createdAt,
      status: "queued",
      attemptCount: 0,
      optimisticMessage
    };

    try {
      sendInFlightRef.current = true;
      setIsSendingMessage(true);
      setIsUploading(localAttachments.length > 0);
      onError(null);

      // Persist to local outbox queue first so it survives restarts/crashes
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

      // Clear composer state immediately
      clearComposerFormattingSelection();
      setComposer("");
      resetComposerHeight();
      requestAnimationFrame(() => composerInputRef.current?.focus());
      for (const pending of localAttachments) {
        if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
      }
      setPendingAttachments([]);
      setReplyTarget(null);
      if (chatId) {
        window.localStorage.removeItem(`stovo:draft:${chatId}`);
      }
      socketRef.current?.emit("typing:stop", { chatId: selectedChat.id });

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

  async function sendQueuedNotificationReply(text: string) {
    const content = text.trim();
    if (!content || !accessToken || !currentUser || !selectedChat) return;
    if (selectedChat.type === "channel" && !canPostInSelectedChannel) {
      onError("You do not have permission to post in this channel");
      return;
    }
    try {
      const encrypted = await encryptMessageContent(selectedChat, content, currentUser.id);
      const message = await sendMessage(accessToken, selectedChat.id, encrypted.content, [], null, null, encrypted.encryption);
      const displayMessage = await decryptMessage(selectedChat.id, message, currentUser.id);
      applyMessagesForChat(selectedChat.id, (current) => mergeIncomingMessage(current, displayMessage));
      onChatsUpdate((current) =>
        current.map((chat) =>
          chat.id === selectedChat.id ? { ...applyMessagePreviewToChat(chat, displayMessage), unreadCount: 0 } : chat
        )
      );
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Message failed");
    }
  }

  function cancelVoiceRecording() {
    voiceRecordingPointerIdRef.current = null;
    voiceRecorderRef.current?.cancel();
    voiceRecorderRef.current = null;
    setIsVoiceRecording(false);
  }

  async function stopAndSendVoiceRecording() {
    voiceRecordingPointerIdRef.current = null;
    const handle = voiceRecorderRef.current;
    voiceRecorderRef.current = null;
    setIsVoiceRecording(false);
    if (!handle) return;
    try {
      const file = await handle.stop();
      const pending: PendingLocalAttachment = {
        localId: `local:${createClientMessageId()}`,
        file,
        previewUrl: null
      };
      await handleSendMessage(undefined, [pending]);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not send voice message");
    }
  }

  async function handleVoicePressStart(event: ReactPointerEvent<HTMLButtonElement>) {
    if (channelCommentsDisabledForViewer || missingCommentThread || isUploading || isSendingMessage) {
      return;
    }
    if (event.pointerType === "mouse" && voiceRecordingPointerIdRef.current !== null) {
      await stopAndSendVoiceRecording();
      return;
    }
    if (event.button !== 0 || voiceRecordingPointerIdRef.current !== null) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    voiceRecordingPointerIdRef.current = event.pointerId;
    if (!isVoiceRecordingSupported()) {
      voiceRecordingPointerIdRef.current = null;
      onError("Voice recording is not supported on this device");
      return;
    }
    try {
      onError(null);
      const handle = await startVoiceRecording();
      if (voiceRecordingPointerIdRef.current !== event.pointerId) {
        handle.cancel();
        return;
      }
      voiceRecorderRef.current = handle;
      setIsVoiceRecording(true);
    } catch (err) {
      if (voiceRecordingPointerIdRef.current !== event.pointerId) return;
      voiceRecordingPointerIdRef.current = null;
      voiceRecorderRef.current = null;
      setIsVoiceRecording(false);
      onError(err instanceof Error ? err.message : "Microphone permission is required to record");
    }
  }

  async function handleVoicePressEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    if (voiceRecordingPointerIdRef.current !== event.pointerId) return;
    await stopAndSendVoiceRecording();
  }

  function handleVoicePressCancel(event: ReactPointerEvent<HTMLButtonElement>) {
    if (voiceRecordingPointerIdRef.current !== event.pointerId) return;
    cancelVoiceRecording();
  }

  function resetForChatChange(nextChatId: string | undefined) {
    clearComposerFormattingSelection();
    setPendingAttachments([]);
    cancelVoiceRecording();
    closeEmojiPicker();
    const draft = nextChatId ? window.localStorage.getItem(`stovo:draft:${nextChatId}`) ?? "" : "";
    setComposer(draft);
  }

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
    sendQueuedNotificationReply,
    cancelVoiceRecording,
    stopAndSendVoiceRecording,
    handleVoicePressStart,
    handleVoicePressEnd,
    handleVoicePressCancel,
    resetForChatChange
  };
}

export type ComposerApi = ReturnType<typeof useMessageComposer>;
