import {
  CSSProperties,
  ChangeEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Bell,
  BellOff,
  Bus,
  Cat,
  CheckCheck,
  FileText,
  Forward,
  Flag,
  History,
  Image,
  Info,
  MessageCircle,
  Music,
  Mic,
  MicOff,
  Phone,
  Pin,
  Paperclip,
  Reply,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Smartphone,
  Video,
  VideoOff,
  Volume2,
  Maximize2,
  Minimize2,
  Home,
  Megaphone,
  Pencil,
  Shirt,
  Smile,
  Star,
  Trophy,
  Utensils,
  Users,
  WifiOff,
  X
} from "lucide-react";
import EmojiPicker, { Categories, EmojiClickData, Theme } from "emoji-picker-react";
import { Socket, io } from "socket.io-client";

import { callHistoryLabel, callHistoryTimestamp } from "../callHistory";
import { User } from "../api/auth";
import {
  Chat,
  Message,
  PinnedMessage,
  addMessageReaction,
	archiveMessage,
  createChannelChat,
  createDirectChat,
  createGroupChat,
  deleteMessage,
  editMessage,
  forwardMessage,
  getChat,
  getChats,
  getMessages,
  getPinnedMessages,
  markMessageRead,
  pinMessage,
  sendMessage,
  removeMessageReaction,
  unpinMessage,
  updateChat,
  updateChatPinPermission,
  updateChatPreferences
} from "../api/chats";
import { Family } from "../api/family";
import { ApiError, getApiUrl, isTunnelHost } from "../api/client";
import {
  dismissChatNotifications,
  type PendingNotificationAction
} from "../api/notifications";
import { takePendingNotificationAction } from "../notificationActions";
import {
  decryptMessage,
  decryptMessages,
  encryptMessageContent,
  ensureLocalEncryptionIdentity,
  encryptionProtocolLabel
} from "../api/messageCrypto";
import {
  FamilyFile,
  createMediaPlaybackToken,
  downloadFileBlob,
  formatFileSize,
  getMediaPlaybackUrl,
  saveFileToDisk,
  uploadFile
} from "../api/files";
import { peekCachedObjectUrl } from "../mediaBlobCache";
import { useAuth } from "../auth/AuthContext";
import { useAppearance } from "../appearance/AppearanceContext";
import AttachmentPickerSheet, {
  AttachmentPickerOption
} from "../components/AttachmentPickerSheet";
import { FormattingToolbar } from "../components/FormattingToolbar";
import ImageLightbox from "../components/ImageLightbox";
import { AudioPlayer } from "../components/AudioPlayer";
import {
  DocumentAttachmentPreview,
  detectDocumentPreviewKind
} from "../components/DocumentAttachmentPreview";
import {
  MessageEnlargeButton,
  MessageEnlargeModal
} from "../components/MessageEnlargeModal";
import MessageMediaAlbum, {
  isMediaAttachment,
  partitionMessageAttachments
} from "../components/MessageMediaAlbum";
import { VideoPlayer } from "../components/VideoPlayer";
import VeloLogo from "../components/VeloLogo";
import {
  applyFormattingToTextarea,
  measureTextareaSelectionAnchor
} from "../composerFormatting";
import type {
  FormattingKind,
  TextSelection,
  ToolbarAnchor
} from "../composerFormatting";
import { MessageMarkdown } from "../messageMarkdown";
import { messageMatchesSearch } from "../messageSearch";
import { VoiceRecordButton } from "../components/VoiceRecordButton";
import {
  AUDIO_ATTACHMENT_ACCEPT,
  CAMERA_ATTACHMENT_ACCEPT,
  DESKTOP_ATTACHMENT_ACCEPT,
  DOCUMENT_ATTACHMENT_ACCEPT,
  GALLERY_ATTACHMENT_ACCEPT
} from "../attachmentAccept";
import {
  isVoiceRecordingSupported,
  startVoiceRecording,
  type VoiceRecorderHandle
} from "../voiceRecording";
import useFilePreviewUrl from "../hooks/useFilePreviewUrl";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { navigateWithMotion } from "../motion/navigation";
import AppNav from "./AppNav";
import CallController, {
  CallCapabilities,
  CallDevice,
  CallSettings,
} from "../realtime/CallController";
import { createCallSoundPlayer } from "../realtime/callSounds";
import {
  getAudioSettings,
  saveAudioSettings,
  toPersistedSettings,
  mergeWithDefaults
} from "../api/audioSettings";
import { Capacitor } from "@capacitor/core";
import { App, AppState } from "@capacitor/app";
import {
  addPictureInPictureActionListener,
  addPictureInPictureListener,
  addProximityListener,
  disableNativeCallMode,
  enableNativeCallMode,
  isNativeCallPluginAvailable,
  setNativeActiveCallState,
  setNativeActiveVideoState,
  type PictureInPictureState,
} from "../native/callPlugin";
import {
  applyPictureInPictureAction,
  parseVideoPictureInPictureRestore,
  toNativeVideoPictureInPictureState,
} from "../videoPiPBridge";
import { videoPlaybackSession } from "../videoPlaybackSession";
import {
  audioPlaybackSession,
  type AudioDescriptor,
  type AudioIdentity,
  type AudioSourceFactory
} from "../audioPlaybackSession";
import { validateAudioRestoreTarget } from "../audioRestore";

type CallPhase = "idle" | "outgoing" | "incoming" | "connecting" | "in-call";

export function buildAudioSourceFactory(accessToken: string): AudioSourceFactory {
  return async (descriptor) => {
    if (!accessToken.trim()) {
      throw new Error("Audio playback requires authentication");
    }

    const fileId = descriptor.identity.fileId;

    // Android MediaService needs a credentialed stream URL. Warm the blob cache
    // in the background so later web/fallback playback is instant.
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      void downloadFileBlob(accessToken, fileId).catch(() => undefined);
      const capability = await createMediaPlaybackToken(accessToken, fileId);
      return {
        url: getMediaPlaybackUrl(fileId),
        token: capability.token
      };
    }

    // Web: play from the shared media blob cache. Never mark objectUrl owned —
    // the playback backend must not revoke cache URLs (that crashed second play).
    await downloadFileBlob(accessToken, fileId);
    const cachedUrl = peekCachedObjectUrl(fileId);
    if (!cachedUrl) {
      throw new Error("Audio cache miss after download");
    }
    return { url: cachedUrl };
  };
}

function activeSessionVideoElement(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>(".video-player.is-session-active video");
}

export function androidAppStatePayload(isActive: boolean, activeChatId?: string) {
  return {
    foreground: isActive,
    activeChatId: isActive ? activeChatId ?? "" : ""
  };
}

export function callTerminationEvent(phase: CallPhase): "call:cancel" | "call:end" {
  return phase === "outgoing" ? "call:cancel" : "call:end";
}

type CallTrackStatus = {
  echoCancellation: boolean | null;
  noiseSuppression: boolean | null;
  autoGainControl: boolean | null;
};

function isSuppressedUserError(message: string | null): boolean {
  return message === "Authentication required";
}

function displayChatName(chat: Chat, currentUserId: string | undefined) {
  if (chat.type === "archive") {
    return "Message Archive";
  }
  if (chat.type === "family" || chat.type === "group" || chat.type === "channel") {
    return chat.title ?? "General Family Chat";
  }
  const otherMember = chat.members.find((member) => member.id !== currentUserId);
  return otherMember?.displayName ?? "Direct chat";
}

function chatTransitionName(chatId: string, part: "avatar" | "title") {
  return `chat-${chatId}-${part}`;
}

function transitionAnchorStyle(name?: string): CSSProperties | undefined {
  if (!name) {
    return undefined;
  }

  return { viewTransitionName: name };
}

function chatInitials(name: string) {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return parts
      .slice(0, 2)
      .map((part) => part.at(0)?.toUpperCase())
      .join("");
  }
  const compact = parts[0] ?? name;
  return compact.slice(0, 2).toUpperCase();
}

type ChatAvatarFallbackKind = "direct" | "group" | "channel" | "family";

function chatAvatarFallbackKind(chat: Chat): ChatAvatarFallbackKind {
  if (chat.type === "family") {
    return "family";
  }
  if (chat.type === "channel") {
    return "channel";
  }
  if (chat.type === "group") {
    return "group";
  }
  return "direct";
}

function formatChatTime(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
type NewChatScreen = "pick" | "group" | "channel";
type ChatFilter = "all" | "unread" | "groups" | "direct" | "muted";
type ChatSectionKey = "archive" | "dms" | "groups" | "channels";
type SharedContentTab = "media" | "files" | "links";
type ChatInfoControl = "name" | "permissions" | null;

export type NotificationActionCommand =
  | { type: "reply"; text: string }
  | { type: "callback" }
  | { type: "discard" };

export function notificationActionCommand(
  action: PendingNotificationAction,
  chat: Pick<Chat, "id" | "type">
): NotificationActionCommand | null {
  if (action.chatId !== chat.id) {
    return null;
  }
  if (action.type === "reply") {
    return { type: "reply", text: action.text };
  }
  return chat.type === "direct" ? { type: "callback" } : { type: "discard" };
}

export function chatInfoControlVisibility(activeControl: ChatInfoControl) {
  return {
    nameEditor: activeControl === "name",
    permissions: activeControl === "permissions"
  };
}

const CHAT_FILTERS: Array<{ label: string; value: ChatFilter }> = [
  { label: "All", value: "all" },
  { label: "Unread", value: "unread" },
  { label: "Groups", value: "groups" },
  { label: "Direct", value: "direct" },
  { label: "Muted", value: "muted" }
];
const CHAT_SECTION_ORDER: Array<{ key: ChatSectionKey; label: string }> = [
  { key: "archive", label: "Message Archive" },
  { key: "channels", label: "Channels" },
  { key: "groups", label: "Groups" },
  { key: "dms", label: "DMs" }
];
const MESSAGE_REACTION_CHOICES = ["👍", "❤️", "😂", "😮", "🙏"];
const MESSAGE_CONTEXT_MENU_WIDTH = 236;
const MESSAGE_CONTEXT_MENU_HEIGHT = 220;
const SWIPE_REPLY_MAX_OFFSET = 84;
const SWIPE_REPLY_TRIGGER_OFFSET = 56;
const SWIPE_REPLY_DIRECTION_LOCK = 12;
const MESSAGE_LONG_PRESS_DURATION_MS = 420;
const MESSAGE_LONG_PRESS_MOVE_TOLERANCE = 10;
const SWIPE_REPLY_VERTICAL_TOLERANCE = 14;
const CHAT_EXIT_SWIPE_EDGE_THRESHOLD = 32;
const CHAT_EXIT_SWIPE_TRIGGER_OFFSET = 78;

const COMPOSER_EMOJIS = [
  "😀",
  "😂",
  "😍",
  "🥰",
  "😊",
  "😎",
  "😢",
  "😮",
  "👍",
  "👎",
  "👏",
  "🙏",
  "❤️",
  "🔥",
  "🎉",
  "✨",
  "💬",
  "📷",
  "🍕",
  "☕",
  "🏠",
  "🌟",
  "✅",
  "❗"
];

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

function chatTypeLabel(chat: Chat) {
  if (chat.type === "family") {
    return "Family chat";
  }
  if (chat.type === "channel") {
    return "Channel";
  }
  if (chat.type === "group") {
    return "Group chat";
  }
  return "Direct chat";
}

function sortPinsByPosition(pins: PinnedMessage[]): PinnedMessage[] {
  return [...pins].sort(
    (a, b) => new Date(a.message.createdAt).getTime() - new Date(b.message.createdAt).getTime()
  );
}

function chatAvatarTypeClass(chat: Chat) {
  if (chat.type === "family") {
    return "family";
  }
  if (chat.type === "group" || chat.type === "channel") {
    return "group";
  }
  return "";
}

export function emojiSizeClass(content: string | null | undefined): string {
  if (!content) return "";
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const segments = [...segmenter.segment(content.trim())];
  if (!segments.every((s) => /^\p{Emoji}/u.test(s.segment) || /^\s+$/.test(s.segment))) {
    return "";
  }
  const emojiCount = segments.filter((s) => /^\p{Emoji}/u.test(s.segment)).length;
  if (emojiCount === 0) return "";
  if (emojiCount === 1) return "emoji-only-xl";
  if (emojiCount === 2) return "emoji-only-lg";
  if (emojiCount === 3) return "emoji-only-md";
  return "";
}

function chatPreview(chat: Chat) {
  if (chat.lastMessageContent && chat.lastMessageSenderDisplayName) {
    return `${chat.lastMessageSenderDisplayName}: ${chat.lastMessageContent}`;
  }
  if (chat.type === "family") {
    return `${chat.members.length} members / private family room`;
  }
  if (chat.type === "channel") {
    return `${chat.members.length} members / read-only channel`;
  }
  if (chat.type === "group") {
    return `${chat.members.length} members / group chat`;
  }
  return "Direct message";
}

function messagePreviewText(message: Message) {
  if (message.type === "call" && message.call) {
    return callHistoryLabel(message.call);
  }
  if (message.content?.trim()) {
    return message.content.trim();
  }
  if (message.attachments.length > 1) {
    return `${message.attachments.length} attachments`;
  }
  if (message.attachments.length === 1) {
    const file = message.attachments[0];
    if (file.mimeType.startsWith("image/")) {
      return "Photo";
    }
    if (file.mimeType.startsWith("video/")) {
      return "Video";
    }
    return "File";
  }
  if (message.type === "image") {
    return "Photo";
  }
  if (message.type === "video") {
    return "Video";
  }
  if (message.type === "file") {
    return "File";
  }
  return "Message";
}

function applyMessagePreviewToChat(chat: Chat, message: Message) {
  return {
    ...chat,
    updatedAt: message.createdAt,
    lastMessageId: message.id,
    lastMessageSenderId: message.senderId,
    lastMessageSenderDisplayName: message.senderDisplayName ?? "Unknown",
    lastMessageContent: messagePreviewText(message),
    lastMessageType: message.type,
    lastMessageCreatedAt: message.createdAt
  };
}

type SwipeReplyState = {
  messageId: string;
  offset: number;
  activated: boolean;
};

type SwipeReplyGestureState = {
  messageId: string;
  pointerId: number;
  startX: number;
  startY: number;
  lastOffset: number;
  lock: "pending" | "horizontal";
};

type MessageLongPressState = {
  messageId: string;
  pointerId: number;
  startX: number;
  startY: number;
  timerId: number;
};

type ChatExitSwipeState = {
  pointerId: number;
  startX: number;
  startY: number;
  lock: "pending" | "horizontal" | "vertical";
  committed: boolean;
};

type PendingMessageFocus = {
  messageId: string;
  highlightClassName: "message-pin-flash" | "message-context-flash" | "message-audio-context-flash";
  lockPinTracking?: boolean;
};

function formatDateSeparator(value: string | null | undefined) {
  if (!value) {
    return "Today";
  }
  const date = new Date(value);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) {
    return "Today";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function messageDeliveryLabel(message: Message, mine: boolean) {
  if (message.deliveryState === "sending") {
    return "Sending";
  }
  if (message.deliveryState === "failed") {
    return "Failed";
  }
  if (mine && message.statuses.some((status) => status.status === "read")) {
    return "Read";
  }
  if (mine && message.statuses.some((status) => status.status === "delivered")) {
    return "Delivered";
  }
  return new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isGroupedMessage(
  message: Message,
  previous: Message | undefined,
  currentUserId: string | undefined
) {
  if (!previous) {
    return false;
  }
  const mine = message.senderId === currentUserId;
  const previousMine = previous.senderId === currentUserId;
  if (mine !== previousMine || message.senderId !== previous.senderId) {
    return false;
  }
  const elapsed =
    new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime();
  return elapsed <= 5 * 60 * 1000;
}

function canManageChat(chat: Chat, currentUser: User | null) {
  if (!currentUser || chat.type === "direct") {
    return false;
  }
  return (
    currentUser.role === "owner" ||
    currentUser.role === "admin" ||
    ((chat.type === "group" || chat.type === "channel") && chat.createdBy === currentUser.id)
  );
}

function canUpdateMediaVisibility(chat: Chat, currentUser: User | null) {
  if (chat.type === "family") {
    return false;
  }
  if (chat.type === "direct") {
    return true;
  }
  return canManageChat(chat, currentUser);
}

function mediaVisibilityToggleChecked(chat: Chat) {
  return chat.mediaVisibility === "family" || chat.myMediaVisibilityApproval;
}

function attachmentMatchesTab(file: FamilyFile, tab: SharedContentTab) {
  if (tab === "links") {
    return false;
  }
  const isMedia = file.mimeType.startsWith("image/") || file.mimeType.startsWith("video/");
  return tab === "media" ? isMedia : !isMedia;
}

function createClientMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function inferOptimisticMessageType(files: FamilyFile[], content: string | null): Message["type"] {
  if (files.length === 0) {
    return "text";
  }
  const kinds = new Set(
    files.map((file) => {
      if (file.mimeType.startsWith("image/")) {
        return "image";
      }
      if (file.mimeType.startsWith("video/")) {
        return "video";
      }
      return "file";
    })
  );
  if (content || kinds.size > 1) {
    return "mixed";
  }
  return kinds.has("image") ? "image" : kinds.has("video") ? "video" : "file";
}

function mergeIncomingMessage(current: Message[], incoming: Message) {
  const clientMessageId = incoming.clientMessageId;
  const message = {
    ...incoming,
    clientMessageId: undefined,
    deliveryError: incoming.deliveryError,
    deliveryState: undefined
  };
  if (clientMessageId) {
    const pendingIndex = current.findIndex(
      (existing) => existing.clientMessageId === clientMessageId
    );
    if (pendingIndex !== -1) {
      const replaced = current.map((existing, index) => (index === pendingIndex ? message : existing));
      const deduped = new Map<string, Message>();
      for (const item of replaced) {
        deduped.set(item.id, item);
      }
      return Array.from(deduped.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
  }
  if (current.some((existing) => existing.id === message.id)) {
    return current.map((existing) => (existing.id === message.id ? message : existing));
  }
  return [...current, message];
}

type MessageStatusValue = Message["statuses"][number]["status"];
type MessageStateUpdate = Message[] | ((current: Message[]) => Message[]);

function addMessageStatus(
  message: Message,
  userId: string,
  status: MessageStatusValue,
  createdAt: string
) {
  if (message.senderId === userId) {
    return message;
  }
  if (
    message.statuses.some(
      (existing) => existing.userId === userId && existing.status === status
    )
  ) {
    return message;
  }
  return {
    ...message,
    statuses: [...message.statuses, { userId, status, createdAt }]
  };
}

function markMessagesReadThrough(
  current: Message[],
  payload: { chatId: string; messageId: string; userId: string }
) {
  const targetIndex = current.findIndex(
    (message) => message.chatId === payload.chatId && message.id === payload.messageId
  );
  if (targetIndex === -1) {
    return current;
  }
  const createdAt = new Date().toISOString();
  return current.map((message, index) =>
    index <= targetIndex && message.chatId === payload.chatId
      ? addMessageStatus(message, payload.userId, "read", createdAt)
      : message
  );
}

function markMessageDelivered(
  current: Message[],
  payload: { messageId: string; userIds?: string[] }
) {
  if (!payload.userIds?.length) {
    return current;
  }
  const createdAt = new Date().toISOString();
  return current.map((message) => {
    if (message.id !== payload.messageId) {
      return message;
    }
    return payload.userIds!.reduce(
      (updated, userId) => addMessageStatus(updated, userId, "delivered", createdAt),
      message
    );
  });
}

function replaceMessage(current: Message[], updated: Message) {
  return current.map((message) => (message.id === updated.id ? updated : message));
}

function uniqueUserIds(userIds: string[]) {
  return Array.from(new Set(userIds));
}

function optimisticReactionUpdate(message: Message, userId: string, emoji: string, add: boolean) {
  const reactions = message.reactions
    .map((reaction) => ({
      ...reaction,
      userIds: uniqueUserIds(reaction.userIds.filter((id) => id !== userId))
    }))
    .filter((reaction) => reaction.userIds.length > 0);

  if (add) {
    const existing = reactions.find((reaction) => reaction.emoji === emoji);
    if (existing) {
      existing.userIds = uniqueUserIds([...existing.userIds, userId]);
    } else {
      reactions.push({
        emoji,
        count: 1,
        userIds: [userId],
        reacted: true
      });
    }
  }

  return {
    ...message,
    reactions: reactions.map((reaction) => ({
      ...reaction,
      count: reaction.userIds.length,
      reacted: reaction.userIds.includes(userId)
    }))
  };
}

interface SendMessageErrorAck {
  ok: false;
  clientMessageId?: string;
  message?: string;
}

function isMessageAck(value: unknown): value is Message {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<Message>;
  return typeof candidate.id === "string" && typeof candidate.chatId === "string";
}

function isErrorAck(value: unknown): value is SendMessageErrorAck {
  return Boolean(value && typeof value === "object" && (value as SendMessageErrorAck).ok === false);
}

function markPendingMessageFailed(
  current: Message[],
  clientMessageId: string,
  deliveryError: string
) {
  return current.map((message) =>
    message.clientMessageId === clientMessageId
      ? {
          ...message,
          deliveryError,
          deliveryState: "failed" as const
        }
      : message
  );
}

function messageActionSummary(message: Message) {
  if (message.content?.trim()) {
    return message.content.trim();
  }
  if (message.attachments.length === 1) {
    return message.attachments[0].originalName;
  }
  if (message.attachments.length > 1) {
    return `${message.attachments.length} attachments`;
  }
  return "Message";
}

function isImageAttachment(file: FamilyFile) {
  return file.mimeType.startsWith("image/");
}

function messageHasOnlyMediaAttachments(message: Message) {
  return (
    message.attachments.length > 0 &&
    message.attachments.every((file) => isMediaAttachment(file))
  );
}

function MessageImageAttachment({
  accessToken,
  file,
  onOpenImage
}: {
  accessToken: string | null;
  file: FamilyFile;
  onOpenImage?: (file: FamilyFile, previewUrl: string) => void;
}) {
  const previewUrl = useFilePreviewUrl(accessToken, file, true);

  return (
    <button
      type="button"
      className="message-photo-attachment"
      aria-label={`Open ${file.originalName} full view`}
      disabled={!previewUrl}
      onClick={() => {
        if (previewUrl) {
          onOpenImage?.(file, previewUrl);
        }
      }}
    >
      {previewUrl ? (
        <img src={previewUrl} alt="" />
      ) : (
        <span className="message-photo-placeholder" aria-hidden="true">
          <Image size={28} />
        </span>
      )}
    </button>
  );
}

function AttachmentCard({
  accessToken,
  chatId,
  file,
  messageId,
  disabledReason,
  onBeforeAudioPlay,
  compact = false,
  onOpenImage,
  videoAutoplay = true
}: {
  accessToken: string | null;
  chatId: string;
  file: FamilyFile;
  messageId: string;
  disabledReason?: string;
  onBeforeAudioPlay?: () => Promise<void>;
  compact?: boolean;
  onOpenImage?: (file: FamilyFile, previewUrl: string) => void;
  videoAutoplay?: boolean;
}) {
  const isImage = isImageAttachment(file);
  const isVideo = file.mimeType.startsWith("video/");
  const isAudio = file.mimeType.startsWith("audio/");
  const documentKind = detectDocumentPreviewKind(file);
  const previewUrl = useFilePreviewUrl(accessToken, file, isImage);
  const resolveAudioDurationUrl = useCallback(async () => {
    if (!accessToken?.trim()) return null;
    try {
      await downloadFileBlob(accessToken, file.id);
      return peekCachedObjectUrl(file.id);
    } catch {
      return null;
    }
  }, [accessToken, file.id]);

  if (isAudio) {
    const descriptor: AudioDescriptor = {
      identity: { chatId, messageId, fileId: file.id },
      title: file.originalName
    };
    return (
      <AudioPlayer
        descriptor={descriptor}
        sourceFactory={buildAudioSourceFactory(accessToken ?? "")}
        disabledReason={disabledReason}
        onBeforePlay={onBeforeAudioPlay}
        resolveDurationUrl={resolveAudioDurationUrl}
        hideTitle={file.originalName.startsWith("voice-")}
      />
    );
  }

  if (isVideo) {
    return (
      <article className="message-video-attachment">
        <VideoPlayer
          accessToken={accessToken ?? ""}
          file={file}
          identity={{ chatId, messageId, fileId: file.id }}
          disabledReason={disabledReason}
          beforePlay={() => audioPlaybackSession.pauseForVideo()}
          autoplay={videoAutoplay}
        />
      </article>
    );
  }

  if (documentKind !== "unsupported") {
    return <DocumentAttachmentPreview accessToken={accessToken} file={file} />;
  }

  if (compact && isImage) {
    return (
      <MessageImageAttachment
        accessToken={accessToken}
        file={file}
        onOpenImage={onOpenImage}
      />
    );
  }

  return (
    <article className={`attachment-card ${compact ? "compact" : ""} ${isImage ? "image-preview-card" : ""}`}>
      {isImage ? (
        <button
          type="button"
          className="attachment-preview-button"
          aria-label={`Open ${file.originalName} full view`}
          disabled={!previewUrl}
          onClick={() => {
            if (previewUrl) {
              onOpenImage?.(file, previewUrl);
            }
          }}
        >
          {previewUrl ? (
            <img src={previewUrl} alt={file.originalName} />
          ) : (
            <span className="attachment-file-icon">
              <Image aria-hidden="true" size={24} />
            </span>
          )}
        </button>
      ) : (
        <span className="attachment-file-icon">
          <FileText aria-hidden="true" size={22} />
        </span>
      )}
      <div className="attachment-copy">
        <strong>{file.originalName}</strong>
        <span>
          {file.mimeType} / {formatFileSize(file.sizeBytes)}
        </span>
      </div>
      {accessToken && (
        <button type="button" onClick={() => void saveFileToDisk(accessToken, file)}>
          Save
        </button>
      )}
    </article>
  );
}

function SharedContentThumb({
  accessToken,
  file,
  onOpenImage
}: {
  accessToken: string | null;
  file: FamilyFile;
  onOpenImage: (file: FamilyFile, previewUrl: string) => void;
}) {
  const isImage = file.mimeType.startsWith("image/");
  const previewUrl = useFilePreviewUrl(accessToken, file, isImage);

  if (!isImage) {
    return (
      <span className="media-thumb" title={file.originalName}>
        <FileText aria-hidden="true" size={20} />
      </span>
    );
  }

  return (
    <button
      type="button"
      className="media-thumb is-image"
      aria-label={`Open ${file.originalName} full view`}
      title={file.originalName}
      disabled={!previewUrl}
      onClick={() => {
        if (previewUrl) {
          onOpenImage(file, previewUrl);
        }
      }}
    >
      {previewUrl ? <img src={previewUrl} alt={file.originalName} /> : <Image aria-hidden="true" size={20} />}
    </button>
  );
}

function mergeMessageLists(current: Message[], incoming: Message[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function isMultiMemberChat(type: Chat["type"]) {
  return type === "family" || type === "group" || type === "channel";
}

export function shouldShowMessageSender(chatType: Chat["type"], mine: boolean) {
  return !mine && isMultiMemberChat(chatType);
}

function canPostToChannel(chat: Chat, currentUser: User | null) {
  if (!currentUser || chat.type !== "channel") {
    return false;
  }
  return (
    currentUser.role === "owner" ||
    currentUser.role === "admin" ||
    chat.createdBy === currentUser.id
  );
}

type PendingLocalAttachment = {
  localId: string;
  file: File;
  previewUrl: string | null;
};

async function ensureSocketConnected(socket: Socket, timeoutMs = 4000) {
  if (socket.connected) {
    return true;
  }
  socket.connect();
  return await new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => {
      cleanup();
      resolve(socket.connected);
    }, timeoutMs);
    const onConnect = () => {
      cleanup();
      resolve(true);
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      socket.off("connect", onConnect);
    };
    socket.on("connect", onConnect);
  });
}

function chatAvatarFile(chat: Chat, currentUserId: string | undefined) {
  if (chat.chatPhoto) {
    return chat.chatPhoto;
  }
  if (chat.type === "direct") {
    return chat.members.find((member) => member.id !== currentUserId)?.profilePhoto ?? null;
  }
  return null;
}

function RealAvatar({
  accessToken,
  className,
  file,
  fallbackKind = "direct",
  label,
  style
}: {
  accessToken: string | null;
  className: string;
  file: FamilyFile | null | undefined;
  fallbackKind?: ChatAvatarFallbackKind;
  label: string;
  style?: CSSProperties;
}) {
  const previewUrl = useFilePreviewUrl(accessToken, file ?? null, Boolean(file));
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    setImageBroken(false);
  }, [file?.id, previewUrl]);

  function renderFallback() {
    const isXl = className.includes("avatar-xl");
    const iconSize = isXl ? 56 : 24;

    if (fallbackKind === "group") {
      return <Users aria-hidden className="avatar-fallback-svg" size={iconSize} strokeWidth={1.75} />;
    }
    if (fallbackKind === "channel") {
      return <Megaphone aria-hidden className="avatar-fallback-svg" size={iconSize} strokeWidth={1.75} />;
    }
    if (fallbackKind === "family") {
      return <Home aria-hidden className="avatar-fallback-svg" size={iconSize} strokeWidth={1.75} />;
    }
    return chatInitials(label);
  }

  const showImage = Boolean(previewUrl) && !imageBroken;

  return (
    <span className={className} style={style}>
      {showImage ? (
        <img
          src={previewUrl ?? undefined}
          alt=""
          onError={() => setImageBroken(true)}
        />
      ) : (
        renderFallback()
      )}
    </span>
  );
}

const SOCKET_POLLING_OVERRIDE_STORAGE_KEY = "familyMessenger.socket.forcePollingFirst";

function readSocketForcePollingOverride() {
  const envValue = import.meta.env.VITE_SOCKET_FORCE_POLLING_FIRST;
  if (typeof envValue === "string") {
    const normalized = envValue.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
      return false;
    }
  }

  if (typeof window === "undefined") {
    return null;
  }

  const storedValue = window.localStorage.getItem(SOCKET_POLLING_OVERRIDE_STORAGE_KEY);
  if (storedValue === null) {
    return null;
  }
  const normalized = storedValue.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }
  return null;
}

function preferPollingFirst(hostname: string) {
  const override = readSocketForcePollingOverride();
  if (override !== null) {
    return override;
  }
  // Capacitor (Android/iOS) injects window.Capacitor at runtime. The
  // doquangtan/socketio server library only populates socket.Handshake.URL
  // for polling connections — WebSocket connections leave it empty, so the
  // server cannot extract the auth token and immediately disconnects the
  // socket. Force polling-first on native platforms so the handshake URL
  // (which contains the token query param) is always available to the server.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cap = typeof window !== "undefined" ? (window as any).Capacitor : undefined;
  if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) {
    return true;
  }
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1") {
    return false;
  }
  return true;
}

function hasLiveLocalVideo(stream: MediaStream | null): boolean {
  return stream?.getVideoTracks().some((track) => track.readyState !== "ended") ?? false;
}

/** Mobile full-screen call UI: native Capacitor apps always, or narrow browser viewport. */
function isMobileCallViewport(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (Capacitor.isNativePlatform()) {
    return true;
  }
  return window.matchMedia("(max-width: 768px)").matches;
}

function supportsSwipeReplyGesture(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (Capacitor.isNativePlatform()) {
    return true;
  }
  return (
    window.matchMedia("(pointer: coarse)").matches &&
    window.matchMedia("(max-width: 960px)").matches
  );
}

function useCallTimer(active: boolean): string {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) { setSeconds(0); return; }
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function CopySheetTextarea({
  content,
  onCopy,
  onClose,
}: {
  content: string;
  onCopy: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  function handleCopy() {
    if (ref.current) {
      ref.current.focus();
      ref.current.select();
    }
    const ok = document.execCommand("copy");
    if (!ok) {
      void navigator.clipboard.writeText(ref.current?.value ?? content);
    }
    onCopy();
  }
  return (
    <>
      <textarea
        ref={ref}
        defaultValue={content}
        readOnly={false}
        className="copy-sheet-textarea"
      />
      <div className="copy-sheet-actions">
        <button
          type="button"
          className="copy-sheet-cancel-btn"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="copy-sheet-copy-btn"
          onClick={handleCopy}
        >
          Copy
        </button>
      </div>
    </>
  );
}

export default function ChatsPage() {
  const { chatId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const { accessToken, currentUser, authRequest, updateCurrentUser } = useAuth();
  const { appearance, resolvedThemeMode } = useAppearance();
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [composer, setComposer] = useState("");
  const [formattingToolbarAnchor, setFormattingToolbarAnchor] =
    useState<ToolbarAnchor | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingLocalAttachment[]>([]);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [chatSearch, setChatSearch] = useState("");
  const [chatFilter, setChatFilter] = useState<ChatFilter>("all");
  const [messageSearch, setMessageSearch] = useState("");
  const [isMessageSearchOpen, setIsMessageSearchOpen] = useState(false);
  const [wholeWordSearch, setWholeWordSearch] = useState(false);
  const [caseSensitiveSearch, setCaseSensitiveSearch] = useState(false);
  const [isChatMenuOpen, setIsChatMenuOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [copySheetContent, setCopySheetContent] = useState<string | null>(null);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [newChatScreen, setNewChatScreen] = useState<NewChatScreen>("pick");
  const [newChatMemberSearch, setNewChatMemberSearch] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<SharedContentTab>("media");
  const [chatTitleDraft, setChatTitleDraft] = useState("");
  const [fullViewImage, setFullViewImage] = useState<{
    file: FamilyFile;
    previewUrl: string;
  } | null>(null);
  const [isFullViewImageClosing, setIsFullViewImageClosing] = useState(false);
  const [composerEnlargeOpen, setComposerEnlargeOpen] = useState(false);
  const [composerIsMultiline, setComposerIsMultiline] = useState(false);
  const [messageContextMenu, setMessageContextMenu] = useState<{
    message: Message;
    x: number;
    y: number;
  } | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [threadRootMessageId, setThreadRootMessageId] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null);
  const [editTargetMessage, setEditTargetMessage] = useState<Message | null>(null);
  const [swipeReplyState, setSwipeReplyState] = useState<SwipeReplyState | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [pinIndex, setPinIndex] = useState<number>(0);
  const draftBeforeEditRef = useRef<string>("");
  const editInFlightRef = useRef(false);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [deleteForMe, setDeleteForMe] = useState(true);
  const [deleteForEveryone, setDeleteForEveryone] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioRestoreStatus, setAudioRestoreStatus] = useState<string | null>(null);
  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const [activeCallChatId, setActiveCallChatId] = useState<string | null>(null);
  const [callPeerUserId, setCallPeerUserId] = useState<string | null>(null);
  const [callNotice, setCallNotice] = useState<string | null>(null);
  const [callType, setCallType] = useState<"audio" | "video">("audio");
  const [callAudioSettings, setCallAudioSettings] = useState<CallSettings>({
    micMuted: false,
    soundDisabled: false,
    cameraEnabled: false,
    cameraFacingMode: "user",
    speakerMode: "small",
    inputDeviceId: "",
    outputDeviceId: "",
    videoDeviceId: "",
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    voiceEnhancement: false,
    inputGain: 100,
    outputVolume: 100,
    voiceEnhancementThreshold: -24,
    voiceEnhancementHighpass: 120,
    mirrorLocalVideo: true,
  });
  const [isCallSettingsMenuOpen, setIsCallSettingsMenuOpen] = useState(false);
  const [isCallAudioPopupOpen, setIsCallAudioPopupOpen] = useState(false);
  const [isCallVideoPopupOpen, setIsCallVideoPopupOpen] = useState(false);
  const [isCallMinimized, setIsCallMinimized] = useState(false);
  const [isVideoPictureInPictureActive, setIsVideoPictureInPictureActive] = useState(false);
  const [callTrackStatus, setCallTrackStatus] = useState<CallTrackStatus | null>(null);
  const [callAudioDevices, setCallAudioDevices] = useState<CallDevice[]>([]);
  const [callAudioCapabilities, setCallAudioCapabilities] = useState<CallCapabilities>({
    canSelectInputDevice: false,
    canSelectOutputDevice: false,
    canUseNoiseSuppression: false,
    canUseEchoCancellation: false,
    canUseAutoGainControl: false,
    canUseVoiceEnhancement: false,
    canUseCamera: false,
  });
  const [callAudioWarning, setCallAudioWarning] = useState<string | null>(null);
  const [isPeerSpeaking, setIsPeerSpeaking] = useState(false);
  const [isProximityNear, setIsProximityNear] = useState(false);
  const [isSpeakerSheetOpen, setIsSpeakerSheetOpen] = useState(false);
  const [callPeerDisplayName, setCallPeerDisplayName] = useState<string | null>(null);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [remoteVideoStream, setRemoteVideoStream] = useState<MediaStream | null>(null);
  const callTimer = useCallTimer(callPhase === "in-call");
  const [isMobileViewport, setIsMobileViewport] = useState(isMobileCallViewport);
  const [isLoading, setIsLoading] = useState(true);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const socketRef = useRef<Socket | null>(null);
  const audioCallRef = useRef<CallController | null>(null);
  const callSoundPlayerRef = useRef(createCallSoundPlayer());
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const loadOverviewRequestRef = useRef(0);
  const loadChatRequestRef = useRef(0);
  const activeChatIdRef = useRef<string | undefined>(chatId);
  const activeCallChatIdRef = useRef<string | null>(null);
  // Per-session identifier set from call:ringing.createdAt; guards stale same-chatId
  // termination events from previous call sessions.
  const activeCallSessionIdRef = useRef<string | null>(null);
  const callTypeRef = useRef<"audio" | "video">("audio");
  const callPhaseRef = useRef<CallPhase>("idle");
  const pictureInPictureActiveRef = useRef(false);
  const videoPictureInPictureActiveRef = useRef(false);
  const lastNativeVideoRevisionRef = useRef(0);
  const accessTokenRef = useRef<string | null>(accessToken);
  const chatsRef = useRef<Chat[]>([]);
  const messagesRef = useRef<Message[]>([]);
  const messageCacheRef = useRef<Record<string, Message[]>>({});
  const hasLoadedOverviewRef = useRef(false);
  const typingStopTimerRef = useRef<number | null>(null);
  const messagesPanelRef = useRef<HTMLDivElement | null>(null);
  const pinClickScrollingRef = useRef(false);
  const pinTrackingTimeoutRef = useRef<number | null>(null);
  const messageHighlightTimeoutRef = useRef<number | null>(null);
  const audioRestoreStatusTimerRef = useRef<number | null>(null);
  const observedAudioUserIdRef = useRef<string | null>(currentUser?.id ?? null);
  const lastAudioVideoArbitrationRevisionRef = useRef(-1);
  const pendingMessageFocusRef = useRef<PendingMessageFocus | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const composerFormattingSelectionRef = useRef<TextSelection | null>(null);
  const swipeReplyGestureRef = useRef<SwipeReplyGestureState | null>(null);
  const messageLongPressRef = useRef<MessageLongPressState | null>(null);
  const chatExitSwipeRef = useRef<ChatExitSwipeState | null>(null);
  const suppressedMessageClickRef = useRef<{
    messageId: string;
    expiresAt: number;
  } | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const galleryAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const cameraAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const audioAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const documentAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [isAttachmentSheetOpen, setIsAttachmentSheetOpen] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const voiceRecorderRef = useRef<VoiceRecorderHandle | null>(null);
  const voiceRecordingPointerIdRef = useRef<number | null>(null);
  const chatMenuRef = useRef<HTMLDivElement | null>(null);
  const chatPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerDockRef = useRef<HTMLDivElement | null>(null);
  const sendInFlightRef = useRef(false);
  const handledNotificationActionRef = useRef<string | null>(null);
  const saveAudioSettingsTimerRef = useRef<number | null>(null);
  const soundDisabledRef = useRef(callAudioSettings.soundDisabled);
  const callSettingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const callSettingsMenuRef = useRef<HTMLDivElement | null>(null);
  const callAudioPopupRef = useRef<HTMLDivElement | null>(null);
  const unreadTotal = useMemo(
    () => chats.reduce((total, chat) => total + chat.unreadCount, 0),
    [chats]
  );

  const clearMessageMotionState = useCallback(() => {
    if (pinTrackingTimeoutRef.current !== null) {
      window.clearTimeout(pinTrackingTimeoutRef.current);
      pinTrackingTimeoutRef.current = null;
    }
    if (messageHighlightTimeoutRef.current !== null) {
      window.clearTimeout(messageHighlightTimeoutRef.current);
      messageHighlightTimeoutRef.current = null;
    }
    pinClickScrollingRef.current = false;
  }, []);

  const focusMessageInPanel = useCallback(
    ({
      messageId,
      highlightClassName,
      lockPinTracking = false,
    }: PendingMessageFocus) => {
      const panel = messagesPanelRef.current;
      const element = document.getElementById(messageId);
      if (!panel || !element) {
        return false;
      }

      clearMessageMotionState();
      if (lockPinTracking) {
        pinClickScrollingRef.current = true;
        pinTrackingTimeoutRef.current = window.setTimeout(() => {
          pinClickScrollingRef.current = false;
          pinTrackingTimeoutRef.current = null;
        }, prefersReducedMotion ? 80 : 820);
      }

      const panelRect = panel.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const topInset = Math.min(Math.max(panel.clientHeight * 0.24, 88), 144);
      const targetTop = Math.max(
        0,
        panel.scrollTop + elementRect.top - panelRect.top - topInset
      );

      panel.scrollTo({
        top: targetTop,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });

      element.classList.remove("message-pin-flash", "message-context-flash");
      void element.offsetWidth;
      element.classList.add(highlightClassName);
      messageHighlightTimeoutRef.current = window.setTimeout(() => {
        element.classList.remove(highlightClassName);
        messageHighlightTimeoutRef.current = null;
      }, prefersReducedMotion ? 120 : 720);

      return true;
    },
    [clearMessageMotionState, prefersReducedMotion]
  );

  const finishCloseFullViewImage = useCallback(() => {
    setFullViewImage(null);
    setIsFullViewImageClosing(false);
  }, []);

  const requestCloseFullViewImage = useCallback(() => {
    if (!fullViewImage) {
      return;
    }
    if (prefersReducedMotion) {
      finishCloseFullViewImage();
      return;
    }
    setIsFullViewImageClosing(true);
  }, [finishCloseFullViewImage, fullViewImage, prefersReducedMotion]);

  const openFullViewImage = useCallback((file: FamilyFile, previewUrl: string) => {
    setIsFullViewImageClosing(false);
    setFullViewImage({ file, previewUrl });
  }, []);

  const resetSwipeReplyState = useCallback(() => {
    swipeReplyGestureRef.current = null;
    setSwipeReplyState(null);
  }, []);

  const clearSelectedMessages = useCallback(() => {
    setSelectedMessageIds([]);
  }, []);

  const isMessageSelectionMode = selectedMessageIds.length > 0;

  const clearMessageLongPressGesture = useCallback(() => {
    if (messageLongPressRef.current) {
      window.clearTimeout(messageLongPressRef.current.timerId);
      messageLongPressRef.current = null;
    }
  }, []);

  const resetChatExitSwipeGesture = useCallback(() => {
    chatExitSwipeRef.current = null;
  }, []);

  const markNextMessageClickSuppressed = useCallback((messageId: string) => {
    suppressedMessageClickRef.current = {
      messageId,
      expiresAt: Date.now() + 900,
    };
  }, []);

  const consumeSuppressedMessageClick = useCallback((messageId: string) => {
    const current = suppressedMessageClickRef.current;
    if (!current) {
      return false;
    }
    if (current.expiresAt < Date.now()) {
      suppressedMessageClickRef.current = null;
      return false;
    }
    if (current.messageId !== messageId) {
      return false;
    }
    suppressedMessageClickRef.current = null;
    return true;
  }, []);

  const toggleSelectedMessage = useCallback((messageId: string) => {
    setSelectedMessageIds((current) =>
      current.includes(messageId)
        ? current.filter((candidate) => candidate !== messageId)
        : [...current, messageId]
    );
  }, []);

  const showMessageContextMenu = useCallback(
    (message: Message, x: number, y: number) => {
      resetSwipeReplyState();
      clearMessageLongPressGesture();
      clearSelectedMessages();
      setIsChatMenuOpen(false);
      setMessageContextMenu({
        message,
        x: Math.max(8, Math.min(x, window.innerWidth - MESSAGE_CONTEXT_MENU_WIDTH)),
        y: Math.max(8, Math.min(y, window.innerHeight - MESSAGE_CONTEXT_MENU_HEIGHT))
      });
    },
    [clearMessageLongPressGesture, clearSelectedMessages, resetSwipeReplyState]
  );

  const requestCloseActiveChatSurface = useCallback(() => {
    if (copySheetContent !== null) {
      setCopySheetContent(null);
      return true;
    }
    if (messageContextMenu) {
      setMessageContextMenu(null);
      return true;
    }
    if (isEmojiPickerOpen) {
      closeEmojiPicker();
      return true;
    }
    if (isChatMenuOpen) {
      setIsChatMenuOpen(false);
      return true;
    }
    if (isCallSettingsMenuOpen) {
      setIsCallSettingsMenuOpen(false);
      return true;
    }
    if (isCallAudioPopupOpen) {
      setIsCallAudioPopupOpen(false);
      return true;
    }
    if (isMessageSelectionMode) {
      clearSelectedMessages();
      return true;
    }
    if (isMessageSearchOpen) {
      setMessageSearch("");
      setIsMessageSearchOpen(false);
      return true;
    }
    if (forwardTarget) {
      setForwardTarget(null);
      return true;
    }
    if (deleteTarget) {
      setDeleteTarget(null);
      return true;
    }
    if (isDetailsOpen) {
      setIsDetailsOpen(false);
      return true;
    }
    if (chatId) {
      closeActiveChat();
      return true;
    }
    return false;
  }, [
    chatId,
    clearSelectedMessages,
    closeActiveChat,
    closeEmojiPicker,
    copySheetContent,
    deleteTarget,
    forwardTarget,
    isCallAudioPopupOpen,
    isCallSettingsMenuOpen,
    isChatMenuOpen,
    isDetailsOpen,
    isEmojiPickerOpen,
    isMessageSearchOpen,
    isMessageSelectionMode,
    messageContextMenu
  ]);

  const syncNativePictureInPictureCallState = useCallback(() => {
    const phase = callPhaseRef.current;
    if (phase !== "idle") {
      videoPictureInPictureActiveRef.current = false;
      setIsVideoPictureInPictureActive(false);
      try {
        activeSessionVideoElement()?.pause();
      } catch {
        // Detached media can reject a synchronous pause during route changes.
      }
    }
    if (!isNativeCallPluginAvailable()) return;

    const hasLiveSession = Boolean(activeCallSessionIdRef.current);
    const active = phase !== "idle" && hasLiveSession;
    const video = active && callTypeRef.current === "video";

    void setNativeActiveCallState({
      active,
      video,
      chatId: active ? activeCallChatIdRef.current : null,
      sessionId: active ? activeCallSessionIdRef.current : null,
    });
  }, []);

  const restoreActiveCallSurface = useCallback(() => {
    if (callPhaseRef.current === "idle") {
      return;
    }

    setIsCallMinimized(false);
    setIsDetailsOpen(false);

    const callChatId = activeCallChatIdRef.current;
    if (!callChatId || activeChatIdRef.current === callChatId) {
      return;
    }

    const callChat = chatsRef.current.find((candidate) => candidate.id === callChatId) ?? null;
    if (callChat) {
      setSelectedChat(callChat);
      const cachedMessages = messageCacheRef.current[callChat.id];
      if (cachedMessages) {
        setMessages(cachedMessages);
      }
    }

    navigateWithMotion(navigate, `/app/chats/${callChatId}`, {
      reducedMotion: prefersReducedMotion
    });
  }, [navigate, prefersReducedMotion]);

  const restoreActiveVideoSurface = useCallback((state: PictureInPictureState) => {
    const target = parseVideoPictureInPictureRestore(
      state,
      lastNativeVideoRevisionRef.current,
    );
    if (!target || !accessTokenRef.current) return;

    const targetChat = chatsRef.current.find(
      (candidate) => candidate.id === target.identity.chatId,
    );
    if (!targetChat) return;

    const cachedMessages =
      messageCacheRef.current[targetChat.id] ??
      (activeChatIdRef.current === targetChat.id ? messagesRef.current : null);
    if (!cachedMessages) return;
    const targetMessage = cachedMessages.find(
      (message) => message.id === target.identity.messageId,
    );
    const targetFile = targetMessage?.attachments.find(
      (file) => file.id === target.identity.fileId && file.mimeType.startsWith("video/"),
    );
    if (!targetMessage || targetMessage.chatId !== targetChat.id || !targetFile) return;

    const activeVideo = activeSessionVideoElement();
    const activeRoot = activeVideo?.closest<HTMLElement>(".video-player");
    if (
      activeVideo &&
      activeRoot?.dataset.videoChatId === target.identity.chatId &&
      activeRoot.dataset.videoMessageId === target.identity.messageId &&
      activeRoot.dataset.videoFileId === target.identity.fileId
    ) {
      try {
        activeVideo.currentTime = target.currentTime;
      } catch {
        // The retained coordinator snapshot restores again after metadata is ready.
      }
    }

    setSelectedChat(targetChat);
    setMessages(cachedMessages);
    setIsDetailsOpen(false);
    if (targetMessage.messageKind === "thread" && targetMessage.threadRootMessageId) {
      setThreadRootMessageId(targetMessage.threadRootMessageId);
    } else {
      setThreadRootMessageId(null);
    }
    pendingMessageFocusRef.current = {
      messageId: targetMessage.id,
      highlightClassName: "message-context-flash",
    };
    navigateWithMotion(
      navigate,
      `/app/chats/${encodeURIComponent(target.identity.chatId)}`,
      { reducedMotion: prefersReducedMotion },
    );
  }, [navigate, prefersReducedMotion]);

  const stopCallRingtone = useCallback(() => {
    callSoundPlayerRef.current.stopRingtone();
  }, []);

  const startIncomingRingtone = useCallback(() => {
    callSoundPlayerRef.current.startIncomingRingtone(() => soundDisabledRef.current);
  }, []);

  const startOutgoingRingtone = useCallback(() => {
    callSoundPlayerRef.current.startOutgoingRingtone(() => soundDisabledRef.current);
  }, []);

  const playCallEndSound = useCallback(() => {
    void callSoundPlayerRef.current.playCallEndSound(() => soundDisabledRef.current);
  }, []);

  useEffect(() => {
    soundDisabledRef.current = callAudioSettings.soundDisabled;
  }, [callAudioSettings.soundDisabled]);

  // On Android (Capacitor), proactively acquire the local media stream as soon
  // as an incoming call is displayed.  This triggers the OS permission dialog
  // while the user can still see the incoming-call screen, so that when they
  // tap Accept the stream is already ready and no second dialog appears.
  useEffect(() => {
    if (callPhase !== "incoming") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = typeof window !== "undefined" ? (window as any).Capacitor : undefined;
    if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return;
    void audioCallRef.current?.prepareForCall(callType).catch(() => undefined);
  }, [callPhase, callType]);

  const refreshCallAudioDevices = useCallback(async () => {
    const controller = audioCallRef.current;
    if (!controller) {
      return;
    }
    const devices = await controller.getAvailableDevices();
    setCallAudioDevices(devices);
  }, []);

  const applyCallAudioPatch = useCallback(async (patch: Partial<CallSettings>) => {
    const controller = audioCallRef.current;
    setCallAudioWarning(null);
    setCallAudioSettings((current) => ({ ...current, ...patch }));
    if (!controller) {
      return;
    }
    try {
      await controller.applySettings(patch);
    } catch (err) {
      setCallAudioWarning(
        err instanceof Error ? err.message : "Could not apply setting. Check permissions."
      );
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const media = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobileViewport(isMobileCallViewport());
    update();
    media.addEventListener("change", update);
    return () => {
      media.removeEventListener("change", update);
    };
  }, []);

  const directTargets = useMemo(
    () => members.filter((member) => member.id !== currentUser?.id),
    [members, currentUser?.id]
  );
  const filteredNewChatMembers = useMemo(() => {
    const query = newChatMemberSearch.trim().toLowerCase();
    if (!query) {
      return directTargets;
    }
    return directTargets.filter((member) => {
      const haystack = `${member.displayName} ${member.username ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [directTargets, newChatMemberSearch]);

  function openNewChatScreen() {
    setNewChatScreen("pick");
    setNewChatMemberSearch("");
    setGroupTitle("");
    setGroupMemberIds([]);
    setIsNewChatOpen(true);
  }

  function closeNewChatScreen() {
    setIsNewChatOpen(false);
    setNewChatScreen("pick");
    setNewChatMemberSearch("");
    setGroupTitle("");
    setGroupMemberIds([]);
  }

  const filteredChats = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    return chats.filter((chat) => {
      if (chatFilter === "groups" && chat.type !== "group" && chat.type !== "family") {
        return false;
      }
      if (chatFilter === "direct" && chat.type !== "direct") {
        return false;
      }
      if (chatFilter === "unread" && chat.unreadCount <= 0) {
        return false;
      }
      if (chatFilter === "muted" && !chat.isMuted) {
        return false;
      }
      if (!query) {
        return true;
      }
      const chatName = displayChatName(chat, currentUser?.id).toLowerCase();
      const memberText = chat.members
        .map((member) => `${member.displayName} ${member.username} ${member.role}`)
        .join(" ")
        .toLowerCase();
      return `${chatName} ${chat.type} ${memberText}`.includes(query);
    });
  }, [chatFilter, chatSearch, chats, currentUser?.id]);

  const chatsBySection = useMemo(() => {
    const sections: Record<ChatSectionKey, Chat[]> = {
      archive: [],
      dms: [],
      groups: [],
      channels: []
    };
    for (const chat of filteredChats) {
      if (chat.type === "archive") {
        sections.archive.push(chat);
      } else if (chat.type === "direct") {
        sections.dms.push(chat);
      } else if (chat.type === "channel") {
        sections.channels.push(chat);
      } else if (chat.type === "group" || chat.type === "family") {
        sections.groups.push(chat);
      }
    }
    return sections;
  }, [filteredChats]);

  const sharedAttachments = useMemo(
    () => messages.flatMap((message) => message.attachments).slice(-18).reverse(),
    [messages]
  );
  const sharedContentItems = useMemo(
    () => sharedAttachments.filter((file) => attachmentMatchesTab(file, detailsTab)),
    [detailsTab, sharedAttachments]
  );
  const searchedMessages = useMemo(() => {
    const query = messageSearch.trim();
    if (!query) {
      return messages;
    }
    return messages.filter((message) => {
      const attachmentText = message.attachments.map((file) => file.originalName).join(" ");
      return messageMatchesSearch(
        `${message.content ?? ""} ${message.senderDisplayName ?? ""} ${attachmentText}`,
        query,
        { wholeWord: wholeWordSearch, caseSensitive: caseSensitiveSearch }
      );
    });
  }, [caseSensitiveSearch, messageSearch, messages, wholeWordSearch]);
  const memberLookup = useMemo(() => {
    const lookup = new Map<string, { displayName: string; username?: string }>();
    for (const member of members) {
      lookup.set(member.id, member);
    }
    if (currentUser) {
      lookup.set(currentUser.id, currentUser);
    }
    return lookup;
  }, [currentUser, members]);

  const canManageSelectedChat = selectedChat ? canManageChat(selectedChat, currentUser) : false;
  const activeCallChat = useMemo(
    () => (activeCallChatId ? chats.find((chat) => chat.id === activeCallChatId) ?? null : null),
    [activeCallChatId, chats]
  );
  const activeCallPeerName = useMemo(() => {
    if (!currentUser || !callPeerUserId) {
      return "Unknown contact";
    }
    // Try selectedChat.members first — most up-to-date when the caller initiates
    if (selectedChat && selectedChat.id === activeCallChatId) {
      const m = selectedChat.members.find((candidate) => candidate.id === callPeerUserId);
      if (m?.displayName) return m.displayName;
    }
    if (activeCallChat) {
      const member = activeCallChat.members.find((candidate) => candidate.id === callPeerUserId);
      if (member?.displayName) {
        return member.displayName;
      }
    }
    const member = members.find((candidate) => candidate.id === callPeerUserId);
    return member?.displayName ?? "Unknown contact";
  }, [activeCallChat, activeCallChatId, callPeerUserId, currentUser, members, selectedChat]);
  const canPostInSelectedChannel = selectedChat ? canPostToChannel(selectedChat, currentUser) : false;
  const canCommentInSelectedChannel = Boolean(
    selectedChat &&
      selectedChat.type === "channel" &&
      !canPostInSelectedChannel &&
      selectedChat.commentsEnabled
  );
  const channelCommentsDisabledForViewer = Boolean(
    selectedChat &&
      selectedChat.type === "channel" &&
      !canPostInSelectedChannel &&
      !selectedChat.commentsEnabled
  );
  const requiresThreadToSend = canCommentInSelectedChannel;
  const missingCommentThread = requiresThreadToSend && !threadRootMessageId;
  const threadReplyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const message of messages) {
      if (message.messageKind !== "thread" || !message.threadRootMessageId) {
        continue;
      }
      counts.set(
        message.threadRootMessageId,
        (counts.get(message.threadRootMessageId) ?? 0) + 1
      );
    }
    return counts;
  }, [messages]);
  const threadRootMessage = useMemo(
    () => messages.find((message) => message.id === threadRootMessageId) ?? null,
    [messages, threadRootMessageId]
  );
  const visibleMessages = useMemo(() => {
    if (!threadRootMessageId) {
      return searchedMessages.filter((message) => message.messageKind !== "thread");
    }
    return searchedMessages.filter(
      (message) =>
        message.id === threadRootMessageId || message.threadRootMessageId === threadRootMessageId
    );
  }, [searchedMessages, threadRootMessageId]);
  const contextMenuCurrentReaction =
    messageContextMenu && currentUser
      ? messageContextMenu.message.reactions.find((reaction) =>
          reaction.userIds.includes(currentUser.id)
        ) ?? null
      : null;
  const contextMenuSeenBy = useMemo(() => {
    if (!messageContextMenu || !selectedChat || !isMultiMemberChat(selectedChat.type)) {
      return [];
    }
    const statusByUser = new Map<string, { createdAt: string }>();
    for (const status of messageContextMenu.message.statuses) {
      if (status.status !== "read") {
        continue;
      }
      const existing = statusByUser.get(status.userId);
      if (!existing || existing.createdAt < status.createdAt) {
        statusByUser.set(status.userId, { createdAt: status.createdAt });
      }
    }
    return Array.from(statusByUser.entries())
      .map(([userId, value]) => ({
        userId,
        displayName: memberLookup.get(userId)?.displayName ?? "Family member",
        createdAt: value.createdAt
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [memberLookup, messageContextMenu, selectedChat]);

  const applyMessagesForChat = useCallback(
    (targetChatId: string, nextState: MessageStateUpdate) => {
      const currentMessages =
        messageCacheRef.current[targetChatId] ??
        (activeChatIdRef.current === targetChatId ? messagesRef.current : []);
      const nextMessages =
        typeof nextState === "function"
          ? (nextState as (current: Message[]) => Message[])(currentMessages)
          : nextState;
      messageCacheRef.current[targetChatId] = nextMessages;
      if (activeChatIdRef.current === targetChatId) {
        setMessages(nextMessages);
      }
    },
    []
  );

  const markChatRead = useCallback(
    async (targetChatId: string, messageId: string) => {
      socketRef.current?.emit("message:read", {
        chatId: targetChatId,
        messageId
      });
      await authRequest<Message>(`/api/messages/${messageId}/read`, { method: "PATCH" }).catch(
        () => undefined
      );
      setChats((current) =>
        current.map((chat) => (chat.id === targetChatId ? { ...chat, unreadCount: 0 } : chat))
      );
      setSelectedChat((current) =>
        current?.id === targetChatId ? { ...current, unreadCount: 0 } : current
      );
      if (currentUser?.id) {
        applyMessagesForChat(targetChatId, (current) =>
          markMessagesReadThrough(current, {
            chatId: targetChatId,
            messageId,
            userId: currentUser.id
          })
        );
      }
    },
    [applyMessagesForChat, authRequest, currentUser?.id]
  );

  const loadOverview = useCallback(async () => {
    if (!accessTokenRef.current) {
      return;
    }

    const requestId = loadOverviewRequestRef.current + 1;
    loadOverviewRequestRef.current = requestId;
    const isCurrentRequest = () => loadOverviewRequestRef.current === requestId;

    if (!hasLoadedOverviewRef.current) {
      setIsLoading(true);
    }
    try {
      const [familyResult, memberResult, chatResult] = await Promise.all([
        authRequest<Family>("/api/family"),
        authRequest<User[]>("/api/family/members"),
        authRequest<Chat[]>("/api/chats")
      ]);
      if (!isCurrentRequest()) {
        return;
      }
      setFamily(familyResult);
      setMembers(memberResult);
      setChats(chatResult);
      hasLoadedOverviewRef.current = true;

      const currentChatId = activeChatIdRef.current;
      if (currentChatId) {
        const fallbackChat = chatResult.find((chat) => chat.id === currentChatId) ?? null;
        if (fallbackChat) {
          setSelectedChat((current) =>
            current?.id === fallbackChat.id ? { ...fallbackChat, ...current } : fallbackChat
          );
        }
      }
    } catch (err) {
      if (isCurrentRequest()) {
        setError(err instanceof ApiError ? String(err.message) : "Could not load chats");
      }
    } finally {
      if (isCurrentRequest()) {
        setIsLoading(false);
      }
    }
  }, [authRequest]);

  const loadSelectedChat = useCallback(
    async (requestedChatId: string | undefined, preserveVisibleMessages = false) => {
      if (!accessTokenRef.current) {
        return;
      }

      const requestId = loadChatRequestRef.current + 1;
      loadChatRequestRef.current = requestId;
      const isCurrentRequest = () => loadChatRequestRef.current === requestId;

      if (!requestedChatId) {
        setSelectedChat(null);
        setMessages([]);
        setPinnedMessages([]);
        setPinIndex(0);
        setIsChatLoading(false);
        return;
      }

      const fallbackChat = chatsRef.current.find((chat) => chat.id === requestedChatId) ?? null;
      if (fallbackChat) {
        setSelectedChat((current) =>
          current?.id === fallbackChat.id ? { ...fallbackChat, ...current } : fallbackChat
        );
      }

      const cachedMessages = messageCacheRef.current[requestedChatId];
      if (cachedMessages) {
        setMessages(cachedMessages);
      } else if (!preserveVisibleMessages) {
        setMessages([]);
      }
      setIsChatLoading(!cachedMessages);

      setPinIndex(0);

      try {
        const [chat, messageResult, pinsResult] = await Promise.all([
          authRequest<Chat>(`/api/chats/${requestedChatId}`),
          authRequest<Message[]>(`/api/chats/${requestedChatId}/messages?limit=50`),
          authRequest<PinnedMessage[]>(`/api/chats/${requestedChatId}/pins`).catch(() => [] as PinnedMessage[])
        ]);
        if (!isCurrentRequest()) {
          return;
        }
        const decryptedMessages = await decryptMessages(requestedChatId, messageResult, currentUser?.id);
        if (!isCurrentRequest()) {
          return;
        }
        setSelectedChat(chat);
        applyMessagesForChat(requestedChatId, decryptedMessages);
        const sortedPins = sortPinsByPosition(pinsResult);
        setPinnedMessages(sortedPins);
        setPinIndex(Math.max(0, sortedPins.length - 1));

        const latestMessage = decryptedMessages.at(-1);
        if (latestMessage) {
          setChats((current) =>
            current.map((item) =>
              item.id === requestedChatId ? applyMessagePreviewToChat(item, latestMessage) : item
            )
          );
          setSelectedChat((current) =>
            current?.id === requestedChatId
              ? { ...applyMessagePreviewToChat(current, latestMessage), unreadCount: 0 }
              : current
          );
        }
        if (latestMessage) {
          await markChatRead(requestedChatId, latestMessage.id);
        }
      } catch (err) {
        if (isCurrentRequest()) {
          setError(err instanceof ApiError ? String(err.message) : "Could not load messages");
        }
      } finally {
        if (isCurrentRequest()) {
          setIsChatLoading(false);
        }
      }
    },
    [applyMessagesForChat, authRequest, currentUser?.id, markChatRead]
  );

  const restoreActiveAudioSurface = useCallback(async (requestedIdentity?: AudioIdentity) => {
    const snapshot = audioPlaybackSession.getSnapshot();
    const identity = requestedIdentity ?? snapshot.identity;
    const accessToken = accessTokenRef.current;
    setAudioRestoreStatus("Opening audio message…");

    try {
      if (!identity || !accessToken || !currentUser?.id) {
        throw new Error("Audio restore is unavailable");
      }

      const targetChat = chatsRef.current.find((candidate) => candidate.id === identity.chatId);
      if (!targetChat) throw new Error("Audio chat is unavailable");

      let targetMessages =
        messageCacheRef.current[targetChat.id] ??
        (activeChatIdRef.current === targetChat.id ? messagesRef.current : null);
      if (!targetMessages) {
        const loaded = await getMessages(accessToken, targetChat.id, undefined, 100);
        targetMessages = await decryptMessages(targetChat.id, loaded, currentUser.id);
        messageCacheRef.current[targetChat.id] = targetMessages;
      }

      const authorized = validateAudioRestoreTarget(identity, [targetChat], targetMessages);
      if (!authorized) throw new Error("Audio target is unavailable");
      const targetMessage = targetMessages.find((message) => message.id === authorized.messageId);
      const targetFile = targetMessage?.attachments.find((file) => file.id === authorized.fileId);
      if (!targetMessage || !targetFile) throw new Error("Audio file is unavailable");

      if (snapshot.status === "authorization-required") {
        await audioPlaybackSession.load(
          { identity: authorized, title: targetFile.originalName },
          Math.max(0, Number.isFinite(snapshot.position) ? snapshot.position : 0)
        );
      }

      setSelectedChat(targetChat);
      setMessages(targetMessages);
      setIsDetailsOpen(false);
      pendingMessageFocusRef.current = {
        messageId: targetMessage.id,
        highlightClassName: "message-audio-context-flash"
      };
      navigateWithMotion(
        navigate,
        `/app/chats/${encodeURIComponent(authorized.chatId)}`,
        { reducedMotion: prefersReducedMotion }
      );
    } catch {
      await audioPlaybackSession.clear("authorization").catch(() => undefined);
      setError("This audio message is no longer available.");
    } finally {
      if (audioRestoreStatusTimerRef.current !== null) {
        window.clearTimeout(audioRestoreStatusTimerRef.current);
      }
      audioRestoreStatusTimerRef.current = window.setTimeout(() => {
        setAudioRestoreStatus(null);
        audioRestoreStatusTimerRef.current = null;
      }, 1200);
    }
  }, [currentUser?.id, navigate, prefersReducedMotion]);

  const syncCurrentView = useCallback(async () => {
    await loadOverview();
    await loadSelectedChat(activeChatIdRef.current, true);
  }, [loadOverview, loadSelectedChat]);
  const loadRef = useRef(syncCurrentView);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (new URLSearchParams(location.search).get("restoreAudio") !== "1" || !currentUser?.id) {
      return;
    }
    let cancelled = false;
    void restoreActiveAudioSurface().finally(() => {
      if (!cancelled) {
        navigate("/app/chats", { replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, location.search, navigate, restoreActiveAudioSurface]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }
    void (async () => {
      const publicKey = await ensureLocalEncryptionIdentity();
      if (publicKey !== currentUser.publicKey) {
        const updated = await authRequest<User>("/api/auth/me", {
          method: "PATCH",
          body: { publicKey }
        });
        updateCurrentUser(updated);
        setChats((current) =>
          current.map((chat) => ({
            ...chat,
            members: chat.members.map((member) =>
              member.id === updated.id ? { ...member, publicKey: updated.publicKey } : member
            )
          }))
        );
        setSelectedChat((chat) =>
          chat
            ? {
                ...chat,
                members: chat.members.map((member) =>
                  member.id === updated.id ? { ...member, publicKey: updated.publicKey } : member
                )
              }
            : chat
        );
      }
    })().catch(() => undefined);
  }, [authRequest, currentUser, updateCurrentUser]);

  useEffect(() => {
    void loadSelectedChat(chatId);
  }, [chatId, loadSelectedChat]);

  useEffect(() => {
    function updateOnlineState() {
      setIsOnline(navigator.onLine);
    }

    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);

    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    loadRef.current = syncCurrentView;
  }, [syncCurrentView]);

  useEffect(() => {
    activeChatIdRef.current = chatId;
    if (chatId) {
      void dismissChatNotifications(chatId);
    }
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      void App.getState()
        .then((state) => {
          socketRef.current?.emit("app:state", androidAppStatePayload(state.isActive, chatId));
        })
        .catch(() => undefined);
    }
  }, [chatId]);

  useEffect(() => {
    if (!chatId || selectedChat?.id !== chatId) {
      return;
    }
    const searchParams = new URLSearchParams(location.search);
    const requestedAction = searchParams.get("notificationAction");
    if (requestedAction !== "reply" && requestedAction !== "callback") {
      return;
    }
    const action = takePendingNotificationAction(chatId);
    if (!action || action.type !== requestedAction) {
      return;
    }
    const command = notificationActionCommand(action, selectedChat);
    if (!command) {
      return;
    }
    const actionId =
      searchParams.get("notificationActionId") ??
      `${requestedAction}:${chatId}:${action.type === "reply" ? action.text : ""}`;
    if (handledNotificationActionRef.current === actionId) {
      return;
    }
    handledNotificationActionRef.current = actionId;

    searchParams.delete("notificationAction");
    searchParams.delete("notificationActionId");
    navigate(
      {
        pathname: location.pathname,
        search: searchParams.toString() ? `?${searchParams.toString()}` : ""
      },
      { replace: true }
    );

    if (command.type === "reply") {
      void sendQueuedNotificationReply(command.text);
    } else if (command.type === "callback") {
      void startDirectCall("audio");
    }
  }, [chatId, location.pathname, location.search, navigate, selectedChat]);

  useEffect(() => {
    activeCallChatIdRef.current = activeCallChatId;
  }, [activeCallChatId]);
  useEffect(() => {
    callTypeRef.current = callType;
  }, [callType]);
  useEffect(() => {
    callPhaseRef.current = callPhase;
  }, [callPhase]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const nextUserId = currentUser?.id ?? null;
      const previousUserId = observedAudioUserIdRef.current;
      if (!nextUserId || !accessToken) {
        audioPlaybackSession.setSourceFactory(buildAudioSourceFactory(""));
        if (previousUserId) await audioPlaybackSession.clear("logout");
        observedAudioUserIdRef.current = null;
        return;
      }

      if (previousUserId && previousUserId !== nextUserId) {
        await audioPlaybackSession.clear("user-switch");
      }
      if (cancelled) return;
      observedAudioUserIdRef.current = nextUserId;
      audioPlaybackSession.setSourceFactory(buildAudioSourceFactory(accessToken));
      await audioPlaybackSession.connect();
    })().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [accessToken, currentUser?.id]);

  useEffect(() => {
    return audioPlaybackSession.subscribe(() => {
      const snapshot = audioPlaybackSession.getSnapshot();
      if (
        snapshot.revision <= lastAudioVideoArbitrationRevisionRef.current ||
        !snapshot.identity ||
        snapshot.suppressionReason !== null ||
        (!snapshot.isPlaying && !snapshot.playWhenReady)
      ) {
        return;
      }
      lastAudioVideoArbitrationRevisionRef.current = snapshot.revision;
      videoPlaybackSession.pauseActive();
    });
  }, []);

  useEffect(() => {
    return () => {
      if (audioRestoreStatusTimerRef.current !== null) {
        window.clearTimeout(audioRestoreStatusTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    void (async () => {
      if (callPhase !== "idle") {
        videoPlaybackSession.pauseActive();
        await audioPlaybackSession.setCallActive(true);
        return;
      }
      await audioPlaybackSession.setCallActive(false);
    })().catch(() => undefined);
  }, [callPhase]);
  useEffect(() => {
    if (!currentUser?.id) return;

    let disposed = false;
    let throttleTimer: number | null = null;
    let pendingUpdate: ReturnType<typeof toNativeVideoPictureInPictureState> | null = null;
    let previousUpdate: ReturnType<typeof toNativeVideoPictureInPictureState> | null = null;

    const sendUpdate = (
      update: ReturnType<typeof toNativeVideoPictureInPictureState>,
    ) => {
      if (disposed) return;
      lastNativeVideoRevisionRef.current = Math.max(
        lastNativeVideoRevisionRef.current,
        update.revision,
      );
      previousUpdate = update;
      if (!isNativeCallPluginAvailable()) return;
      void setNativeActiveVideoState(update).then((state) => {
        if (!state || disposed) return;
        lastNativeVideoRevisionRef.current = Math.max(
          lastNativeVideoRevisionRef.current,
          state.acceptedRevision,
        );
      });
    };

    const publish = () => {
      const snapshot = videoPlaybackSession.getSnapshot();
      if (!snapshot) {
        if (throttleTimer !== null) window.clearTimeout(throttleTimer);
        throttleTimer = null;
        pendingUpdate = null;
        if (videoPictureInPictureActiveRef.current) {
          videoPictureInPictureActiveRef.current = false;
          setIsVideoPictureInPictureActive(false);
        }
      }
      const element = activeSessionVideoElement();
      const update = toNativeVideoPictureInPictureState(
        snapshot,
        {
          width: element?.videoWidth ?? 0,
          height: element?.videoHeight ?? 0,
        },
        lastNativeVideoRevisionRef.current + 1,
      );
      if (callPhaseRef.current !== "idle") update.playing = false;

      const positionOnly = Boolean(
        previousUpdate &&
        update.active === previousUpdate.active &&
        update.playing === previousUpdate.playing &&
        update.chatId === previousUpdate.chatId &&
        update.messageId === previousUpdate.messageId &&
        update.fileId === previousUpdate.fileId &&
        update.durationSeconds === previousUpdate.durationSeconds &&
        update.width === previousUpdate.width &&
        update.height === previousUpdate.height &&
        Math.abs(update.positionSeconds - previousUpdate.positionSeconds) < 2,
      );

      if (!positionOnly) {
        if (throttleTimer !== null) window.clearTimeout(throttleTimer);
        throttleTimer = null;
        pendingUpdate = null;
        sendUpdate(update);
        return;
      }

      pendingUpdate = update;
      if (throttleTimer !== null) return;
      throttleTimer = window.setTimeout(() => {
        throttleTimer = null;
        const latest = pendingUpdate;
        pendingUpdate = null;
        if (latest) sendUpdate(latest);
      }, 500);
    };

    const unsubscribe = videoPlaybackSession.subscribe(publish);
    publish();
    return () => {
      disposed = true;
      unsubscribe();
      if (throttleTimer !== null) window.clearTimeout(throttleTimer);
      videoPictureInPictureActiveRef.current = false;
      const inactive = toNativeVideoPictureInPictureState(
        null,
        undefined,
        lastNativeVideoRevisionRef.current + 1,
      );
      lastNativeVideoRevisionRef.current = inactive.revision;
      void setNativeActiveVideoState(inactive);
      videoPlaybackSession.reset();
    };
  }, [currentUser?.id]);
  useEffect(() => {
    syncNativePictureInPictureCallState();
  }, [activeCallChatId, callPhase, callType, syncNativePictureInPictureCallState]);
  useEffect(() => {
    accessTokenRef.current = accessToken;
    const socket = socketRef.current;
    if (socket && accessToken) {
      socket.auth = { token: accessToken };
      const query =
        socket.io.opts.query && typeof socket.io.opts.query === "object"
          ? { ...(socket.io.opts.query as Record<string, string>) }
          : {};
      query.token = accessToken;
      socket.io.opts.query = query;
    }
    audioCallRef.current?.updateAccessToken(accessToken ?? "");
  }, [accessToken]);

  useEffect(() => {
    if (isLoading || chatId || chats.length === 0 || isMobileViewport) {
      return;
    }
    openChat(chats[0]);
  }, [chatId, chats, isLoading, isMobileViewport]);

  const prevChatIdRef = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (!selectedChat || messages.length === 0 || messageSearch.trim()) {
      return;
    }
    const panel = messagesPanelRef.current;
    if (!panel) return;
    const chatChanged = prevChatIdRef.current !== selectedChat.id;
    prevChatIdRef.current = selectedChat.id;
    // Always jump to bottom when switching chats; also on new messages if already near bottom
    if (chatChanged) {
      panel.scrollTop = panel.scrollHeight;
    } else {
      const distanceFromBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight;
      if (distanceFromBottom < 120) {
        panel.scrollTop = panel.scrollHeight;
      }
    }
  }, [selectedChat?.id, messages.length, messageSearch]);

  useEffect(() => {
    const pendingFocus = pendingMessageFocusRef.current;
    if (!pendingFocus) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (focusMessageInPanel(pendingFocus)) {
        pendingMessageFocusRef.current = null;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusMessageInPanel, visibleMessages, messages.length, threadRootMessageId]);

  // Update active pin index based on scroll position (TG-style: active = nearest pin above viewport)
  useEffect(() => {
    const panel = messagesPanelRef.current;
    if (!panel || pinnedMessages.length <= 1) return;
    let rafId: number | undefined;
    function handlePinScroll() {
      if (pinClickScrollingRef.current) return;
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const panelRect = panel!.getBoundingClientRect();
        // Find the highest-index (newest/lowest in chat) pin whose element is still at or below the viewport top
        // That's the next pin you'll encounter scrolling up
        let newIndex = pinnedMessages.length - 1;
        for (let i = pinnedMessages.length - 1; i >= 0; i--) {
          const el = document.getElementById(pinnedMessages[i].messageId);
          if (!el) continue;
          if (el.getBoundingClientRect().bottom >= panelRect.top) {
            newIndex = i;
            break;
          }
        }
        setPinIndex(newIndex);
      });
    }
    panel.addEventListener("scroll", handlePinScroll, { passive: true });
    return () => {
      panel.removeEventListener("scroll", handlePinScroll);
      if (rafId !== undefined) cancelAnimationFrame(rafId);
    };
  }, [pinnedMessages]);

  useEffect(() => {
    function syncWhenVisible() {
      if (document.visibilityState === "visible") {
        void loadRef.current();
      }
    }

    document.addEventListener("visibilitychange", syncWhenVisible);
    window.addEventListener("focus", syncWhenVisible);

    return () => {
      document.removeEventListener("visibilitychange", syncWhenVisible);
      window.removeEventListener("focus", syncWhenVisible);
    };
  }, []);

  useEffect(() => {
    setChatTitleDraft(selectedChat ? displayChatName(selectedChat, currentUser?.id) : "");
  }, [currentUser?.id, selectedChat]);

  useEffect(() => {
    clearComposerFormattingSelection();
    setPendingAttachments([]);
    cancelVoiceRecording();
    setTypingNames([]);
    setMessageSearch("");
    setIsMessageSearchOpen(false);
    setIsChatMenuOpen(false);
    closeEmojiPicker();
    setMessageContextMenu(null);
    setSelectedMessageIds([]);
    setReplyTarget(null);
    setThreadRootMessageId(null);
    setForwardTarget(null);
    setEditTargetMessage(null);
    draftBeforeEditRef.current = "";
    setDeleteTarget(null);
    setFullViewImage(null);
    setDetailsTab("media");
    const draft = chatId ? (window.localStorage.getItem(`stovo:draft:${chatId}`) ?? "") : "";
    setComposer(draft);
  }, [chatId]);

  // Auto-minimize the call popup when the user opens a different chat
  useEffect(() => {
    if (activeCallChatId && chatId && activeCallChatId !== chatId && callPhase !== "idle") {
      setIsCallMinimized(true);
    }
  }, [chatId, activeCallChatId, callPhase]);

  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent) {
      if (!chatMenuRef.current?.contains(event.target as Node)) {
        setIsChatMenuOpen(false);
      }
      if (
        !Capacitor.isNativePlatform() &&
        !emojiPickerRef.current?.contains(event.target as Node) &&
        !emojiPickerDockRef.current?.contains(event.target as Node)
      ) {
        closeEmojiPicker();
      }
      setMessageContextMenu(null);
      if (
        !callSettingsMenuRef.current?.contains(event.target as Node) &&
        !callSettingsButtonRef.current?.contains(event.target as Node)
      ) {
        setIsCallSettingsMenuOpen(false);
      }
      if (
        !callAudioPopupRef.current?.contains(event.target as Node) &&
        !callSettingsButtonRef.current?.contains(event.target as Node)
      ) {
        setIsCallAudioPopupOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      if (isNewChatOpen && newChatScreen !== "pick") {
        setNewChatScreen("pick");
        setNewChatMemberSearch("");
        return;
      }
      if (isMessageSelectionMode) {
        clearSelectedMessages();
        return;
      }
      setIsChatMenuOpen(false);
      closeEmojiPicker();
      setIsMessageSearchOpen(false);
      if (isNewChatOpen) {
        closeNewChatScreen();
      }
      requestCloseFullViewImage();
      setMessageContextMenu(null);
      setForwardTarget(null);
      setIsCallSettingsMenuOpen(false);
      setIsCallAudioPopupOpen(false);
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    clearSelectedMessages,
    closeNewChatScreen,
    isMessageSelectionMode,
    isNewChatOpen,
    newChatScreen,
    requestCloseFullViewImage
  ]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return undefined;
    }

    let disposed = false;
    let listener: { remove: () => Promise<void> } | null = null;

    void (async () => {
      listener = await App.addListener("backButton", ({ canGoBack }) => {
        if (fullViewImage) {
          requestCloseFullViewImage();
          return;
        }
        if (copySheetContent !== null) {
          setCopySheetContent(null);
          return;
        }
        if (messageContextMenu) {
          setMessageContextMenu(null);
          return;
        }
        if (isEmojiPickerOpen) {
          closeEmojiPicker();
          return;
        }
        if (isChatMenuOpen) {
          setIsChatMenuOpen(false);
          return;
        }
        if (isCallSettingsMenuOpen) {
          setIsCallSettingsMenuOpen(false);
          return;
        }
        if (isCallAudioPopupOpen) {
          setIsCallAudioPopupOpen(false);
          return;
        }
        if (isMessageSearchOpen) {
          setIsMessageSearchOpen(false);
          return;
        }
        if (forwardTarget) {
          setForwardTarget(null);
          return;
        }
        if (deleteTarget) {
          setDeleteTarget(null);
          return;
        }
        if (isNewChatOpen && newChatScreen !== "pick") {
          setNewChatScreen("pick");
          setNewChatMemberSearch("");
          return;
        }
        if (isNewChatOpen) {
          closeNewChatScreen();
          return;
        }
        if (requestCloseActiveChatSurface()) {
          return;
        }
        if (canGoBack) {
          navigate(-1);
          return;
        }
        void App.minimizeApp();
      });

      if (disposed) {
        void listener.remove();
      }
    })();

    return () => {
      disposed = true;
      void listener?.remove();
    };
  }, [
    chatId,
    closeNewChatScreen,
    copySheetContent,
    deleteTarget,
    forwardTarget,
    fullViewImage,
    isCallAudioPopupOpen,
    isCallSettingsMenuOpen,
    isChatMenuOpen,
    isDetailsOpen,
    isEmojiPickerOpen,
    isMessageSearchOpen,
    isMessageSelectionMode,
    isNewChatOpen,
    messageContextMenu,
    newChatScreen,
    requestCloseActiveChatSurface,
    requestCloseFullViewImage
  ]);

  useEffect(() => {
    resetSwipeReplyState();
    clearMessageLongPressGesture();
    resetChatExitSwipeGesture();
  }, [
    chatId,
    clearMessageLongPressGesture,
    messageContextMenu,
    resetChatExitSwipeGesture,
    resetSwipeReplyState
  ]);

  useEffect(() => () => clearMessageMotionState(), [clearMessageMotionState]);

  useEffect(() => {
    if (!accessToken || !currentUser?.id) {
      return;
    }

    const isNative = Capacitor.isNativePlatform();
    const transports: Array<"polling" | "websocket"> = preferPollingFirst(window.location.hostname)
      ? ["polling", "websocket"]
      : ["websocket", "polling"];

    const socket = io(getApiUrl(), {
      path: "/socket.io",
      auth: { token: accessToken },
      query: { token: accessToken },
      transports,
      // On native Android/iOS, prevent the polling→WebSocket upgrade. The upgrade
      // causes a brief disconnect window on every app launch — any call:start emitted
      // during that window lands on an unstable server session, causing the first call
      // to fail while subsequent calls (on the stable WebSocket) succeed.
      upgrade: !isNative,
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity
    });
    socketRef.current = socket;
    const audioController = new CallController(socket, accessToken);
    audioController.attachRemoteAudioElement(remoteAudioRef.current);
    audioController.onVideoUnavailable = () => {
      setCallType("audio");
      setCallNotice("Camera not available — continuing with audio only");
    };
    audioController.onConnectionFailed = () => {
      console.error("[CALL] onConnectionFailed fired callPhase=", callPhaseRef.current, "activeSession=", activeCallSessionIdRef.current);
      if (callPhaseRef.current === "idle") return;
      void resetCallState("Call connection lost");
    };
    audioController.onConnectionEstablished = () => {
      console.log("[CALL] onConnectionEstablished fired callPhase=", callPhaseRef.current);
      setCallPhase("in-call");
      if (callTypeRef.current === "video") {
        void applyCallAudioPatch({ speakerMode: "large" });
      }
    };
    // When the remote party enables their camera mid-call, show the video UI
    // on the receiving side without requiring the local user to act.
    audioController.onRemoteVideoTrack = (stream: MediaStream) => {
      setCallType("video");
      setHasRemoteVideo(true);
      setRemoteVideoStream(stream);
    };
    audioController.onLocalStreamReady = (stream: MediaStream) => {
      if (hasLiveLocalVideo(stream)) {
        setLocalVideoStream(stream);
      }
    };
    audioController.onSpeakingChange(setIsPeerSpeaking);
    setCallAudioCapabilities(audioController.getCapabilities());
    setCallAudioSettings(audioController.getSettings());
    audioCallRef.current = audioController;
    let audioSettingsCancelled = false;
    void getAudioSettings(accessToken)
      .then((saved) => {
        if (audioSettingsCancelled) return;
        const merged = mergeWithDefaults(saved);
        setCallAudioSettings((cur) => ({ ...cur, ...merged }));
        return audioController.applySettings(merged);
      })
      .catch(() => undefined);

    // Track foreground/background state on Android so the backend can decide
    // whether to suppress ntfy push notifications (only suppress when in foreground).
    let appStateListener: { remove: () => Promise<void> } | null = null;
    let appStateCancelled = false;
    let removePictureInPictureListener: (() => void) | null = null;
    let removePictureInPictureActionListener: (() => void) | null = null;
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      void (async () => {
        try {
          const currentState = await App.getState();
          if (!appStateCancelled) {
            socket.emit("app:state", androidAppStatePayload(currentState.isActive, activeChatIdRef.current));
            if (currentState.isActive && activeChatIdRef.current) {
              void dismissChatNotifications(activeChatIdRef.current);
            }
          }
          const listener = await App.addListener("appStateChange", (state: AppState) => {
            socket.emit("app:state", androidAppStatePayload(state.isActive, activeChatIdRef.current));
            if (state.isActive && activeChatIdRef.current) {
              void dismissChatNotifications(activeChatIdRef.current);
            }
          });
          if (appStateCancelled) {
            void listener.remove();
          } else {
            appStateListener = listener;
          }
        } catch {
          // Non-critical: if app state tracking fails, ntfy will fire as fallback.
        }
      })();

      void addPictureInPictureListener((state) => {
        pictureInPictureActiveRef.current = state.active;
        if (Number.isSafeInteger(state.acceptedRevision) && state.acceptedRevision >= 0) {
          lastNativeVideoRevisionRef.current = Math.max(
            lastNativeVideoRevisionRef.current,
            state.acceptedRevision,
          );
        }
        if (state.active) {
          const videoOwner = state.owner === "video";
          videoPictureInPictureActiveRef.current = videoOwner;
          setIsVideoPictureInPictureActive(videoOwner);
          setIsCallMinimized(false);
          return;
        }
        videoPictureInPictureActiveRef.current = false;
        setIsVideoPictureInPictureActive(false);
        if (state.owner === "video") {
          restoreActiveVideoSurface(state);
        } else if (state.owner === "call" && callPhaseRef.current !== "idle") {
          restoreActiveCallSurface();
        }
      }).then((remove) => {
        if (appStateCancelled) {
          remove();
        } else {
          removePictureInPictureListener = remove;
        }
      });

      void addPictureInPictureActionListener((event) => {
        if (callPhaseRef.current !== "idle") return;
        const snapshot = videoPlaybackSession.getSnapshot();
        const action = applyPictureInPictureAction(
          event,
          snapshot,
          lastNativeVideoRevisionRef.current,
        );
        const element = activeSessionVideoElement();
        if (!action || !element) return;

        try {
          switch (action.type) {
            case "play":
              void audioPlaybackSession
                .pauseForVideo()
                .then(() => element.play())
                .catch(() => undefined);
              break;
            case "pause":
              element.pause();
              break;
            case "seek":
              element.currentTime = action.currentTime;
              break;
            case "mute":
              break;
          }
        } catch {
          // A detached or not-yet-seekable element safely ignores stale actions.
        }
      }).then((remove) => {
        if (appStateCancelled) {
          remove();
        } else {
          removePictureInPictureActionListener = remove;
        }
      });
    }

    const syncAfterSocketResume = () => {
      void loadRef.current();
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
        void App.getState()
          .then((state) => {
            socket.emit("app:state", androidAppStatePayload(state.isActive, activeChatIdRef.current));
          })
          .catch(() => undefined);
      }
    };

    socket.on("connect", syncAfterSocketResume);
    socket.on("connect_error", syncAfterSocketResume);
    socket.io.on("reconnect", syncAfterSocketResume);
    socket.on("sync:needed", syncAfterSocketResume);

    socket.on("message:new", (message: Message) => {
      void (async () => {
      const displayMessage = await decryptMessage(message.chatId, message, currentUser?.id);
      const hasKnownChat = chatsRef.current.some((chat) => chat.id === message.chatId);
      const isActiveChat = message.chatId === activeChatIdRef.current;
      const isMine = message.senderId === currentUser?.id;
      setChats((current) =>
        current.map((chat) => {
          if (chat.id !== message.chatId) {
            return chat;
          }
          const updated = applyMessagePreviewToChat(chat, displayMessage);
          return {
            ...updated,
            unreadCount: isActiveChat || isMine ? 0 : chat.unreadCount + 1
          };
        })
      );
      if (!hasKnownChat) {
        void loadRef.current();
      }
      if (isActiveChat) {
        setSelectedChat((current) =>
          current?.id === message.chatId
            ? { ...applyMessagePreviewToChat(current, displayMessage), unreadCount: 0 }
            : current
        );
        applyMessagesForChat(message.chatId, (current) => mergeIncomingMessage(current, displayMessage));
        socket.emit("message:read", { chatId: displayMessage.chatId, messageId: displayMessage.id });
      } else {
        applyMessagesForChat(message.chatId, (current) => mergeIncomingMessage(current, displayMessage));
      }
      })();
    });

    socket.on("message:updated", (message: Message) => {
      void (async () => {
        if (message.chatId !== activeChatIdRef.current) {
          return;
        }
        const displayMessage = await decryptMessage(message.chatId, message, currentUser?.id);
        applyMessagesForChat(message.chatId, (current) => replaceMessage(current, displayMessage));
      })();
    });

    socket.on("message:deleted", (payload: { messageId: string; chatId: string }) => {
      applyMessagesForChat(payload.chatId, (current) =>
        current.filter((m) => m.id !== payload.messageId)
      );
      setChats((current) =>
        current.map((chat) => {
          if (chat.id !== payload.chatId || chat.lastMessageId !== payload.messageId) {
            return chat;
          }
          return {
            ...chat,
            lastMessageId: null,
            lastMessageSenderId: null,
            lastMessageSenderDisplayName: null,
            lastMessageContent: null,
            lastMessageType: null,
            lastMessageCreatedAt: null
          };
        })
      );
      setMessageContextMenu((current) =>
        current?.message.id === payload.messageId ? null : current
      );
      setEditTargetMessage((current) => {
        if (current?.id === payload.messageId) {
          draftBeforeEditRef.current = "";
          return null;
        }
        return current;
      });
    });

    socket.on("message:pinned", (pin: PinnedMessage) => {
      if (pin.chatId !== activeChatIdRef.current) {
        return;
      }
      setPinnedMessages((current) => {
        const withoutDup = current.filter((p) => p.messageId !== pin.messageId);
        const sorted = sortPinsByPosition([...withoutDup, pin]);
        setPinIndex(sorted.length - 1);
        return sorted;
      });
    });

    socket.on("message:unpinned", (payload: { chatId: string; messageId: string }) => {
      if (payload.chatId !== activeChatIdRef.current) {
        return;
      }
      setPinnedMessages((current) => {
        const updated = current.filter((p) => p.messageId !== payload.messageId);
        setPinIndex((idx) => (idx >= updated.length ? Math.max(0, updated.length - 1) : idx));
        return updated;
      });
    });

    socket.on(
      "message:delivered",
      (payload: { messageId: string; chatId: string; userIds?: string[] }) => {
        applyMessagesForChat(payload.chatId, (current) => markMessageDelivered(current, payload));
      }
    );

    socket.on("message:read", (payload: { messageId: string; chatId: string; userId: string }) => {
      if (payload.userId === currentUser?.id) {
        setChats((current) =>
          current.map((chat) =>
            chat.id === payload.chatId ? { ...chat, unreadCount: 0 } : chat
          )
        );
        setSelectedChat((current) =>
          current?.id === payload.chatId ? { ...current, unreadCount: 0 } : current
        );
      }
      applyMessagesForChat(payload.chatId, (current) => markMessagesReadThrough(current, payload));
    });

    socket.on(
      "typing:update",
      (payload: { chatId: string; userId: string; displayName: string; isTyping: boolean }) => {
        if (payload.chatId !== activeChatIdRef.current || payload.userId === currentUser?.id) {
          return;
        }
        setTypingNames((current) => {
          const withoutName = current.filter((name) => name !== payload.displayName);
          return payload.isTyping ? [...withoutName, payload.displayName] : withoutName;
        });
        if (payload.isTyping) {
          window.setTimeout(() => {
            setTypingNames((current) => current.filter((name) => name !== payload.displayName));
          }, 5000);
        }
      }
    );

    socket.on("error", (payload: { clientMessageId?: string; message?: string }) => {
      if (payload.clientMessageId) {
        const activeChatId = activeChatIdRef.current;
        if (activeChatId) {
          applyMessagesForChat(activeChatId, (current) =>
            markPendingMessageFailed(
              current,
              payload.clientMessageId as string,
              payload.message ?? "Message failed"
            )
          );
        }
      }
      const message = payload.message ?? "Realtime connection error";
      if (!isSuppressedUserError(message)) {
        setError(message);
      }
    });

    socket.on(
      "call:ringing",
      (payload: { chatId: string; callerId: string; calleeId: string; callType?: string; expiresAt?: string; createdAt?: string }) => {
        console.log("[call:ringing] received", payload, "selfId=", currentUser?.id);
        const selfUserId = currentUser?.id ?? null;
        const isCaller = selfUserId !== null && payload.callerId === selfUserId;
        // Guard against stale queued call:ringing events from previous sessions
        // overwriting the active session state. Without this guard, a stale
        // call:ringing (from a session where Android was callee while offline) can
        // corrupt activeCallSessionIdRef.current, causing the subsequent stale
        // call:timeout in the same drain batch to pass the session guard and
        // kill the current call.
        //
        // Allow through if:
        //   (a) No active call (idle) — always process incoming call:ringing
        //   (b) isCaller=true AND activeCallSessionIdRef.current === "pending"
        //       → This is our own outgoing call:ringing being confirmed; update session ID
        //   (c) payload.createdAt matches the current activeCallSessionIdRef.current
        //       → Re-emit of the current session on socket reconnect; safe to process
        if (callPhaseRef.current !== "idle") {
          // (b) Confirm this is our own outgoing call:ringing: must be isCaller=true,
          // session ID must still be "pending" (not yet assigned), AND the chatId must
          // match the current call's chatId.
          //
          // The chatId check is an extra defence: without it, a stale call:ringing from
          // a DIFFERENT chat (where Android was caller and the event was queued via the
          // polling→WebSocket upgrade transport race) would also satisfy
          // (isCaller=true && ref==="pending") and corrupt the session ID.
          //
          // Limitation: a stale caller call:ringing for the SAME chatId still passes
          // this guard, because we have no per-session identifier until call:ringing
          // provides one. That scenario (same chat, same caller, queued via transport race)
          // is mitigated by the fact that drainPendingEvents completes before the server
          // processes the new call:start — so the real call:ringing for the new session
          // always arrives AFTER the drain. If the stale event does corrupt the ref, the
          // real call:ringing will be blocked; the call will time out naturally on the
          // server and resetCallState will handle cleanup.
          const isPendingOutgoingConfirm =
            isCaller &&
            activeCallSessionIdRef.current === "pending" &&
            payload.chatId === activeCallChatIdRef.current;
          const isCurrentSessionReemit =
            payload.createdAt && payload.createdAt === activeCallSessionIdRef.current;
          if (!isPendingOutgoingConfirm && !isCurrentSessionReemit) {
            console.log("[call:ringing] ignoring stale event — active session mismatch",
              "payload.createdAt=", payload.createdAt,
              "payload.chatId=", payload.chatId,
              "activeSession=", activeCallSessionIdRef.current,
              "activeChat=", activeCallChatIdRef.current);
            return;
          }
        }
        const incomingCallType: "audio" | "video" = payload.callType === "video" ? "video" : "audio";
        setCallType(incomingCallType);
        setActiveCallChatId(payload.chatId);
        // Sync ref immediately so call:accepted guard sees the chatId before React re-renders
        activeCallChatIdRef.current = payload.chatId;
        // Store per-session identifier so termination events from a previous call session
        // for the same chatId (stale events queued while Android was offline) can be
        // rejected without affecting the current session.
        if (payload.createdAt) {
          activeCallSessionIdRef.current = payload.createdAt;
        }
        setCallPeerUserId(isCaller ? payload.calleeId : payload.callerId);
        if (isCaller) {
          console.log("[CALL] call:ringing: isCaller=true — transitioning to outgoing, sessionId=", payload.createdAt);
          setCallPhase("outgoing");
        } else {
          console.log("[CALL] call:ringing: isCaller=false — transitioning to incoming, sessionId=", payload.createdAt);
          setCallPhase("incoming");
          setCallNotice(incomingCallType === "video" ? "Incoming video call" : "Incoming audio call");
          startIncomingRingtone();
        }
      }
    );

    socket.on("call:accepted", (payload: { chatId: string; callerId: string; calleeId: string; callType?: string; sessionStartedAt?: string }) => {
      console.log("[call:accepted] chatId=", payload.chatId, "ref=", activeCallChatIdRef.current, "currentUser=", currentUser?.id);
      if (!currentUser || payload.chatId !== activeCallChatIdRef.current) {
        console.warn("[call:accepted] GUARD FAILED — bailing. currentUser=", !!currentUser, "chatMatch=", payload.chatId === activeCallChatIdRef.current);
        return;
      }
      stopCallRingtone();
      const peerId = payload.callerId === currentUser.id ? payload.calleeId : payload.callerId;
      const acceptedCallType: "audio" | "video" = payload.callType === "video" ? "video" : "audio";
      if (payload.sessionStartedAt) {
        activeCallSessionIdRef.current = payload.sessionStartedAt;
      }
      setCallPeerUserId(peerId);
      setCallType(acceptedCallType);
      callTypeRef.current = acceptedCallType;
      setCallPhase("connecting");
      if (payload.callerId === currentUser.id) {
        console.log("[call:accepted] caller path — calling startOutgoing");
        void audioController
          .startOutgoing(payload.chatId, peerId, acceptedCallType)
          .then(() => { console.log("[call:accepted] startOutgoing resolved — waiting for ICE"); })
          .catch(async (err) => {
            console.error("[call:accepted] startOutgoing threw:", err);
            if (socket.connected) socket.emit("call:end", { chatId: payload.chatId });
            // We already emitted call:end above; cleanup should not re-emit.
            await resetCallState("Camera/mic permission or device failed", true, false);
            setError(err instanceof Error ? err.message : "Could not start call");
          });
      } else {
        console.log("[call:accepted] callee path — waiting for ICE");
      }
    });

    socket.on(
      "call:signal",
      (payload: { chatId: string; fromUserId: string; data: Record<string, unknown> }) => {
        void audioController.handleSignal(payload as { chatId: string; fromUserId: string; data: Record<string, unknown> }).catch((err) => {
          setError(err instanceof Error ? err.message : "Call signaling failed");
        });
      }
    );

    // Session-aware guard for all termination events.
    // Stale events from a previous call session for the SAME chatId are rejected
    // when sessionStartedAt doesn't match the active session (stored on call:ringing).
    // Fail-closed: if activeCallSessionIdRef is set but the event has no sessionStartedAt,
    // the event is treated as stale (handles events queued before the server-side fix).
    function isSessionMismatch(p: { sessionStartedAt?: string; chatId?: string }) {
      if (callPhaseRef.current === "idle") {
        console.log("[CALL] isSessionMismatch: MISMATCH — callPhase is idle");
        return true; // not in a call
      }
      if (p.chatId && activeCallChatIdRef.current && p.chatId !== activeCallChatIdRef.current) {
        console.log("[CALL] isSessionMismatch: MISMATCH — chatId", p.chatId, "!== activeCallChatId", activeCallChatIdRef.current);
        return true; // wrong chat
      }
      if (activeCallSessionIdRef.current) {
        if (!p.sessionStartedAt || p.sessionStartedAt !== activeCallSessionIdRef.current) {
          console.log("[CALL] isSessionMismatch: MISMATCH — sessionStartedAt", p.sessionStartedAt, "!== activeSession", activeCallSessionIdRef.current);
          return true; // stale or untagged session
        }
      }
      console.log("[CALL] isSessionMismatch: PASS — event is for current session");
      return false;
    }

    socket.on("call:declined", (payload: { chatId?: string; sessionStartedAt?: string }) => {
      console.log("[CALL] call:declined received chatId=", payload?.chatId, "sessionStartedAt=", payload?.sessionStartedAt, "activeSession=", activeCallSessionIdRef.current, "callPhase=", callPhaseRef.current);
      // Guard against stale queued events from previous calls being delivered
      // via drainPendingEvents on socket reconnect killing a newly started call.
      if (isSessionMismatch(payload)) {
        console.log("[CALL] call:declined ignored — session mismatch or idle");
        return;
      }
      console.log("[CALL] call:declined: resetting call state");
      stopCallRingtone();
      // Server already ended the session — pass serverAlreadyNotified=true so
      // cleanup() does not send a redundant call:end that would produce a
      // spurious call:error response.
      void resetCallState("Call declined", true);
    });
    socket.on("call:canceled", (payload: { chatId?: string; sessionStartedAt?: string }) => {
      console.log("[CALL] call:canceled received chatId=", payload?.chatId, "sessionStartedAt=", payload?.sessionStartedAt, "activeSession=", activeCallSessionIdRef.current, "callPhase=", callPhaseRef.current);
      if (isSessionMismatch(payload)) {
        console.log("[CALL] call:canceled ignored — session mismatch or idle");
        return;
      }
      console.log("[CALL] call:canceled: resetting call state");
      stopCallRingtone();
      void resetCallState("Call canceled", true);
    });
    socket.on("call:timeout", (payload: { chatId?: string; sessionStartedAt?: string }) => {
      console.log("[CALL] call:timeout received chatId=", payload?.chatId, "sessionStartedAt=", payload?.sessionStartedAt, "activeSession=", activeCallSessionIdRef.current, "callPhase=", callPhaseRef.current);
      if (isSessionMismatch(payload)) {
        console.log("[CALL] call:timeout ignored — session mismatch or idle");
        return;
      }
      console.log("[CALL] call:timeout: resetting call state");
      stopCallRingtone();
      void resetCallState("Missed call", true);
    });
    socket.on("call:ended", (payload: { chatId?: string; sessionStartedAt?: string }) => {
      console.log("[call:ended] received chatId=", payload?.chatId, "sessionStartedAt=", payload?.sessionStartedAt, "activeSession=", activeCallSessionIdRef.current);
      if (isSessionMismatch(payload)) {
        console.log("[call:ended] ignoring — session mismatch or idle");
        return;
      }
      stopCallRingtone();
      void resetCallState("Call ended", true);
    });
    // call:sync is emitted by the server when the user's socket reconnects during
    // an active call. Resume WebRTC signaling so the call can recover from a brief
    // socket disconnect without ending the call entirely.
    socket.on("call:sync", (payload: { chatId: string; callerId: string; calleeId: string; callType?: string; state?: string }) => {
      console.log("[call:sync] received", payload);
      if (!currentUser || callPhaseRef.current === "idle") return;
      if (payload.chatId !== activeCallChatIdRef.current) return;
      const callType: "audio" | "video" = payload.callType === "video" ? "video" : "audio";
      const asOfferer = payload.callerId === currentUser.id;
      const peerId = asOfferer ? payload.calleeId : payload.callerId;
      void audioController.resumeSignaling(payload.chatId, peerId, callType, asOfferer).catch((err) => {
        console.error("[call:sync] resumeSignaling failed:", err);
      });
    });
    socket.on("call:error", (payload: { message?: string }) => {
      const message = payload.message ?? "Call failed";
      console.error("[call:error] received:", payload);
      stopCallRingtone();
      // Late call:end / call:signal on an already-cleared session is harmless noise.
      if (message === "Call not available") {
        if (callPhaseRef.current === "idle") return;
        void resetCallState("Call ended", true);
        return;
      }
      setError(message);
      // Server encountered an error and the session may already be gone;
      // pass serverAlreadyNotified=true to avoid a redundant call:end.
      void resetCallState(undefined, true);
    });

    return () => {
      audioSettingsCancelled = true;
      appStateCancelled = true;
      void appStateListener?.remove();
      removePictureInPictureListener?.();
      removePictureInPictureActionListener?.();
      videoPictureInPictureActiveRef.current = false;
      setIsVideoPictureInPictureActive(false);
      socket.off("connect", syncAfterSocketResume);
      socket.off("connect_error", syncAfterSocketResume);
      socket.io.off("reconnect", syncAfterSocketResume);
      socket.off("sync:needed", syncAfterSocketResume);
      socket.off("message:pinned");
      socket.off("message:unpinned");
      stopCallRingtone();
      // Do not emit call:end here — socket teardown must not kill an active call.
      void audioController.cleanup(true).catch(() => undefined);
      audioCallRef.current = null;
      socket.disconnect();
      socketRef.current = null;
      if (saveAudioSettingsTimerRef.current !== null) {
        window.clearTimeout(saveAudioSettingsTimerRef.current);
      }
    };
  }, [applyMessagesForChat, currentUser?.id, startIncomingRingtone, startOutgoingRingtone, stopCallRingtone]);

  useEffect(() => {
    if (!isCallAudioPopupOpen) {
      return;
    }
    void refreshCallAudioDevices().catch(() => undefined);
    if (!navigator.mediaDevices?.addEventListener) {
      return;
    }
    const onDeviceChange = () => {
      void refreshCallAudioDevices().catch(() => undefined);
    };
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
    };
  }, [isCallAudioPopupOpen, refreshCallAudioDevices]);

  useEffect(() => {
    if (callAudioSettings.soundDisabled) {
      stopCallRingtone();
    }
  }, [callAudioSettings.soundDisabled, stopCallRingtone]);

  useEffect(() => {
    if (callPhase === "outgoing" && !callAudioSettings.soundDisabled) {
      startOutgoingRingtone();
    }
  }, [callPhase, callAudioSettings.soundDisabled, startOutgoingRingtone]);

  // Android: proximity sensor blanks the screen near the ear; route audio to earpiece/speaker.
  useEffect(() => {
    if (!isNativeCallPluginAvailable() || callPhase === "idle") {
      setIsProximityNear(false);
      void disableNativeCallMode();
      return;
    }

    const earpiece =
      callAudioSettings.speakerMode === "small" && !callAudioSettings.outputDeviceId;
    void enableNativeCallMode(earpiece);

    let removeListener: (() => void) | undefined;
    void addProximityListener((near) => setIsProximityNear(near)).then((remove) => {
      removeListener = remove;
    });

    return () => {
      removeListener?.();
      setIsProximityNear(false);
      void disableNativeCallMode();
    };
  }, [callPhase, callAudioSettings.speakerMode, callAudioSettings.outputDeviceId]);

  useEffect(() => {
    if (callPhase === "idle") {
      pictureInPictureActiveRef.current = false;
    }
  }, [callPhase]);

  // Re-attach video refs to the controller whenever a call becomes active.
  // startOutgoing / acceptIncoming await getUserMedia (hundreds of ms), giving
  // React time to render the popup and populate the refs before they're needed.
  useEffect(() => {
    if (callPhase !== "idle" && audioCallRef.current) {
      audioCallRef.current.attachRemoteVideoElement(remoteVideoRef.current);
      audioCallRef.current.attachLocalVideoElement(localVideoRef.current);
      // Re-sync in case the remote track arrived before the call popup rendered.
      audioCallRef.current.syncRemoteVideoToUI();
    }
  }, [callPhase]);

  // When remote video track arrives, ensure the video element resumes playback
  // (some browsers won't auto-play a video element that was hidden when srcObject was set)
  useEffect(() => {
    if ((hasRemoteVideo || remoteVideoStream) && remoteVideoRef.current) {
      void remoteVideoRef.current.play().catch(() => undefined);
    }
  }, [hasRemoteVideo, remoteVideoStream]);

  /** Dismiss the native Android incoming-call notification (no-op on web/iOS). */
  function dismissNativeCallNotification() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = typeof window !== "undefined" ? (window as any).Capacitor : undefined;
    if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cap.Plugins?.NtfyPlugin as any)?.dismissCallNotification?.();
    }
  }

  async function resetCallState(
    notice?: string,
    serverAlreadyNotified = false,
    playEndSoundEffect = true
  ) {
    console.log("[resetCallState] notice=", notice, "serverAlreadyNotified=", serverAlreadyNotified, new Error().stack?.split("\n").slice(1, 4).join(" | "));
    dismissNativeCallNotification();
    if (playEndSoundEffect && callPhaseRef.current !== "idle") {
      playCallEndSound();
    } else {
      stopCallRingtone();
    }
    await audioCallRef.current?.cleanup(serverAlreadyNotified);
    callPhaseRef.current = "idle";
    activeCallSessionIdRef.current = null;
    activeCallChatIdRef.current = null;
    callTypeRef.current = "audio";
    pictureInPictureActiveRef.current = false;
    setCallPhase("idle");
    setActiveCallChatId(null);
    setCallPeerUserId(null);
    setCallPeerDisplayName(null);
    setHasRemoteVideo(false);
    setLocalVideoStream(null);
    setRemoteVideoStream(null);
    setCallType("audio");
    setCallAudioSettings((cur) => ({ ...cur, micMuted: false, soundDisabled: false, cameraEnabled: false }));
    setIsCallSettingsMenuOpen(false);
    setIsCallAudioPopupOpen(false);
    setIsCallMinimized(false);
    setCallTrackStatus(null);
    setCallAudioWarning(null);
    setIsPeerSpeaking(false);
    setCallNotice(notice ?? null);
  }

  async function startDirectCall(type: "audio" | "video") {
    console.log("[CALL] startDirectCall: entered type=", type, "callPhase=", callPhaseRef.current, "chatId=", selectedChat?.id, "socketConnected=", socketRef.current?.connected);
    if (!selectedChat || selectedChat.type !== "direct" || !currentUser) {
      console.warn("[CALL] startDirectCall: guard failed — selectedChat=", !!selectedChat, "type=", selectedChat?.type, "currentUser=", !!currentUser);
      return;
    }
    const socket = socketRef.current;
    if (!socket) {
      setError("Realtime is not connected yet. Please wait a moment and try again.");
      return;
    }
    console.log("[CALL] startDirectCall: ensuring socket connected, socket.connected=", socket.connected);
    const connected = await ensureSocketConnected(socket, 4500);
    console.log("[CALL] startDirectCall: socket connected=", connected);
    if (!connected) {
      setError("Realtime connection is offline. Please refresh and try again.");
      return;
    }
    const peer = selectedChat.members.find((member) => member.id !== currentUser.id);
    if (!peer) {
      console.warn("[CALL] startDirectCall: no peer member found in chat");
      return;
    }
    console.log("[CALL] startDirectCall: peer=", peer.id, "setting callPhase=outgoing");
    setError(null);
    setCallNotice(null);
    setCallType(type);
    callTypeRef.current = type;
    if (type === "audio") {
      void applyCallAudioPatch({ cameraEnabled: false, speakerMode: "small" });
    }
    setCallPhase("outgoing");
    // Update callPhaseRef synchronously so socket event handlers that fire before
    // the useEffect runs (e.g. stale queued events drained on reconnect) see the
    // correct phase and don't prematurely kill the just-started call.
    callPhaseRef.current = "outgoing";
    // Set a "pending" placeholder so the session guard rejects ALL termination events
    // that arrive before call:ringing is received (which provides the real session ID).
    // This prevents stale same-chatId events from previous sessions slipping through
    // in the window between callPhaseRef = "outgoing" and call:ringing arriving.
    activeCallSessionIdRef.current = "pending";
    setActiveCallChatId(selectedChat.id);
    setCallPeerUserId(peer.id);
    setCallPeerDisplayName(peer.displayName ?? null);
    // Update ref synchronously so call:accepted handler sees it before next render
    activeCallChatIdRef.current = selectedChat.id;
    // Pre-acquire media NOW while we are still inside the user gesture (button click).
    // On iOS Safari, getUserMedia fails when called from an async socket callback
    // (not a user gesture). prepareForCall stores the stream so that startOutgoing's
    // ensurePeer() can reuse it without needing a new user gesture.
    console.log("[CALL] startDirectCall: calling prepareForCall type=", type);
    try {
      await audioCallRef.current?.prepareForCall(type);
      console.log("[CALL] startDirectCall: prepareForCall resolved OK");
    } catch (err) {
      console.error("[CALL] startDirectCall: prepareForCall threw:", err instanceof Error ? err.name + ": " + err.message : err);
      // Stop the ringtone that may have started via the callPhase="outgoing" useEffect
      // while getUserMedia was pending. Without this the ringtone keeps playing after the
      // call screen disappears. call:start has NOT been emitted yet so there is no server
      // session to end — pass serverAlreadyNotified=true so cleanup() doesn't emit call:end.
      stopCallRingtone();
      void audioCallRef.current?.cleanup(true).catch(() => undefined);
      setCallPhase("idle");
      callPhaseRef.current = "idle";
      activeCallSessionIdRef.current = null;
      callTypeRef.current = "audio";
      setActiveCallChatId(null);
      setCallPeerUserId(null);
      activeCallChatIdRef.current = null;
      setError(err instanceof Error ? err.message : "Microphone permission is required to call");
      return;
    }
    console.log("[CALL] startDirectCall: emitting call:start chatId=", selectedChat.id, "callType=", type);
    socket.emit("call:start", { chatId: selectedChat.id, callType: type });
    console.log("[CALL] startDirectCall: call:start emitted — waiting for call:ringing from server");
  }

  async function acceptIncomingCall() {
    if (!socketRef.current || !activeCallChatId || !callPeerUserId) {
      return;
    }
    dismissNativeCallNotification();
    setCallNotice(null);
    setCallPhase("connecting");
    callPhaseRef.current = "connecting"; // Sync update — see startDirectCall for rationale
    callTypeRef.current = callType;
    stopCallRingtone();
    try {
      if (callType === "audio") {
        await applyCallAudioPatch({ cameraEnabled: false, speakerMode: "small" });
      }
      // Acquire mic and create the peer BEFORE telling the server we accepted.
      // If this fails the call stays ringing — we must not emit call:accept then
      // call:end, which kills the session for both parties.
      await audioCallRef.current?.acceptIncoming(activeCallChatId, callPeerUserId, callType);
      socketRef.current.emit("call:accept", { chatId: activeCallChatId });
    } catch (err) {
      await audioCallRef.current?.cleanup(true).catch(() => undefined);
      setCallPhase("incoming");
      setCallNotice(
        callType === "video" ? "Incoming video call" : "Incoming audio call"
      );
      setError(err instanceof Error ? err.message : "Could not join call");
    }
  }

  function declineIncomingCall() {
    const chatId = activeCallChatId ?? activeCallChatIdRef.current;
    if (!socketRef.current || !chatId) {
      return;
    }
    stopCallRingtone();
    socketRef.current.emit("call:decline", { chatId });
    // Reset local state immediately (optimistic) — don't wait for the server
    // round-trip.  The server will still send call:declined to the caller which
    // triggers their own reset.  Passing serverAlreadyNotified=true prevents
    // cleanup() from emitting a duplicate call:end.
    void resetCallState("Call declined", true, false);
  }

  async function endActiveCall() {
    if (!socketRef.current || !activeCallChatId) {
      return;
    }
    const endingChatId = activeCallChatId;
    const terminationEvent = callTerminationEvent(callPhaseRef.current);
    setCallNotice("Ending call...");
    stopCallRingtone();
    playCallEndSound();
    callPhaseRef.current = "idle";
    activeCallSessionIdRef.current = null;
    activeCallChatIdRef.current = null;
    callTypeRef.current = "audio";
    pictureInPictureActiveRef.current = false;
    socketRef.current.emit(terminationEvent, { chatId: activeCallChatId });
    // serverAlreadyNotified=true: we just sent the phase-appropriate termination
    // event above, so cleanup must not send a second call:end.
    await audioCallRef.current?.cleanup(true).catch(() => undefined);
    setCallPhase("idle");
    setActiveCallChatId(null);
    setCallPeerUserId(null);
    setCallPeerDisplayName(null);
    setHasRemoteVideo(false);
    setLocalVideoStream(null);
    setRemoteVideoStream(null);
    setCallType("audio");
    setCallAudioSettings((cur) => ({ ...cur, micMuted: false, soundDisabled: false, cameraEnabled: false }));
    setIsCallSettingsMenuOpen(false);
    setIsCallAudioPopupOpen(false);
    setIsCallMinimized(false);
    setCallTrackStatus(null);
    setCallAudioWarning(null);
    setIsPeerSpeaking(false);
    setCallNotice("Call ended");
    if (selectedChat?.id === endingChatId && selectedChat.type === "direct") {
      window.setTimeout(() => {
        setCallNotice((current) => (current === "Call ended" ? null : current));
      }, 2200);
    }
  }

  async function startDirectChatWith(userId: string) {
    if (!accessToken || !userId) {
      return;
    }

    setError(null);
    try {
      const existing = chats.find(
        (chat) => chat.type === "direct" && chat.members.some((member) => member.id === userId)
      );
      if (existing) {
        closeNewChatScreen();
        navigateToChat(existing);
        return;
      }
      const chat = await createDirectChat(accessToken, userId);
      await loadOverview();
      closeNewChatScreen();
      navigateToChat(chat);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not create chat");
    }
  }

  async function handleCreateGroupChat(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !groupTitle.trim() || groupMemberIds.length === 0) {
      return;
    }

    setError(null);
    try {
      const chat = await createGroupChat(accessToken, {
        title: groupTitle.trim(),
        memberIds: groupMemberIds
      });
      await loadOverview();
      closeNewChatScreen();
      navigateToChat(chat);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not create group");
    }
  }

  function toggleGroupMember(userId: string) {
    setGroupMemberIds((current) =>
      current.includes(userId)
        ? current.filter((existing) => existing !== userId)
        : [...current, userId]
    );
  }

  async function handleChatSettingsSubmit(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !selectedChat || !canManageSelectedChat) {
      return;
    }

    setError(null);
    try {
      const chat = await updateChat(accessToken, selectedChat.id, {
        title: chatTitleDraft.trim()
      });
      setSelectedChat(chat);
      setChats((current) => current.map((item) => (item.id === chat.id ? chat : item)));
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not update chat");
    }
  }

  async function handleCreateChannelChat(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !groupTitle.trim() || groupMemberIds.length === 0) {
      return;
    }

    setError(null);
    try {
      const chat = await createChannelChat(accessToken, {
        title: groupTitle.trim(),
        memberIds: groupMemberIds
      });
      await loadOverview();
      closeNewChatScreen();
      navigateToChat(chat);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not create channel");
    }
  }

  async function handleChatPhotoSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!accessToken || !selectedChat || !canManageSelectedChat || !file) {
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const uploaded = await uploadFile(accessToken, file);
      const chat = await updateChat(accessToken, selectedChat.id, {
        chatPhotoFileId: uploaded.id
      });
      setSelectedChat(chat);
      setChats((current) => current.map((item) => (item.id === chat.id ? chat : item)));
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not update chat photo");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleMediaVisibilityChange(enabled: boolean) {
    if (!accessToken || !selectedChat || !canUpdateMediaVisibility(selectedChat, currentUser)) {
      return;
    }

    setError(null);
    try {
      const chat = await updateChat(accessToken, selectedChat.id, {
        mediaVisibility: enabled ? "family" : "members"
      });
      setSelectedChat(chat);
      setChats((current) => current.map((item) => (item.id === chat.id ? chat : item)));
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not update media access");
    }
  }

  async function handleCommentsEnabledChange(enabled: boolean) {
    if (!accessToken || !selectedChat || selectedChat.type !== "channel" || !canManageSelectedChat) {
      return;
    }
    setError(null);
    try {
      const chat = await updateChat(accessToken, selectedChat.id, {
        commentsEnabled: enabled
      });
      setSelectedChat(chat);
      setChats((current) => current.map((item) => (item.id === chat.id ? chat : item)));
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not update comments");
    }
  }

  function applyChatUpdate(chat: Chat) {
    setSelectedChat((current) => (current?.id === chat.id ? chat : current));
    setChats((current) => current.map((item) => (item.id === chat.id ? chat : item)));
  }

  async function handlePinMessage(message: Message) {
    if (!accessToken || !selectedChat) {
      return;
    }
    try {
      const pin = await pinMessage(accessToken, selectedChat.id, message.id);
      setPinnedMessages((current) => {
        const withoutDup = current.filter((p) => p.messageId !== pin.messageId);
        const sorted = sortPinsByPosition([...withoutDup, pin]);
        setPinIndex(sorted.length - 1);
        return sorted;
      });
      setMessageContextMenu(null);
    } catch {}
  }

  async function handleUnpinMessage(message: Message) {
    if (!accessToken || !selectedChat) {
      return;
    }
    try {
      await unpinMessage(accessToken, selectedChat.id, message.id);
      setPinnedMessages((current) => {
        const updated = current.filter((p) => p.messageId !== message.id);
        setPinIndex((idx) => (idx >= updated.length ? Math.max(0, updated.length - 1) : idx));
        return updated;
      });
      setMessageContextMenu(null);
    } catch {}
  }

  async function handlePinPermissionChange(permission: "everyone" | "admins_only") {
    if (!accessToken || !selectedChat) {
      return;
    }
    try {
      const chat = await updateChatPinPermission(accessToken, selectedChat.id, permission);
      applyChatUpdate(chat);
    } catch {}
  }

  async function handleChatPreferenceChange(
    payload: { isMuted?: boolean; isPinned?: boolean; isFavorite?: boolean }
  ) {
    if (!accessToken || !selectedChat) {
      return;
    }

    setError(null);
    try {
      const chat = await updateChatPreferences(accessToken, selectedChat.id, payload);
      applyChatUpdate(chat);
      setIsChatMenuOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not update chat");
    }
  }

  async function handleMarkSelectedChatRead() {
    if (!selectedChat) {
      return;
    }
    const latestMessage = messages.at(-1);
    if (!latestMessage) {
      setIsChatMenuOpen(false);
      return;
    }
    await markChatRead(selectedChat.id, latestMessage.id);
    setIsChatMenuOpen(false);
  }

  function focusComposer() {
    setIsDetailsOpen(false);
    window.setTimeout(() => composerInputRef.current?.focus(), 0);
  }

  function navigateToChat(chat: Chat, replace = false) {
    navigateWithMotion(navigate, `/app/chats/${chat.id}`, {
      replace,
      reducedMotion: prefersReducedMotion
    });
  }

  function navigateToChatList(replace = false) {
    navigateWithMotion(navigate, "/app/chats", {
      replace,
      reducedMotion: prefersReducedMotion
    });
  }

  function openChat(chat: Chat) {
    setSelectedChat(chat);
    setError(null);
    const cachedMessages = messageCacheRef.current[chat.id];
    if (cachedMessages) {
      setMessages(cachedMessages);
    }
    if (chat.id === chatId) {
      return;
    }
    navigateToChat(chat);
  }

  function closeActiveChat() {
    clearSelectedMessages();
    setIsDetailsOpen(false);
    setSelectedChat(null);
    navigateToChatList();
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

    const selection = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd
    };
    if (selection.start === selection.end) {
      clearComposerFormattingSelection();
      return;
    }

    composerFormattingSelectionRef.current = selection;
    setFormattingToolbarAnchor(measureTextareaSelectionAnchor(textarea, selection));
  }

  function handleComposerCut() {
    const textarea = composerInputRef.current;
    const selection = composerFormattingSelectionRef.current;
    if (!textarea || !selection || selection.end <= selection.start) return;
    const selected = composer.slice(selection.start, selection.end);
    void navigator.clipboard?.writeText(selected).catch(() => undefined);
    const next =
      composer.slice(0, selection.start) + composer.slice(selection.end);
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
    if (!edit.changed) {
      return;
    }

    handleComposerChange(edit.value);
    requestAnimationFrame(() => {
      const currentTextarea = composerInputRef.current;
      if (!currentTextarea || currentTextarea.value !== edit.value) {
        clearComposerFormattingSelection();
        return;
      }

      currentTextarea.focus();
      currentTextarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
      const nextSelection = {
        start: edit.selectionStart,
        end: edit.selectionEnd
      };
      composerFormattingSelectionRef.current = nextSelection;
      setFormattingToolbarAnchor(
        measureTextareaSelectionAnchor(currentTextarea, nextSelection)
      );
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

  function openMessageSearch() {
    clearSelectedMessages();
    setIsMessageSearchOpen(true);
  }

  function toggleMessageSearch() {
    if (isMessageSearchOpen) {
      closeMessageSearch();
      return;
    }
    openMessageSearch();
  }

  function closeMessageSearch() {
    setMessageSearch("");
    setWholeWordSearch(false);
    setCaseSensitiveSearch(false);
    setIsMessageSearchOpen(false);
  }

  function openPinnedMessages() {
    const currentPin = pinnedMessages[pinIndex] ?? pinnedMessages[0];
    if (currentPin) {
      focusMessageInPanel({
        messageId: currentPin.messageId,
        highlightClassName: "message-pin-flash",
        lockPinTracking: true,
      });
      setPinIndex((current) => (current - 1 + pinnedMessages.length) % pinnedMessages.length);
    }
    setIsChatMenuOpen(false);
  }

  const COMPOSER_MAX_LINES = 3;

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
    const composer = textarea.closest(".message-composer") as HTMLElement | null;
    if (!composer) {
      return;
    }
    // Soft 28px radius needs only light tuck-in when the field grows past one line.
    const growth = Math.max(0, nextHeight - minHeight);
    const inset = Math.min(6, Math.round(growth * 0.12));
    const bottom = Math.min(4, Math.round(growth * 0.08));
    composer.style.setProperty("--composer-action-inset", `${inset}px`);
    composer.style.setProperty("--composer-action-bottom", `${bottom}px`);
  }, []);

  const clearComposerActionInsets = useCallback((textarea: HTMLTextAreaElement | null) => {
    const composer = textarea?.closest(".message-composer") as HTMLElement | null;
    if (!composer) {
      return;
    }
    composer.style.setProperty("--composer-action-inset", "0px");
    composer.style.setProperty("--composer-action-bottom", "0px");
  }, []);

  const adjustComposerHeight = useCallback(() => {
    const textarea = composerInputRef.current;
    if (!textarea) {
      return;
    }
    const { minHeight, maxHeight } = getComposerHeightLimits(textarea);
    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    const nextHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
    // Show enlarge only once content reaches the 3-line composer capacity.
    setComposerIsMultiline(scrollHeight >= maxHeight - 2);
    applyComposerActionInsets(textarea, nextHeight, minHeight);
  }, [applyComposerActionInsets, getComposerHeightLimits]);

  const resetComposerHeight = useCallback(() => {
    const textarea = composerInputRef.current;
    if (!textarea) {
      return;
    }
    const { minHeight } = getComposerHeightLimits(textarea);
    textarea.style.height = `${minHeight}px`;
    textarea.style.overflowY = "hidden";
    setComposerIsMultiline(false);
    clearComposerActionInsets(textarea);
  }, [clearComposerActionInsets, getComposerHeightLimits]);

  useLayoutEffect(() => {
    adjustComposerHeight();
  }, [composer, adjustComposerHeight]);

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
    if (appearance.sendOnEnter) {
      if (event.shiftKey) {
        return; // Shift+Enter = newline when send-on-enter is on
      }
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
      return;
    }
    // Default: Enter inserts newline; Ctrl/Cmd+Enter sends.
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
    if (selectedFiles.length === 0) {
      return;
    }

    // Keep attachments local until send — no server upload on pick.
    // Images get object URLs immediately; video thumbs are deferred so pick stays instant.
    const next: PendingLocalAttachment[] = selectedFiles.map((file) => {
      const isImage = file.type.startsWith("image/");
      return {
        localId: `local:${crypto.randomUUID()}`,
        file,
        previewUrl: isImage ? URL.createObjectURL(file) : null
      };
    });
    setPendingAttachments((current) => [...current, ...next]);

    const videoPending = next.filter((item) => item.file.type.startsWith("video/"));
    if (videoPending.length === 0) {
      return;
    }
    const schedule =
      typeof window.requestIdleCallback === "function"
        ? (cb: () => void) => window.requestIdleCallback(() => cb())
        : (cb: () => void) => window.setTimeout(cb, 0);
    schedule(() => {
      setPendingAttachments((current) =>
        current.map((item) => {
          if (!videoPending.some((pending) => pending.localId === item.localId)) {
            return item;
          }
          if (item.previewUrl) {
            return item;
          }
          return { ...item, previewUrl: URL.createObjectURL(item.file) };
        })
      );
    });
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

  async function handleMessageReaction(message: Message, emoji: string) {
    if (!accessToken || !currentUser || message.id.startsWith("pending:")) {
      return;
    }

    const currentReaction = message.reactions.find((reaction) =>
      reaction.userIds.includes(currentUser.id)
    );
    const shouldRemove = currentReaction?.emoji === emoji;
    setError(null);
    applyMessagesForChat(message.chatId, (current) =>
      current.map((item) =>
        item.id === message.id
          ? optimisticReactionUpdate(item, currentUser.id, emoji, !shouldRemove)
          : item
      )
    );

    try {
      const updated = shouldRemove
        ? await removeMessageReaction(accessToken, message.id, emoji)
        : await addMessageReaction(accessToken, message.id, emoji);
      applyMessagesForChat(message.chatId, (current) => replaceMessage(current, updated));
    } catch (err) {
      applyMessagesForChat(message.chatId, (current) => replaceMessage(current, message));
      setError(err instanceof ApiError ? String(err.message) : "Could not update reaction");
    }
  }

  function openMessageContextMenu(event: ReactMouseEvent<HTMLElement>, message: Message) {
    event.preventDefault();
    if (isMobileViewport || isMessageSelectionMode) {
      return;
    }
    showMessageContextMenu(message, event.clientX, event.clientY);
  }

  function handleReplyToMessage(message: Message) {
    if (channelCommentsDisabledForViewer) {
      setError("Comments are disabled for this channel");
      setMessageContextMenu(null);
      return;
    }
    if (selectedChat?.type === "channel") {
      setThreadRootMessageId(message.id);
      pendingMessageFocusRef.current = {
        messageId: message.id,
        highlightClassName: "message-context-flash",
      };
    }
    resetSwipeReplyState();
    setReplyTarget(message);
    setMessageContextMenu(null);
    requestAnimationFrame(() => composerInputRef.current?.focus());
  }

  function shouldAllowSwipeReply(message: Message, event: ReactPointerEvent<HTMLElement>) {
    if (!supportsSwipeReplyGesture() || !event.isPrimary || event.button !== 0) {
      return false;
    }
    if (isMessageSelectionMode) {
      return false;
    }
    if (event.pointerType === "mouse" || messageContextMenu !== null) {
      return false;
    }
    if (channelCommentsDisabledForViewer || missingCommentThread) {
      return false;
    }
    if (message.deliveryState === "sending") {
      return false;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select, [role='button']")) {
      return false;
    }
    return true;
  }

  function shouldAllowMobileMessageGesture(
    event: ReactPointerEvent<HTMLElement>,
    message: Message
  ) {
    if (!isMobileViewport || !event.isPrimary || event.button !== 0) {
      return false;
    }
    if (event.pointerType === "mouse" || message.deliveryState === "sending") {
      return false;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select, [role='button']")) {
      return false;
    }
    return true;
  }

  function beginMessageLongPressGesture(
    event: ReactPointerEvent<HTMLElement>,
    message: Message
  ) {
    clearMessageLongPressGesture();
    if (isMessageSelectionMode || !shouldAllowMobileMessageGesture(event, message)) {
      return;
    }
    const timerId = window.setTimeout(() => {
      markNextMessageClickSuppressed(message.id);
      resetSwipeReplyState();
      setMessageContextMenu(null);
      setSelectedMessageIds([message.id]);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(10);
      }
      messageLongPressRef.current = null;
    }, MESSAGE_LONG_PRESS_DURATION_MS);
    messageLongPressRef.current = {
      messageId: message.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timerId,
    };
  }

  function handleMessageLongPressMove(
    event: ReactPointerEvent<HTMLElement>,
    message: Message
  ) {
    const gesture = messageLongPressRef.current;
    if (
      !gesture ||
      gesture.messageId !== message.id ||
      gesture.pointerId !== event.pointerId
    ) {
      return;
    }
    if (
      Math.abs(event.clientX - gesture.startX) > MESSAGE_LONG_PRESS_MOVE_TOLERANCE ||
      Math.abs(event.clientY - gesture.startY) > MESSAGE_LONG_PRESS_MOVE_TOLERANCE
    ) {
      clearMessageLongPressGesture();
    }
  }

  function endMessageLongPressGesture(
    event: ReactPointerEvent<HTMLElement>,
    message: Message
  ) {
    const gesture = messageLongPressRef.current;
    if (
      !gesture ||
      gesture.messageId !== message.id ||
      gesture.pointerId !== event.pointerId
    ) {
      return;
    }
    clearMessageLongPressGesture();
  }

  function handleMessageBubbleClick(event: ReactMouseEvent<HTMLElement>, message: Message) {
    if (!isMobileViewport) {
      return;
    }
    if (consumeSuppressedMessageClick(message.id)) {
      event.preventDefault();
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select, [role='button']")) {
      return;
    }
    if (isMessageSelectionMode) {
      event.preventDefault();
      toggleSelectedMessage(message.id);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    showMessageContextMenu(
      message,
      rect.right - 20,
      rect.top + Math.min(rect.height * 0.5, 40)
    );
  }

  function shouldAllowChatExitSwipe(event: ReactPointerEvent<HTMLElement>) {
    if (!isMobileViewport || !chatId || !event.isPrimary || event.button !== 0) {
      return false;
    }
    if (event.pointerType === "mouse") {
      return false;
    }
    if (event.clientX > CHAT_EXIT_SWIPE_EDGE_THRESHOLD) {
      return false;
    }
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        "button, a, input, textarea, select, [role='button'], .action-menu, .emoji-picker, .emoji-picker-dock"
      )
    ) {
      return false;
    }
    return true;
  }

  function beginChatExitSwipe(event: ReactPointerEvent<HTMLElement>) {
    if (!shouldAllowChatExitSwipe(event)) {
      return;
    }
    chatExitSwipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lock: "pending",
      committed: false,
    };
  }

  function moveChatExitSwipe(event: ReactPointerEvent<HTMLElement>) {
    const gesture = chatExitSwipeRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.committed) {
      return;
    }

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;

    if (gesture.lock === "pending") {
      if (Math.abs(deltaY) > 12 && Math.abs(deltaY) > Math.abs(deltaX)) {
        gesture.lock = "vertical";
        return;
      }
      if (deltaX <= 10 || deltaX <= Math.abs(deltaY)) {
        return;
      }
      gesture.lock = "horizontal";
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    if (gesture.lock !== "horizontal") {
      return;
    }

    if (deltaX >= CHAT_EXIT_SWIPE_TRIGGER_OFFSET) {
      gesture.committed = true;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      requestCloseActiveChatSurface();
      resetChatExitSwipeGesture();
    }
  }

  function endChatExitSwipe(event: ReactPointerEvent<HTMLElement>) {
    const gesture = chatExitSwipeRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetChatExitSwipeGesture();
  }

  function beginSwipeReplyGesture(
    event: ReactPointerEvent<HTMLElement>,
    message: Message
  ) {
    if (!shouldAllowSwipeReply(message, event)) {
      beginMessageLongPressGesture(event, message);
      return;
    }
    swipeReplyGestureRef.current = {
      messageId: message.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastOffset: 0,
      lock: "pending",
    };
    setSwipeReplyState({
      messageId: message.id,
      offset: 0,
      activated: false,
    });
    beginMessageLongPressGesture(event, message);
  }

  function updateSwipeReplyOffset(messageId: string, offset: number) {
    const clampedOffset = Math.min(Math.max(offset, 0), SWIPE_REPLY_MAX_OFFSET);
    setSwipeReplyState({
      messageId,
      offset: clampedOffset,
      activated: clampedOffset >= SWIPE_REPLY_TRIGGER_OFFSET,
    });
  }

  function handleSwipeReplyMove(
    event: ReactPointerEvent<HTMLElement>,
    message: Message
  ) {
    const gesture = swipeReplyGestureRef.current;
    if (
      !gesture ||
      gesture.messageId !== message.id ||
      gesture.pointerId !== event.pointerId
    ) {
      handleMessageLongPressMove(event, message);
      return;
    }

    handleMessageLongPressMove(event, message);

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;

    if (gesture.lock === "pending") {
      if (
        Math.abs(deltaY) > SWIPE_REPLY_VERTICAL_TOLERANCE &&
        Math.abs(deltaY) > Math.abs(deltaX)
      ) {
        resetSwipeReplyState();
        clearMessageLongPressGesture();
        return;
      }
      if (deltaX <= SWIPE_REPLY_DIRECTION_LOCK || deltaX <= Math.abs(deltaY)) {
        return;
      }
      gesture.lock = "horizontal";
      clearMessageLongPressGesture();
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    gesture.lastOffset = Math.min(Math.max(deltaX, 0), SWIPE_REPLY_MAX_OFFSET);
    event.preventDefault();
    updateSwipeReplyOffset(message.id, gesture.lastOffset);
  }

  function endSwipeReplyGesture(
    event: ReactPointerEvent<HTMLElement>,
    message: Message,
    options?: { commit?: boolean }
  ) {
    endMessageLongPressGesture(event, message);
    const gesture = swipeReplyGestureRef.current;
    if (
      !gesture ||
      gesture.messageId !== message.id ||
      gesture.pointerId !== event.pointerId
    ) {
      return;
    }

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const shouldCommit =
      options?.commit !== false &&
      gesture.lock === "horizontal" &&
      gesture.lastOffset >= SWIPE_REPLY_TRIGGER_OFFSET;
    resetSwipeReplyState();

    if (shouldCommit) {
      markNextMessageClickSuppressed(message.id);
      handleReplyToMessage(message);
    }
  }

  function handleEditMessage(message: Message) {
    draftBeforeEditRef.current = composer;
    clearComposerFormattingSelection();
    setComposer(message.content ?? "");
    setEditTargetMessage(message);
    setMessageContextMenu(null);
    requestAnimationFrame(() => composerInputRef.current?.focus());
  }

  function cancelEditMode() {
    clearComposerFormattingSelection();
    setComposer(draftBeforeEditRef.current);
    setEditTargetMessage(null);
    draftBeforeEditRef.current = "";
  }

  async function handleConfirmDelete() {
    if (!accessToken || !deleteTarget) {
      return;
    }
    const scope = deleteForEveryone ? "everyone" : "me";
    const deletedId = deleteTarget.id;
    const deletedChatId = deleteTarget.chatId;
    try {
      await deleteMessage(accessToken, deletedId, scope);
      // For scope="me" the server does NOT emit message:deleted, so remove the
      // message and update the chat preview locally. For scope="everyone" the
      // socket handler also fires, but updating chats here ensures the preview
      // clears immediately without waiting for the round-trip.
      applyMessagesForChat(deletedChatId, (current) =>
        current.filter((m) => m.id !== deletedId)
      );
      setChats((current) =>
        current.map((chat) => {
          if (chat.id !== deletedChatId || chat.lastMessageId !== deletedId) {
            return chat;
          }
          return {
            ...chat,
            lastMessageId: null,
            lastMessageSenderId: null,
            lastMessageSenderDisplayName: null,
            lastMessageContent: null,
            lastMessageType: null,
            lastMessageCreatedAt: null
          };
        })
      );
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not delete message");
    }
  }

  async function handleOpenThread(rootMessage: Message) {
    setThreadRootMessageId(rootMessage.id);
    setReplyTarget(rootMessage);
    pendingMessageFocusRef.current = {
      messageId: rootMessage.id,
      highlightClassName: "message-context-flash",
    };
    if (!accessToken || !selectedChat) {
      return;
    }
    try {
      const threadMessages = await getMessages(
        accessToken,
        selectedChat.id,
        undefined,
        100,
        rootMessage.id
      );
      const decrypted = await decryptMessages(selectedChat.id, threadMessages, currentUser?.id);
      applyMessagesForChat(selectedChat.id, (current) => mergeMessageLists(current, decrypted));
    } catch {
      // Best-effort: keep local view if thread fetch fails.
    }
  }

  function handleComposerEmojiPick(emojiData: EmojiClickData) {
    insertEmoji(emojiData.emoji);
  }

  function handleComposerFocus() {
    if (Capacitor.isNativePlatform() && isEmojiPickerOpen) {
      closeEmojiPicker();
    }
  }

  async function handleForwardMessage(targetChatId: string) {
    if (!accessToken || !forwardTarget) {
      return;
    }
    try {
      const targetChat = chats.find((chat) => chat.id === targetChatId);
      const shouldForwardLocally =
        targetChat &&
        forwardTarget.encryptionProtocol === "end_to_end" &&
        Boolean(forwardTarget.content?.trim()) &&
        forwardTarget.attachments.length === 0;
      const forwarded = shouldForwardLocally
        ? await (async () => {
            const encrypted = await encryptMessageContent(
              targetChat,
              forwardTarget.content,
              currentUser?.id
            );
            const created = await sendMessage(
              accessToken,
              targetChatId,
              encrypted.content,
              [],
              null,
              null,
              encrypted.encryption
            );
            return decryptMessage(targetChatId, created, currentUser?.id);
          })()
        : await forwardMessage(accessToken, forwardTarget.id, targetChatId);
      if (targetChatId === selectedChat?.id) {
        applyMessagesForChat(targetChatId, (current) => mergeIncomingMessage(current, forwarded));
      }
      setChats((current) =>
        current.map((chat) =>
          chat.id === targetChatId ? applyMessagePreviewToChat(chat, forwarded) : chat
        )
      );
      setForwardTarget(null);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not forward message");
    }
  }

  async function handleSendMessage(
    event?: FormEvent,
    attachmentOverride?: PendingLocalAttachment[]
  ) {
    event?.preventDefault();
    if (sendInFlightRef.current) {
      return;
    }
    const content = composer.trim();
    const localAttachments = attachmentOverride ?? pendingAttachments;
    if (!accessToken || !currentUser || !selectedChat || (!content && localAttachments.length === 0)) {
      return;
    }
    if (channelCommentsDisabledForViewer) {
      setError("Comments are disabled for this channel");
      return;
    }
    if (missingCommentThread) {
      setError("Choose a post thread before commenting");
      return;
    }

    // Edit branch — send as PATCH instead of creating a new message
    if (editTargetMessage !== null) {
      if (editInFlightRef.current) {
        return;
      }
      const editTarget = editTargetMessage;
      const savedDraft = draftBeforeEditRef.current;
      try {
        editInFlightRef.current = true;
        setIsSendingMessage(true);
        const updated = await editMessage(accessToken, editTarget.id, content);
        const displayMessage = await decryptMessage(editTarget.chatId, updated, currentUser.id);
        applyMessagesForChat(editTarget.chatId, (current) => replaceMessage(current, displayMessage));
        clearComposerFormattingSelection();
        setEditTargetMessage(null);
        setComposer(savedDraft);
        draftBeforeEditRef.current = "";
        resetComposerHeight();
      } catch (err) {
        clearComposerFormattingSelection();
        setEditTargetMessage(null);
        draftBeforeEditRef.current = "";
        setError(err instanceof ApiError ? String(err.message) : "Could not edit message");
      } finally {
        editInFlightRef.current = false;
        setIsSendingMessage(false);
      }
      return;
    }

    const clientMessageId = createClientMessageId();
    const createdAt = new Date().toISOString();
    const isChannelThreadMessage = selectedChat.type === "channel" && Boolean(threadRootMessageId);
    const threadRootForSend = isChannelThreadMessage ? threadRootMessageId : null;
    const replyToMessageId = isChannelThreadMessage ? null : replyTarget?.id ?? null;
    const draftContent = content;

    try {
      sendInFlightRef.current = true;
      setIsSendingMessage(true);
      setIsUploading(localAttachments.length > 0);
      setError(null);

      const uploadedAttachments: FamilyFile[] = [];
      for (const pending of localAttachments) {
        uploadedAttachments.push(await uploadFile(accessToken, pending.file, selectedChat.id));
      }
      setIsUploading(false);

      clearComposerFormattingSelection();
      setComposer("");
      resetComposerHeight();
      for (const pending of localAttachments) {
        if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
      }
      setPendingAttachments([]);
      setReplyTarget(null);
      if (chatId) {
        window.localStorage.removeItem(`stovo:draft:${chatId}`);
      }
      socketRef.current?.emit("typing:stop", { chatId: selectedChat.id });

      const optimisticMessage: Message = {
        id: `pending:${clientMessageId}`,
        chatId: selectedChat.id,
        senderId: currentUser.id,
        senderDisplayName: currentUser.displayName,
        type: inferOptimisticMessageType(uploadedAttachments, draftContent || null),
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
        attachments: uploadedAttachments,
        clientMessageId,
        deliveryState: "sending"
      };
      applyMessagesForChat(selectedChat.id, (current) => [...current, optimisticMessage]);
      setChats((current) =>
        current.map((chat) =>
          chat.id === selectedChat.id
            ? {
                ...applyMessagePreviewToChat(chat, optimisticMessage),
                unreadCount: 0
              }
            : chat
        )
      );

      const encrypted = await encryptMessageContent(selectedChat, draftContent || null, currentUser.id);
      const message = await sendMessage(
        accessToken,
        selectedChat.id,
        encrypted.content,
        uploadedAttachments.map((file) => file.id),
        replyToMessageId,
        threadRootForSend,
        encrypted.encryption
      );
      const displayMessage = await decryptMessage(selectedChat.id, message, currentUser.id);
      applyMessagesForChat(selectedChat.id, (current) =>
        mergeIncomingMessage(current, {
          ...displayMessage,
          clientMessageId
        })
      );
    } catch (err) {
      applyMessagesForChat(selectedChat.id, (current) => {
        const hasOptimistic = current.some(
          (item) => item.clientMessageId === clientMessageId || item.id === `pending:${clientMessageId}`
        );
        if (!hasOptimistic) {
          return current;
        }
        return markPendingMessageFailed(
          current,
          clientMessageId,
          err instanceof ApiError ? String(err.message) : "Message failed"
        );
      });
      setError(err instanceof ApiError ? String(err.message) : "Message failed");
    } finally {
      sendInFlightRef.current = false;
      setIsSendingMessage(false);
      setIsUploading(false);
    }
  }

  async function sendQueuedNotificationReply(text: string) {
    const content = text.trim();
    if (!content || !accessToken || !currentUser || !selectedChat) {
      return;
    }
    if (selectedChat.type === "channel" && !canPostInSelectedChannel) {
      setError("You do not have permission to post in this channel");
      return;
    }
    try {
      const encrypted = await encryptMessageContent(selectedChat, content, currentUser.id);
      const message = await sendMessage(
        accessToken,
        selectedChat.id,
        encrypted.content,
        [],
        null,
        null,
        encrypted.encryption
      );
      const displayMessage = await decryptMessage(
        selectedChat.id,
        message,
        currentUser.id
      );
      applyMessagesForChat(selectedChat.id, (current) =>
        mergeIncomingMessage(current, displayMessage)
      );
      setChats((current) =>
        current.map((chat) =>
          chat.id === selectedChat.id
            ? {
                ...applyMessagePreviewToChat(chat, displayMessage),
                unreadCount: 0
              }
            : chat
        )
      );
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Message failed");
    }
  }

  function cancelVoiceRecording() {
    voiceRecordingPointerIdRef.current = null;
    voiceRecorderRef.current?.cancel();
    voiceRecorderRef.current = null;
    setIsVoiceRecording(false);
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
      setError("Voice recording is not supported on this device");
      return;
    }
    try {
      setError(null);
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
      setError(err instanceof Error ? err.message : "Microphone permission is required to record");
    }
  }

  async function handleVoicePressEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    if (voiceRecordingPointerIdRef.current !== event.pointerId) return;
    await stopAndSendVoiceRecording();
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
        localId: `local:${crypto.randomUUID()}`,
        file,
        previewUrl: null
      };
      await handleSendMessage(undefined, [pending]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send voice message");
    }
  }

  function handleVoicePressCancel(event: ReactPointerEvent<HTMLButtonElement>) {
    if (voiceRecordingPointerIdRef.current !== event.pointerId) return;
    cancelVoiceRecording();
  }

  const visibleError = error && !isSuppressedUserError(error) ? error : null;

  if (chatId && !isLoading && !isChatLoading && !selectedChat && !visibleError) {
    return <Navigate to="/app/chats" replace />;
  }

  async function handleArchiveMessage(message: Message) {
    if (!accessToken) return;
    try {
      await archiveMessage(accessToken, message.id);
      setMessageContextMenu(null);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not save message");
    }
  }

  const isDockedEmojiPicker = isMobileViewport;
  const showDockedEmojiPicker = isDockedEmojiPicker && isEmojiPickerOpen;

  return (
    <main
      className={`app-shell app-frame messenger-shell ${chatId ? "has-active-chat" : "chat-list-view"}${isNewChatOpen ? " messenger-shell--new-chat" : ""}${isDetailsOpen && selectedChat ? " messenger-shell--chat-info" : ""}${isVideoPictureInPictureActive ? " messenger-shell--video-pip" : ""}`}
    >
      <AppNav unreadTotalOverride={unreadTotal} />
      <section className="messenger-workspace">
        {!isOnline && (
          <p className="offline-banner" role="status">
            <WifiOff aria-hidden="true" size={18} />
            Offline. Messages will send when you are back online.
          </p>
        )}

        <div className={`chat-layout ${isDetailsOpen && selectedChat ? "details-open" : ""}`}>
          <aside className="chat-sidebar">
            <div className="chat-sidebar-header">
              <div className="sidebar-title-row chat-list-title">
                <span className="chat-list-brand-mark">
                  <VeloLogo className="chat-list-brand-logo" title="Stovo" />
                </span>
                <div>
                  <p className="eyebrow">{family?.name ?? "Stovo"}</p>
                  <h1 tabIndex={-1}>Chats</h1>
                </div>
              </div>
              <label className="search-field chat-list-search">
                <span className="ms-icon ms-icon--20" aria-hidden={true}>
                  search
                </span>
                <input
                  placeholder="Search chats"
                  value={chatSearch}
                  onChange={(event) => setChatSearch(event.target.value)}
                />
              </label>
              <div
                className="filter-chip-row chat-list-filters"
                aria-label="Chat filters"
                onWheel={(event) => {
                  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
                  event.currentTarget.scrollLeft += event.deltaY;
                  event.preventDefault();
                }}
              >
                {CHAT_FILTERS.map((filter) => (
                  <button
                    type="button"
                    className={chatFilter === filter.value ? "filter-chip active" : "filter-chip"}
                    aria-pressed={chatFilter === filter.value}
                    key={filter.value}
                    onClick={() => setChatFilter(filter.value)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {callPhase !== "idle" && isCallMinimized && isMobileViewport && !chatId && (
              <MobileMinimizedCallBar
                peerName={(callPeerDisplayName ?? activeCallPeerName) ?? "Call"}
                callPhase={callPhase}
                callTimer={callTimer}
                micMuted={callAudioSettings.micMuted}
                onToggleMic={() => void applyCallAudioPatch({ micMuted: !callAudioSettings.micMuted })}
                onEnd={() => void endActiveCall()}
                onExpand={() => setIsCallMinimized(false)}
              />
            )}

            <div className="chat-list" aria-busy={isLoading}>
              {isLoading
                ? Array.from({ length: 5 }).map((_, index) => (
                    <div className="chat-list-item skeleton-row" key={index}>
                      <span className="skeleton-avatar" />
                      <span className="chat-list-copy">
                        <span className="skeleton-line wide" />
                        <span className="skeleton-line" />
                      </span>
                    </div>
                  ))
                : CHAT_SECTION_ORDER.map((section) => {
                    const sectionChats = chatsBySection[section.key];
                    if (sectionChats.length === 0) {
                      return null;
                    }
                    return (
                      <section className="chat-list-section" key={section.key} aria-label={section.label}>
                        <h2>{section.label}</h2>
                        {sectionChats.map((chat) => {
                          const chatName = displayChatName(chat, currentUser?.id);
                          const hasUnread = chat.unreadCount > 0;
                          const isTransitionSource = selectedChat?.id === chat.id;
                          const avatarTransitionStyle = transitionAnchorStyle(
                            isTransitionSource ? chatTransitionName(chat.id, "avatar") : undefined
                          );
                          const titleTransitionStyle = transitionAnchorStyle(
                            isTransitionSource ? chatTransitionName(chat.id, "title") : undefined
                          );
                          return (
                            <button
                              type="button"
                              className={`chat-list-item ${chat.id === chatId ? "active" : ""}`}
                              key={chat.id}
                              onMouseDown={() => setSelectedChat(chat)}
                              onPointerDown={() => setSelectedChat(chat)}
                              onClick={() => openChat(chat)}
                            >
                              <RealAvatar
                                accessToken={accessToken}
                                className={`avatar chat-avatar ${chatAvatarTypeClass(chat)}`}
                                fallbackKind={chatAvatarFallbackKind(chat)}
                                file={chatAvatarFile(chat, currentUser?.id)}
                                label={chatName}
                                style={avatarTransitionStyle}
                              />
                              <span className="chat-list-copy">
                                <span className="chat-list-topline">
                                  <strong style={titleTransitionStyle}>{chatName}</strong>
                                  <time>{formatChatTime(chat.updatedAt)}</time>
                                </span>
                                {(() => {
                                  const draftText = window.localStorage.getItem(`stovo:draft:${chat.id}`);
                                  return draftText ? (
                                    <span>
                                      <span className="chat-list-draft-label">Draft:</span>{" "}
                                      {draftText.slice(0, 40)}{draftText.length > 40 ? "…" : ""}
                                    </span>
                                  ) : (
                                    <span>{chatPreview(chat)}</span>
                                  );
                                })()}
                              </span>
                              <span className="chat-row-meta">
                                {chat.isMuted && <BellOff aria-label="Muted" size={14} />}
                                {chat.isFavorite && <Star aria-label="Favorite" size={14} />}
                                {(chat.isPinned || chat.type === "family") && (
                                  <Pin aria-label={chat.isPinned ? "Pinned" : "Family chat"} size={14} />
                                )}
                                {hasUnread && (
                                  <span
                                    className="tiny-badge"
                                    aria-label={`${chat.unreadCount} unread ${
                                      chat.unreadCount === 1 ? "message" : "messages"
                                    }`}
                                  >
                                    {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                                  </span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </section>
                    );
                  })}
              {!isLoading && filteredChats.length === 0 && (
                <div className="empty-state compact-empty">
                  <MessageCircle aria-hidden="true" size={28} />
                  <strong>
                    {chatFilter === "unread"
                      ? "Everything is read"
                      : chatFilter === "muted"
                        ? "No muted chats"
                        : "No chats found"}
                  </strong>
                  <p>Start a direct message or create a group for your family space.</p>
                  <button type="button" onClick={openNewChatScreen}>
                    Start a chat
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              className="compose-fab"
              aria-label="Start a chat"
              title="Start a chat"
              onClick={openNewChatScreen}
            >
              <span className="ms-icon ms-icon--24" aria-hidden={true}>
                edit
              </span>
            </button>
          </aside>

          <section
            className="chat-detail"
            onPointerCancel={endChatExitSwipe}
            onPointerDown={beginChatExitSwipe}
            onPointerMove={moveChatExitSwipe}
            onPointerUp={endChatExitSwipe}
          >
            {selectedChat ? (
              <>
                <div className="chat-detail-header chat-detail-header--floating">
                  <button
                    type="button"
                    className="mobile-back-button"
                    aria-label="Back to chats"
                    onClick={requestCloseActiveChatSurface}
                  >
                    <span className="ms-icon ms-icon--20" aria-hidden={true}>
                      arrow_back
                    </span>
                  </button>
                  <button
                    type="button"
                    className="chat-title-group"
                    aria-label="Open chat details"
                    onClick={() => setIsDetailsOpen(true)}
                  >
                    <RealAvatar
                      accessToken={accessToken}
                      className={`avatar chat-avatar ${chatAvatarTypeClass(selectedChat)}`}
                      fallbackKind={chatAvatarFallbackKind(selectedChat)}
                      file={chatAvatarFile(selectedChat, currentUser?.id)}
                      label={displayChatName(selectedChat, currentUser?.id)}
                      style={transitionAnchorStyle(chatTransitionName(selectedChat.id, "avatar"))}
                    />
                    <span>
                      <strong style={transitionAnchorStyle(chatTransitionName(selectedChat.id, "title"))}>
                        {displayChatName(selectedChat, currentUser?.id)}
                      </strong>
                      <small>
                        {typingNames.length > 0
                          ? `${typingNames.join(", ")} typing...`
                          : `${selectedChat.members.length} member${
                              selectedChat.members.length === 1 ? "" : "s"
                            }`}
                      </small>
                    </span>
                  </button>
                  <div className="chat-header-actions">
                    {selectedChat.type === "direct" && (
                      <>
                        <button
                          type="button"
                          className="icon-button subtle"
                          aria-label="Audio call"
                          title="Audio call"
                          onClick={() => void startDirectCall("audio")}
                          disabled={callPhase !== "idle" && activeCallChatId === selectedChat.id}
                        >
                          <span className="ms-icon ms-icon--20" aria-hidden={true}>
                            call
                          </span>
                        </button>
                        <button
                          type="button"
                          className="icon-button subtle"
                          aria-label="Video call"
                          title="Video call"
                          onClick={() => void startDirectCall("video")}
                          disabled={callPhase !== "idle" && activeCallChatId === selectedChat.id}
                        >
                          <span className="ms-icon ms-icon--20" aria-hidden={true}>
                            videocam
                          </span>
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="chat-header-search-button"
                      aria-label="Search messages"
                      title="Search messages"
                      onClick={toggleMessageSearch}
                    >
                      <span className="ms-icon ms-icon--20" aria-hidden={true}>search</span>
                    </button>
                    {false && <div className={isChatMenuOpen ? "menu-anchor menu-anchor--open" : "menu-anchor"} ref={chatMenuRef}>
                      <button
                        type="button"
                        className="icon-button subtle icon-button--plain"
                        aria-label="More actions"
                        aria-expanded={isChatMenuOpen}
                        aria-haspopup="menu"
                        title="More actions"
                        onClick={() => setIsChatMenuOpen((value) => !value)}
                      >
                        <span className="ms-icon ms-icon--20" aria-hidden={true}>
                          more_vert
                        </span>
                      </button>
                      {isChatMenuOpen && (
                        <div className="action-menu" role="menu">
                          <button type="button" role="menuitem" onClick={openMessageSearch}>
                            <span className="ms-icon ms-icon--20" aria-hidden={true}>
                              search
                            </span>
                            Search messages
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setIsDetailsOpen((v) => !v);
                              setIsChatMenuOpen(false);
                            }}
                          >
                            <Info aria-hidden="true" size={16} />
                            Chat details
                          </button>
                          <button type="button" role="menuitem" onClick={() => void handleMarkSelectedChatRead()}>
                            <CheckCheck aria-hidden="true" size={16} />
                            Mark as read
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() =>
                              void handleChatPreferenceChange({ isPinned: !selectedChat!.isPinned })
                            }
                          >
                            <Pin aria-hidden="true" size={16} />
                            {selectedChat!.isPinned ? "Unpin chat" : "Pin chat"}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() =>
                              void handleChatPreferenceChange({ isMuted: !selectedChat!.isMuted })
                            }
                          >
                            {selectedChat!.isMuted ? (
                              <Bell aria-hidden="true" size={16} />
                            ) : (
                              <BellOff aria-hidden="true" size={16} />
                            )}
                            {selectedChat!.isMuted ? "Unmute" : "Mute"}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() =>
                              void handleChatPreferenceChange({ isFavorite: !selectedChat!.isFavorite })
                            }
                          >
                            <Star aria-hidden="true" size={16} />
                            {selectedChat!.isFavorite ? "Remove favorite" : "Favorite"}
                          </button>
                        </div>
                      )}
                    </div>}
                  </div>
                </div>
                {callPhase !== "idle" && isCallMinimized && isMobileViewport && chatId && (
                  <MobileMinimizedCallBar
                    peerName={(callPeerDisplayName ?? activeCallPeerName) ?? "Call"}
                    callPhase={callPhase}
                    callTimer={callTimer}
                    micMuted={callAudioSettings.micMuted}
                    onToggleMic={() => void applyCallAudioPatch({ micMuted: !callAudioSettings.micMuted })}
                    onEnd={() => void endActiveCall()}
                    onExpand={() => setIsCallMinimized(false)}
                  />
                )}
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
                {isMessageSelectionMode && (
                  <div className="message-selection-banner" role="status" aria-live="polite">
                    <span>
                      {selectedMessageIds.length} message{selectedMessageIds.length === 1 ? "" : "s"} selected
                    </span>
                    <button
                      type="button"
                      className="icon-button subtle"
                      aria-label="Exit message selection mode"
                      onClick={clearSelectedMessages}
                    >
                      <X aria-hidden="true" size={18} />
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
                <div
                  className={
                    messages.length === 0
                      ? "phase-empty-state"
                      : `messages-panel${showDockedEmojiPicker ? " messages-panel--emoji-docked" : ""}`
                  }
                  aria-busy={isChatLoading}
                  ref={messagesPanelRef}
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
                        <div className="thread-header">
                          <button type="button" onClick={() => setThreadRootMessageId(null)}>
                            <span className="ms-icon ms-icon--20" aria-hidden={true}>
                              arrow_back
                            </span>
                            Back to chat
                          </button>
                          <span>
                            {selectedChat?.type === "channel" ? "Comments on: " : "Thread on: "}
                            {messageActionSummary(threadRootMessage)}
                          </span>
                        </div>
                      )}
                      <div className="date-separator">{formatDateSeparator(visibleMessages[0]?.createdAt)}</div>
                      {visibleMessages.map((message, messageIndex) => {
                        const mine = message.senderId === currentUser?.id;
                        const previousMessage =
                          messageIndex > 0 ? visibleMessages[messageIndex - 1] : undefined;
                        const grouped = isGroupedMessage(
                          message,
                          previousMessage,
                          currentUser?.id
                        );
                        const repliedMessage = message.replyToMessageId
                          ? messages.find((candidate) => candidate.id === message.replyToMessageId)
                          : null;
                        const senderProfile = selectedChat.members.find(
                          (member) => member.id === message.senderId
                        );
                        const showSenderIdentity = shouldShowMessageSender(selectedChat.type, mine);
                        const mediaOnlyMessage = messageHasOnlyMediaAttachments(message);
                        const hasCaption = Boolean(message.content?.trim());
                        const swipeStateForMessage =
                          swipeReplyState?.messageId === message.id ? swipeReplyState : null;
                        const swipeProgress = swipeStateForMessage
                          ? Math.min(swipeStateForMessage.offset / SWIPE_REPLY_TRIGGER_OFFSET, 1)
                          : 0;
                        const swipeStyle = swipeStateForMessage
                          ? ({
                              "--message-swipe-offset": `${swipeStateForMessage.offset}px`,
                              "--message-swipe-progress": String(swipeProgress),
                            } as CSSProperties)
                          : undefined;
                        const isSelected = selectedMessageIds.includes(message.id);
                        const messageMeta = (
                          <span className="message-meta">
                            {messageDeliveryLabel(message, mine)}
                            {mine && message.deliveryState !== "failed" && (
                              <CheckCheck aria-hidden="true" size={14} />
                            )}
                          </span>
                        );
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
                        return (
                          <article
                            className={`message-bubble ${selectedChat.type === "direct" ? "direct" : ""} ${mine ? "mine" : ""} ${grouped ? "grouped" : ""} ${message.deliveryState ?? ""} ${mediaOnlyMessage ? "has-photo-attachments" : ""} ${emojiSizeClass(message.content)}${swipeStateForMessage ? " is-swipe-active" : ""}${swipeStateForMessage?.activated ? " is-swipe-armed" : ""}${isMessageSelectionMode ? " is-selection-mode" : ""}${isSelected ? " is-selected" : ""}`}
                            id={message.id}
                            key={message.id}
                            aria-pressed={isMessageSelectionMode ? isSelected : undefined}
                            onClick={(event) => handleMessageBubbleClick(event, message)}
                            onContextMenu={(event) => openMessageContextMenu(event, message)}
                            onPointerCancel={(event) =>
                              endSwipeReplyGesture(event, message, { commit: false })
                            }
                            onPointerDown={(event) => beginSwipeReplyGesture(event, message)}
                            onPointerMove={(event) => handleSwipeReplyMove(event, message)}
                            onPointerUp={(event) => endSwipeReplyGesture(event, message)}
                            style={swipeStyle}
                          >
                            {isSelected && (
                              <span className="message-selection-indicator" aria-hidden="true">
                                <CheckCheck size={14} />
                              </span>
                            )}
                            <span className="message-swipe-affordance" aria-hidden="true" />
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
                            {repliedMessage && (
                              <button
                                type="button"
                                className="message-reference message-reference-button"
                                onClick={() =>
                                  focusMessageInPanel({
                                    messageId: repliedMessage.id,
                                    highlightClassName: "message-context-flash",
                                  })
                                }
                              >
                                Reply to {repliedMessage.senderDisplayName ?? "Family member"}:{" "}
                                {messageActionSummary(repliedMessage)}
                              </button>
                            )}
                            {message.forwardedFrom && (
                              <span className="message-reference">
                                Forwarded from {message.forwardedFrom.senderDisplayName ?? "Family member"}
                              </span>
                            )}
                            {message.attachments.length > 0 && (() => {
                              const { media, other } = partitionMessageAttachments(message.attachments);
                              const showAlbumMeta = mediaOnlyMessage && !hasCaption && media.length > 0;
                              const mediaDisabledReason =
                                callPhase !== "idle"
                                  ? "Media playback is paused while a call is active"
                                  : undefined;
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
                                  onOpenImage={openFullViewImage}
                                  videoAutoplay={appearance.videoAutoplay}
                                />
                              );

                              return (
                                <div className="message-attachments">
                                  {media.length > 1 ? (
                                    <div
                                      className={
                                        showAlbumMeta
                                          ? "message-photo-stack message-media-album-stack"
                                          : "message-media-album-stack"
                                      }
                                    >
                                      <MessageMediaAlbum
                                        accessToken={accessToken}
                                        chatId={message.chatId}
                                        messageId={message.id}
                                        files={media}
                                        disabledReason={mediaDisabledReason}
                                        videoAutoplay={appearance.videoAutoplay}
                                        renderImage={(file) => (
                                          <MessageImageAttachment
                                            accessToken={accessToken}
                                            file={file}
                                            onOpenImage={openFullViewImage}
                                          />
                                        )}
                                      />
                                      {showAlbumMeta ? messageMeta : null}
                                    </div>
                                  ) : (
                                    media.map((file) => {
                                      const showOverlayMeta =
                                        showAlbumMeta && isImageAttachment(file);
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
                            {(hasCaption || message.deliveryError || !mediaOnlyMessage) && (
                              <div className="message-bubble-inner">
                                {hasCaption ? (
                                  <div className="message-body">
                                    {appearance.renderMarkdown ? (
                                      <MessageMarkdown source={message.content} />
                                    ) : (
                                      message.content
                                    )}
                                    {message.isEdited && (
                                      <span className="message-edited-label" aria-label="Edited">
                                        (edited)
                                      </span>
                                    )}
                                  </div>
                                ) : null}
                                {message.deliveryError ? (
                                  <p className="encrypted-message-unavailable">{message.deliveryError}</p>
                                ) : null}
                                {(!mediaOnlyMessage || hasCaption) && messageMeta}
                              </div>
                            )}
                            {message.reactions.length > 0 && (
                              <div className="message-reactions" aria-label="Message reactions">
                                {message.reactions.map((reaction) => {
                                  const userIds = uniqueUserIds(reaction.userIds);
                                  const names = userIds
                                    .map(
                                      (userId) =>
                                        memberLookup.get(userId)?.displayName ?? "Family member"
                                    )
                                    .join(", ");
                                  const reacted = currentUser
                                    ? userIds.includes(currentUser.id)
                                    : reaction.reacted;
                                  return (
                                    <button
                                      type="button"
                                      className={`reaction-pill ${reacted ? "active" : ""}`}
                                      aria-label={`${reaction.emoji} reaction from ${names}`}
                                      title={names}
                                      key={reaction.emoji}
                                      onClick={() => void handleMessageReaction(message, reaction.emoji)}
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
                            {(threadReplyCounts.get(message.id) ?? 0) > 0 && (
                              <button
                                type="button"
                                className="thread-open-button"
                                onClick={() => {
                                  void handleOpenThread(message);
                                }}
                              >
                                {threadReplyCounts.get(message.id)}{" "}
                                {selectedChat?.type === "channel" ? "comments" : "thread messages"}
                              </button>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
                {messageContextMenu && (
                  <div
                    className="action-menu message-context-menu"
                    role="menu"
                    style={{ left: messageContextMenu.x, top: messageContextMenu.y }}
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <div className="message-context-reactions" aria-label="React to message">
                      {MESSAGE_REACTION_CHOICES.map((emoji) => (
                        <button
                          type="button"
                          className={contextMenuCurrentReaction?.emoji === emoji ? "active" : ""}
                          aria-label={`React with ${emoji}`}
                          title={`React with ${emoji}`}
                          key={emoji}
                          disabled={messageContextMenu.message.id.startsWith("pending:")}
                          onClick={() => {
                            setMessageContextMenu(null);
                            void handleMessageReaction(messageContextMenu.message, emoji);
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={channelCommentsDisabledForViewer}
                      onClick={() => handleReplyToMessage(messageContextMenu.message)}
                    >
                      <Reply aria-hidden="true" size={16} />
                      {selectedChat?.type === "channel" ? "Comment" : "Reply"}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!messageContextMenu.message.content}
                      onClick={() => {
                        setCopySheetContent(messageContextMenu.message.content ?? "");
                        setMessageContextMenu(null);
                      }}
                    >
                      <span className="ms-icon ms-icon--20" aria-hidden={true}>content_copy</span>
                      Copy
                    </button>
                    {selectedChat &&
                      (selectedChat.pinPermission !== "admins_only" ||
                        (currentUser &&
                          (currentUser.role === "owner" || currentUser.role === "admin"))) && (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={messageContextMenu.message.id.startsWith("pending:")}
                          onClick={() => {
                            if (pinnedMessages.some((p) => p.messageId === messageContextMenu.message.id)) {
                              void handleUnpinMessage(messageContextMenu.message);
                            } else {
                              void handlePinMessage(messageContextMenu.message);
                            }
                          }}
                        >
                          <Pin aria-hidden="true" size={16} />
                          {pinnedMessages.some((p) => p.messageId === messageContextMenu.message.id)
                            ? "Unpin message"
                            : "Pin message"}
                        </button>
                      )}
                    <button
                      type="button"
                      role="menuitem"
                      disabled={messageContextMenu.message.id.startsWith("pending:")}
                      onClick={() => {
                        setForwardTarget(messageContextMenu.message);
                        setMessageContextMenu(null);
                      }}
                    >
                      <Forward aria-hidden="true" size={16} />
                      Forward
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={messageContextMenu.message.id.startsWith("pending:")}
                      onClick={() => void handleArchiveMessage(messageContextMenu.message)}
                    >
                      <Star aria-hidden="true" size={16} />
                      Save to Message Archive
                    </button>
                    {messageContextMenu.message.senderId === currentUser?.id &&
                      Boolean(messageContextMenu.message.content?.trim()) && (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={messageContextMenu.message.id.startsWith("pending:")}
                          onClick={() => handleEditMessage(messageContextMenu.message)}
                        >
                          <Pencil aria-hidden="true" size={16} />
                          Edit
                        </button>
                      )}
                    {messageContextMenu.message.senderId === currentUser?.id && (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={messageContextMenu.message.id.startsWith("pending:")}
                        onClick={() => {
                          setDeleteForMe(true);
                          setDeleteForEveryone(true);
                          setDeleteTarget(messageContextMenu.message);
                          setMessageContextMenu(null);
                        }}
                      >
                        <X aria-hidden="true" size={16} />
                        Delete
                      </button>
                    )}
                    {isMultiMemberChat(selectedChat?.type ?? "direct") && (
                      <div className="message-context-seen-by" aria-live="polite">
                        <strong>Seen by</strong>
                        {contextMenuSeenBy.length > 0 ? (
                          <ul>
                            {contextMenuSeenBy.map((status) => (
                              <li key={status.userId}>
                                <span>{status.displayName}</span>
                                <time dateTime={status.createdAt}>
                                  {new Date(status.createdAt).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit"
                                  })}
                                </time>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>No readers yet</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {pendingAttachments.length > 0 && (
                  <div className="composer-attachments-strip" aria-label="Attachments to send">
                    <div className="pending-attachments">
                      {pendingAttachments.map((pending) => (
                        <PendingAttachmentCard
                          key={pending.localId}
                          pending={pending}
                          onRemove={() => removePendingAttachment(pending.localId)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <form
                  className={`message-composer${isDockedEmojiPicker ? " message-composer--emoji-docked" : ""}${showDockedEmojiPicker ? " message-composer--emoji-open" : ""}`}
                  onSubmit={handleSendMessage}
                >
                  {selectedChat?.type === "channel" && channelCommentsDisabledForViewer && (
                    <p className="muted-copy">Comments are disabled in this channel.</p>
                  )}
                  {replyTarget && (
                    <div className="reply-composer-preview">
                      <Reply aria-hidden="true" size={16} />
                      <span>
                        {selectedChat?.type === "channel" ? "Commenting on " : "Replying to "}
                        {replyTarget.senderDisplayName ?? "Family member"}:{" "}
                        {messageActionSummary(replyTarget)}
                      </span>
                      <button
                        type="button"
                        aria-label="Cancel reply"
                        title="Cancel reply"
                        onClick={() => setReplyTarget(null)}
                      >
                        <X aria-hidden="true" size={14} />
                      </button>
                    </div>
                  )}
                  {editTargetMessage && (
                    <div className="editing-indicator">
                      <Pencil aria-hidden="true" size={16} />
                      <span>Editing message</span>
                      <button
                        type="button"
                        aria-label="Cancel edit"
                        title="Cancel edit"
                        onClick={cancelEditMode}
                      >
                        <X aria-hidden="true" size={14} />
                      </button>
                    </div>
                  )}
                  <div className="message-composer-row">
                    <button
                      type="button"
                      className="file-picker"
                      aria-label="Attach files"
                      title="Attach files"
                      disabled={isUploading || channelCommentsDisabledForViewer || missingCommentThread}
                      onClick={handleAttachButtonClick}
                    >
                      <Paperclip aria-hidden="true" size={22} />
                    </button>
                    <div className="emoji-picker-shell" ref={emojiPickerRef}>
                      <button
                        type="button"
                        className="emoji-picker-button"
                        aria-label="Add emoji"
                        aria-expanded={isEmojiPickerOpen}
                        title="Add emoji"
                        disabled={channelCommentsDisabledForViewer || missingCommentThread}
                        onClick={toggleEmojiPicker}
                    >
                      <Smile aria-hidden="true" size={22} />
                      </button>
                      {!showDockedEmojiPicker && isEmojiPickerOpen && (
                        <div
                          className="emoji-picker"
                          role="menu"
                          aria-label="Choose emoji"
                        >
                          <EmojiPicker
                            onEmojiClick={handleComposerEmojiPick}
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
                    <input
                      ref={attachmentInputRef}
                      accept={DESKTOP_ATTACHMENT_ACCEPT}
                      className="visually-hidden"
                      disabled={isUploading || channelCommentsDisabledForViewer || missingCommentThread}
                      multiple
                      type="file"
                      onChange={handleFileSelect}
                    />
                    <input
                      ref={galleryAttachmentInputRef}
                      accept={GALLERY_ATTACHMENT_ACCEPT}
                      className="visually-hidden"
                      disabled={isUploading || channelCommentsDisabledForViewer || missingCommentThread}
                      multiple
                      type="file"
                      onChange={handleFileSelect}
                    />
                    <input
                      ref={cameraAttachmentInputRef}
                      accept={CAMERA_ATTACHMENT_ACCEPT}
                      capture="environment"
                      className="visually-hidden"
                      disabled={isUploading || channelCommentsDisabledForViewer || missingCommentThread}
                      type="file"
                      onChange={handleFileSelect}
                    />
                    <input
                      ref={audioAttachmentInputRef}
                      accept={AUDIO_ATTACHMENT_ACCEPT}
                      className="visually-hidden"
                      disabled={isUploading || channelCommentsDisabledForViewer || missingCommentThread}
                      multiple
                      type="file"
                      onChange={handleFileSelect}
                    />
                    <input
                      ref={documentAttachmentInputRef}
                      accept={DOCUMENT_ATTACHMENT_ACCEPT}
                      className="visually-hidden"
                      disabled={isUploading || channelCommentsDisabledForViewer || missingCommentThread}
                      multiple
                      type="file"
                      onChange={handleFileSelect}
                    />
                    <AttachmentPickerSheet
                      open={isAttachmentSheetOpen}
                      onClose={() => setIsAttachmentSheetOpen(false)}
                      onPick={handleAttachmentSheetPick}
                    />
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
                          clearComposerFormattingSelection();
                          handleComposerChange(event.target.value);
                        }}
                        onFocus={handleComposerFocus}
                        onKeyDown={handleComposerKeyDown}
                        onKeyUp={updateComposerFormattingSelection}
                        onPointerUp={updateComposerFormattingSelection}
                        onScroll={updateComposerFormattingSelection}
                        onSelect={updateComposerFormattingSelection}
                        onContextMenu={(event) => {
                          const textarea = event.currentTarget;
                          if (textarea.selectionStart !== textarea.selectionEnd) {
                            // Prefer the Telegram-style formatting toolbar over the OS menu.
                            event.preventDefault();
                            updateComposerFormattingSelection();
                          }
                        }}
                      />
                    </div>
                    <FormattingToolbar
                      selection={composerFormattingSelectionRef.current}
                      anchor={formattingToolbarAnchor}
                      onFormat={handleComposerFormat}
                      onCut={handleComposerCut}
                      onCopy={handleComposerCopy}
                      onPaste={() => void handleComposerPaste()}
                    />
                    <div className="message-composer-actions">
                      {composerIsMultiline && (
                        <MessageEnlargeButton onClick={() => setComposerEnlargeOpen(true)} />
                      )}
                      {(!composer.trim() &&
                        pendingAttachments.length === 0 &&
                        isVoiceRecordingSupported()) || isVoiceRecording ? (
                        <VoiceRecordButton
                          isRecording={isVoiceRecording}
                          disabled={
                            isUploading ||
                            isSendingMessage ||
                            channelCommentsDisabledForViewer ||
                            missingCommentThread
                          }
                          onPressStart={(event) => void handleVoicePressStart(event)}
                          onPressEnd={(event) => void handleVoicePressEnd(event)}
                          onPressCancel={handleVoicePressCancel}
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
                        >
                          <span className="ms-icon ms-icon--20" aria-hidden={true}>
                            send
                          </span>
                          {(isUploading || isSendingMessage) && (
                            <span className="visually-hidden">
                              {isUploading ? "Uploading" : "Sending"}
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  {showDockedEmojiPicker && (
                    <div
                      className="emoji-picker-dock"
                      ref={emojiPickerDockRef}
                      role="group"
                      aria-label="Emoji picker"
                    >
                      <div className="emoji-picker emoji-picker--docked" role="menu" aria-label="Choose emoji">
                        <EmojiPicker
                          onEmojiClick={handleComposerEmojiPick}
                          autoFocusSearch={false}
                          lazyLoadEmojis
                          previewConfig={{ showPreview: false }}
                          searchDisabled
                          skinTonesDisabled
                          categoryIcons={EMOJI_CATEGORY_ICONS}
                          theme={resolvedThemeMode === "light" ? Theme.LIGHT : Theme.DARK}
                          width="100%"
                          height={320}
                        />
                      </div>
                    </div>
                  )}
                </form>
              </>
            ) : (
              <div className="empty-state chat-empty-state">
                <MessageCircle aria-hidden="true" size={42} />
                <strong>Select a chat</strong>
                <p>Choose a conversation on the left, or start a new small-circle chat.</p>
                <button type="button" onClick={openNewChatScreen}>
                  New message
                </button>
              </div>
            )}
          </section>
          {selectedChat && isDetailsOpen && (
            <ChatInfoPanel
              accessToken={accessToken}
              chat={selectedChat}
              chatPhotoInputRef={chatPhotoInputRef}
              chatTitleDraft={chatTitleDraft}
              canManageChat={canManageSelectedChat}
              currentUser={currentUser}
              currentUserId={currentUser?.id}
              detailsTab={detailsTab}
              isUploading={isUploading}
              sharedContentItems={sharedContentItems}
              onChatPhotoSelect={handleChatPhotoSelect}
              onChatSettingsSubmit={handleChatSettingsSubmit}
              onClose={() => setIsDetailsOpen(false)}
              onCommentsEnabledChange={handleCommentsEnabledChange}
              onDetailsTabChange={setDetailsTab}
              onFocusComposer={focusComposer}
              onMediaVisibilityChange={handleMediaVisibilityChange}
              onOpenImage={openFullViewImage}
              onPinPermissionChange={handlePinPermissionChange}
              onPreferenceChange={handleChatPreferenceChange}
              onTitleDraftChange={setChatTitleDraft}
            />
          )}
        </div>
        {audioRestoreStatus && <p className="audio-restore-status" role="status">{audioRestoreStatus}</p>}
        <audio ref={remoteAudioRef} autoPlay className="visually-hidden" />
        {callPhase !== "idle" && (
          <>
            {!isCallMinimized && !isMobileViewport && (
              <div className="call-popup-backdrop-overlay" aria-hidden="true" />
            )}
            <section
            className={[
              "call-popup",
              isCallMinimized ? "call-popup-minimized" : "",
              isMobileViewport ? "call-popup-fullscreen" : "",
              isCallMinimized && isMobileViewport ? "call-popup-slim-host" : "",
            ].filter(Boolean).join(" ")}
            role="dialog"
            aria-modal="false"
            aria-label={
              callPhase === "incoming"
                ? "Incoming call"
                : callPhase === "outgoing"
                ? "Outgoing call"
                : "Active call"
            }
          >
            {/* Mobile incoming call full-screen */}
            {isMobileViewport && !isCallMinimized && callPhase === "incoming" && (
              <MobileIncomingScreen
                peerName={(callPeerDisplayName ?? activeCallPeerName) ?? ""}
                callType={callType}
                onAccept={() => void acceptIncomingCall()}
                onDecline={declineIncomingCall}
              />
            )}
            {/* Mobile active call full-screen */}
            {isMobileViewport && !isCallMinimized && callPhase !== "incoming" && (
              <MobileActiveScreen
                peerName={(callPeerDisplayName ?? activeCallPeerName) ?? ""}
                callType={callType}
                callPhase={callPhase}
                isPeerSpeaking={isPeerSpeaking}
                isProximityNear={isProximityNear}
                isMicMuted={callAudioSettings.micMuted}
                isCameraEnabled={callAudioSettings.cameraEnabled}
                cameraFacingMode={callAudioSettings.cameraFacingMode}
                speakerMode={callAudioSettings.speakerMode}
                timer={callTimer}
                hasRemoteVideo={hasRemoteVideo}
                localVideoStream={localVideoStream}
                remoteVideoStream={remoteVideoStream}
                mirrorLocalVideo={callAudioSettings.mirrorLocalVideo}
                onToggleMic={() => void applyCallAudioPatch({ micMuted: !callAudioSettings.micMuted })}
                onToggleCamera={() => {
                  if (!hasLiveLocalVideo(localVideoStream)) {
                    // Camera not yet open — start it. Set callType to "video"
                    // immediately so the mobile video element mounts before
                    // onLocalStreamReady fires (prevents black screen on
                    // first camera enable on iOS/Android). We check live video
                    // tracks (not callType) because callType can already be
                    // "video" while the stream is still audio-only (e.g.
                    // Android prepareForCall raced ahead of accept).
                    setCallType("video");
                    void audioCallRef.current?.toggleVideo(true);
                  } else {
                    void applyCallAudioPatch({ cameraEnabled: !callAudioSettings.cameraEnabled });
                  }
                }}
                onToggleFlip={() => void applyCallAudioPatch({
                  cameraFacingMode: callAudioSettings.cameraFacingMode === "user" ? "environment" : "user",
                })}
                onOpenSpeakerSheet={() => setIsSpeakerSheetOpen(true)}
                onEnd={() => void endActiveCall()}
              />
            )}
            {/* ── Header row ── */}
            {!(isMobileViewport && !isCallMinimized && callPhase === "incoming") &&
              !(isCallMinimized && isMobileViewport) && (
            <div className="call-popup-header">
                <>
                  <strong className="call-popup-status">
                    {callPhase === "incoming"
                      ? (callType === "video" ? "Incoming video call" : "Incoming call")
                      : callPhase === "outgoing"
                      ? "Ringing…"
                      : callPhase === "connecting"
                      ? "Connecting…"
                      : callType === "video"
                      ? "Video call"
                      : "Audio call"}
                  </strong>
                  {callNotice && <span className="call-popup-notice">{callNotice}</span>}
                </>
              <div className="call-popup-header-actions">
                {callPhase !== "incoming" && !isCallMinimized && (
                  <button
                    type="button"
                    className="icon-button subtle"
                    aria-label={isCallMinimized ? "Restore call window" : "Minimise call window"}
                    onClick={() => setIsCallMinimized((v) => !v)}
                  >
                    {isCallMinimized ? (
                      <Maximize2 aria-hidden="true" size={16} />
                    ) : (
                      <Minimize2 aria-hidden="true" size={16} />
                    )}
                  </button>
                )}
              </div>
            </div>
            )}

            {/* ── Video area — always rendered so refs stay stable (hidden via CSS when unused) ── */}
            <div className={`call-popup-video-area${(isCallMinimized || (callType === "audio" && !hasRemoteVideo)) ? " call-popup-video-area-hidden" : ""}`}>
              <video
                ref={remoteVideoRef}
                className={`call-popup-remote-video${(callType === "video" || hasRemoteVideo) && callPhase === "in-call" && !isCallMinimized && !isMobileViewport ? " visible" : ""}`}
                autoPlay
                playsInline
              />
              <video
                ref={localVideoRef}
                className={[
                  "call-popup-local-video",
                  callType === "video" && callPhase === "in-call" && !isCallMinimized && !isMobileViewport ? "visible" : "",
                  callAudioSettings.mirrorLocalVideo ? "mirrored" : "",
                ].filter(Boolean).join(" ")}
                autoPlay
                playsInline
                muted
              />
            </div>

            {/* ── Peer name (incoming) ── */}
            {!isCallMinimized && callPhase === "incoming" && !(isMobileViewport && !isCallMinimized) && (
              <p className="call-popup-peer-name">{callPeerDisplayName ?? activeCallPeerName} is calling you.</p>
            )}

            {/* Avatar area — shown when no remote video is playing */}
            {!isCallMinimized && (callType === "audio" || !callAudioSettings.cameraEnabled) && callPhase === "in-call" && !isMobileViewport && (
              <div className="call-popup-avatar-area">
                <div className="call-popup-avatar-circle">
                  {(callPeerDisplayName ?? activeCallPeerName) ? (callPeerDisplayName ?? activeCallPeerName)!.charAt(0).toUpperCase() : "?"}
                  <div className={`call-popup-avatar-ring${isPeerSpeaking ? "" : " silent"}`} />
                  <div className={`call-popup-avatar-ring${isPeerSpeaking ? "" : " silent"}`} />
                </div>
                <div className="call-popup-waveform">
                  {[0,1,2,3,4].map((i) => (
                    <div key={i} className={`call-popup-wave-bar${isPeerSpeaking ? "" : " silent"}`} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Controls row ── */}
            {!isCallMinimized && !isMobileViewport && (
              <div className="call-ctrl-row call-popup-ctrl-row">
                {callPhase === "incoming" && (
                  <>
                    <div className="call-ctrl-wrap">
                      <button
                        type="button"
                        className="call-ctrl-btn accept-btn"
                        aria-label="Accept call"
                        onClick={() => void acceptIncomingCall()}
                      >
                        <Phone aria-hidden="true" size={22} />
                      </button>
                      <span>Accept</span>
                    </div>
                    <div className="call-ctrl-wrap">
                      <button
                        type="button"
                        className="call-ctrl-btn end-btn"
                        aria-label="Decline call"
                        onClick={declineIncomingCall}
                      >
                        <svg aria-hidden="true" width={22} height={22} viewBox="0 0 24 24" style={{ transform: "rotate(135deg)" }} fill="currentColor">
                          <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
                        </svg>
                      </button>
                      <span>Decline</span>
                    </div>
                  </>
                )}
                {(callPhase === "outgoing" || callPhase === "connecting" || callPhase === "in-call") && (
                  <>
                    <div className="call-ctrl-wrap">
                      <button
                        type="button"
                        className={`call-ctrl-btn${callAudioSettings.micMuted ? " is-muted" : ""}`}
                        aria-label={callAudioSettings.micMuted ? "Unmute microphone" : "Mute microphone"}
                        onClick={() => void applyCallAudioPatch({ micMuted: !callAudioSettings.micMuted })}
                      >
                        {callAudioSettings.micMuted ? (
                          <MicOff aria-hidden="true" size={20} />
                        ) : (
                          <Mic aria-hidden="true" size={20} />
                        )}
                      </button>
                      <span>{callAudioSettings.micMuted ? "Unmute" : "Mute"}</span>
                    </div>
                    {isMobileViewport && (
                      <div className="call-ctrl-wrap">
                        <button
                          type="button"
                          className={`call-ctrl-btn${callAudioSettings.speakerMode === "large" ? " is-active" : ""}`}
                          aria-label={
                            callAudioSettings.speakerMode === "small"
                              ? "Switch to loudspeaker"
                              : "Switch to earpiece"
                          }
                          onClick={() =>
                            void applyCallAudioPatch({
                              speakerMode: callAudioSettings.speakerMode === "small" ? "large" : "small",
                            })
                          }
                        >
                          {callAudioSettings.speakerMode === "small" ? (
                            <Smartphone aria-hidden="true" size={20} />
                          ) : (
                            <Volume2 aria-hidden="true" size={20} />
                          )}
                        </button>
                        <span>{callAudioSettings.speakerMode === "small" ? "Speaker" : "Earpiece"}</span>
                      </div>
                    )}
                    <div className="call-ctrl-wrap">
                      <button
                        ref={callSettingsButtonRef}
                        type="button"
                        className={`call-ctrl-btn${isCallSettingsMenuOpen || isCallAudioPopupOpen ? " is-active" : ""}`}
                        aria-label="Audio settings"
                        aria-haspopup="dialog"
                        aria-expanded={isCallSettingsMenuOpen || isCallAudioPopupOpen}
                        onClick={() => {
                          if (isCallAudioPopupOpen) {
                            setIsCallAudioPopupOpen(false);
                            setIsCallSettingsMenuOpen(false);
                          } else {
                            setIsCallSettingsMenuOpen((v) => !v);
                          }
                        }}
                      >
                        <SlidersHorizontal aria-hidden="true" size={20} />
                      </button>
                      <span>Settings</span>
                    </div>
                    {callPhase === "in-call" && (
                      <>
                        <div className="call-ctrl-wrap">
                          <button
                            type="button"
                            className={`call-ctrl-btn${callType === "video" && callAudioSettings.cameraEnabled ? "" : " is-muted"}`}
                            aria-label={
                              callType === "video" && callAudioSettings.cameraEnabled
                                ? "Turn off camera"
                                : "Turn on camera"
                            }
                            onClick={() => {
                              if (callType === "audio" || !hasLiveLocalVideo(localVideoStream)) {
                                setCallType("video");
                                void audioCallRef.current?.toggleVideo(true);
                              } else {
                                void applyCallAudioPatch({ cameraEnabled: !callAudioSettings.cameraEnabled });
                              }
                            }}
                          >
                            {callType === "video" && callAudioSettings.cameraEnabled ? (
                              <Video aria-hidden="true" size={20} />
                            ) : (
                              <VideoOff aria-hidden="true" size={20} />
                            )}
                          </button>
                          <span>
                            {callType === "video" && callAudioSettings.cameraEnabled ? "Camera" : "Camera off"}
                          </span>
                        </div>
                        {isMobileViewport && callType === "video" && (
                          <div className="call-ctrl-wrap">
                            <button
                              type="button"
                              className="call-ctrl-btn"
                              aria-label="Flip camera"
                              onClick={() =>
                                void applyCallAudioPatch({
                                  cameraFacingMode:
                                    callAudioSettings.cameraFacingMode === "user" ? "environment" : "user",
                                })
                              }
                            >
                              <RotateCcw aria-hidden="true" size={20} />
                            </button>
                            <span>Flip</span>
                          </div>
                        )}
                      </>
                    )}
                    <div className="call-ctrl-wrap">
                      <button
                        type="button"
                        className="call-ctrl-btn end-btn"
                        aria-label="End call"
                        onClick={() => void endActiveCall()}
                      >
                        <svg aria-hidden="true" width={20} height={20} viewBox="0 0 24 24" style={{ transform: "rotate(135deg)" }} fill="currentColor">
                          <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
                        </svg>
                      </button>
                      <span>End</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Minimized state: single-line chip controls (desktop only — mobile bar is in header) */}
            {isCallMinimized && !isMobileViewport && (
              <div className="call-status-chip-controls">
                {(callPhase === "outgoing" || callPhase === "connecting" || callPhase === "in-call") && (
                  <button
                    type="button"
                    className={`call-ctrl-btn call-chip-btn${callAudioSettings.micMuted ? " is-muted" : ""}`}
                    aria-label={callAudioSettings.micMuted ? "Unmute" : "Mute"}
                    onClick={() => void applyCallAudioPatch({ micMuted: !callAudioSettings.micMuted })}
                  >
                    {callAudioSettings.micMuted ? (
                      <MicOff aria-hidden="true" size={16} />
                    ) : (
                      <Mic aria-hidden="true" size={16} />
                    )}
                  </button>
                )}
                {(callPhase === "outgoing" || callPhase === "connecting" || callPhase === "in-call") && (
                  <button
                    type="button"
                    className={`call-ctrl-btn call-chip-btn call-chip-video${callType === "video" && callAudioSettings.cameraEnabled ? "" : " is-muted"}`}
                    aria-label={
                      callType === "video" && callAudioSettings.cameraEnabled
                        ? "Turn off camera"
                        : "Turn on camera"
                    }
                    onClick={() => {
                      if (callType === "audio" || !hasLiveLocalVideo(localVideoStream)) {
                        setCallType("video");
                        void audioCallRef.current?.toggleVideo(true);
                      } else {
                        void applyCallAudioPatch({ cameraEnabled: !callAudioSettings.cameraEnabled });
                      }
                    }}
                  >
                    {callType === "video" && callAudioSettings.cameraEnabled ? (
                      <Video aria-hidden="true" size={16} />
                    ) : (
                      <VideoOff aria-hidden="true" size={16} />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  className="call-ctrl-btn call-chip-btn end-btn"
                  aria-label="End call"
                  onClick={() => void endActiveCall()}
                >
                  <svg aria-hidden="true" width={16} height={16} viewBox="0 0 24 24" style={{ transform: "rotate(135deg)" }} fill="currentColor">
                    <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
                  </svg>
                </button>
                <button
                  type="button"
                  className="icon-button subtle call-chip-restore"
                  aria-label="Restore call window"
                  onClick={() => setIsCallMinimized(false)}
                >
                  <Maximize2 aria-hidden="true" size={15} />
                </button>
              </div>
            )}

            {/* Settings menus (rendered inside popup) */}
            {isCallSettingsMenuOpen && (
              <CallSettingsContextMenu
                anchorRef={callSettingsButtonRef}
                menuRef={callSettingsMenuRef}
                onOpenAudioSettings={() => {
                  setIsCallSettingsMenuOpen(false);
                  setIsCallAudioPopupOpen(true);
                }}
                onOpenVideoSettings={() => {
                  setIsCallSettingsMenuOpen(false);
                  setIsCallVideoPopupOpen(true);
                }}
              />
            )}
            {isCallAudioPopupOpen && (
              <CallAudioSettingsPopup
                popupRef={callAudioPopupRef}
                isMobile={isMobileViewport}
                settings={callAudioSettings}
                capabilities={callAudioCapabilities}
                devices={callAudioDevices}
                trackStatus={callTrackStatus}
                warning={callAudioWarning}
                onPatch={(patch) => void applyCallAudioPatch(patch)}
                onClose={() => setIsCallAudioPopupOpen(false)}
              />
            )}
            {isCallVideoPopupOpen && (
              <CallVideoSettingsPopup
                settings={callAudioSettings}
                capabilities={callAudioCapabilities}
                devices={callAudioDevices}
                isMobile={isMobileViewport}
                onPatch={(patch) => void applyCallAudioPatch(patch)}
                onClose={() => setIsCallVideoPopupOpen(false)}
              />
            )}
          </section>
          {isSpeakerSheetOpen && (
            <CallSpeakerSheet
              devices={callAudioDevices}
              currentOutputDeviceId={callAudioSettings.outputDeviceId}
              speakerMode={callAudioSettings.speakerMode}
              onSelect={(deviceId, mode) => {
                if (deviceId !== null) {
                  void applyCallAudioPatch({ outputDeviceId: deviceId, speakerMode: mode });
                } else {
                  void applyCallAudioPatch({ speakerMode: mode, outputDeviceId: "" });
                }
              }}
              onClose={() => setIsSpeakerSheetOpen(false)}
            />
          )}
          </>
        )}
        {isNewChatOpen &&
          createPortal(
            <div className="new-chat-modal-backdrop" onMouseDown={closeNewChatScreen}>
              <div onMouseDown={(event) => event.stopPropagation()}>
                <NewChatScreen
                  accessToken={accessToken}
                  screen={newChatScreen}
                  members={filteredNewChatMembers}
                  memberSearch={newChatMemberSearch}
                  groupTitle={groupTitle}
                  groupMemberIds={groupMemberIds}
                  onMemberSearchChange={setNewChatMemberSearch}
                  onScreenChange={setNewChatScreen}
                  onClose={closeNewChatScreen}
                  onStartDirect={(userId) => void startDirectChatWith(userId)}
                  onGroupTitleChange={setGroupTitle}
                  onToggleGroupMember={toggleGroupMember}
                  onCreateGroup={(event) => void handleCreateGroupChat(event)}
                  onCreateChannel={(event) => void handleCreateChannelChat(event)}
                />
              </div>
            </div>,
            document.body
          )}

        {forwardTarget && (
          <div className="modal-backdrop" role="presentation">
            <section className="messenger-modal" role="dialog" aria-modal="true" aria-labelledby="forward-title">
              <div className="modal-header">
                <h2 id="forward-title">Forward message</h2>
                <button
                  type="button"
                  className="icon-button subtle"
                  aria-label="Close forward dialog"
                  title="Close"
                  onClick={() => setForwardTarget(null)}
                >
                  <X aria-hidden="true" size={18} />
                </button>
              </div>
              <p className="forward-preview">{messageActionSummary(forwardTarget)}</p>
              <div className="forward-chat-list">
                {chats.map((chat) => (
                  <button
                    type="button"
                    key={chat.id}
                    onClick={() => void handleForwardMessage(chat.id)}
                  >
                    <RealAvatar
                      accessToken={accessToken}
                      className={`avatar member-avatar ${chatAvatarTypeClass(chat)}`}
                      fallbackKind={chatAvatarFallbackKind(chat)}
                      file={chatAvatarFile(chat, currentUser?.id)}
                      label={displayChatName(chat, currentUser?.id)}
                    />
                    <span>{displayChatName(chat, currentUser?.id)}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {deleteTarget && (
          <div className="modal-backdrop" role="presentation">
            <section
              className="messenger-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-message-title"
            >
              <div className="modal-header">
                <h2 id="delete-message-title">Delete message?</h2>
                <button
                  type="button"
                  className="icon-button subtle"
                  aria-label="Close delete dialog"
                  title="Close"
                  onClick={() => setDeleteTarget(null)}
                >
                  <X aria-hidden="true" size={18} />
                </button>
              </div>
              <div className="delete-message-options">
                <label>
                  <input
                    type="checkbox"
                    checked={deleteForMe}
                    onChange={(e) => setDeleteForMe(e.target.checked)}
                  />
                  Delete for me
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={deleteForEveryone}
                    onChange={(e) => setDeleteForEveryone(e.target.checked)}
                  />
                  Delete for everyone
                </label>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button-danger"
                  disabled={!deleteForMe && !deleteForEveryone}
                  onClick={() => void handleConfirmDelete()}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setDeleteTarget(null)}
                >
                  Cancel
                </button>
              </div>
            </section>
          </div>
        )}

        {fullViewImage && (
          <ImageLightbox
            imageUrl={fullViewImage.previewUrl}
            isExternallyClosing={isFullViewImageClosing}
            title={fullViewImage.file.originalName}
            subtitle={`${fullViewImage.file.mimeType} / ${formatFileSize(fullViewImage.file.sizeBytes)}`}
            onClose={finishCloseFullViewImage}
            onDownload={
              accessToken ? () => void saveFileToDisk(accessToken, fullViewImage.file) : undefined
            }
          />
        )}

        {composerEnlargeOpen && (
          <MessageEnlargeModal
            content={composer}
            renderMarkdown={appearance.renderMarkdown}
            editable
            onClose={() => setComposerEnlargeOpen(false)}
            onChange={(value) => handleComposerChange(value)}
          />
        )}

        {copySheetContent !== null && (
          <div
            className="copy-sheet-backdrop"
            role="presentation"
            onMouseDown={() => setCopySheetContent(null)}
          >
            <div
              className="copy-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Copy message text"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <CopySheetTextarea
                content={copySheetContent}
                onCopy={() => setCopySheetContent(null)}
                onClose={() => setCopySheetContent(null)}
              />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function CallSettingsContextMenu({
  anchorRef,
  menuRef,
  onOpenAudioSettings,
  onOpenVideoSettings,
}: {
  anchorRef: RefObject<HTMLButtonElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  onOpenAudioSettings: () => void;
  onOpenVideoSettings: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    const btn = anchorRef.current;
    if (!btn) return;
    const update = () => {
      const rect = btn.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [anchorRef]);

  if (!pos) return null;

  return (
    <div
      ref={menuRef}
      className="call-settings-context-menu"
      style={{ top: pos.top, right: pos.right }}
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        className="call-settings-context-item"
        onClick={onOpenAudioSettings}
      >
        <SlidersHorizontal aria-hidden="true" size={14} />
        Audio settings
      </button>
      <button
        type="button"
        role="menuitem"
        className="call-settings-context-item"
        onClick={onOpenVideoSettings}
      >
        <Video aria-hidden="true" size={14} />
        Video settings
      </button>
    </div>
  );
}

function AudioToggleRow({
  name,
  description,
  badge,
  checked,
  disabled,
  status,
  onChange,
}: {
  name: string;
  description: string;
  badge: "browser" | "software";
  checked: boolean;
  disabled: boolean;
  status: boolean | null;
  onChange: (value: boolean) => void;
}) {
  const id = `audio-toggle-${name.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className={`call-audio-toggle-row${disabled ? " disabled" : ""}`}>
      <div className="call-audio-toggle-info">
        <span id={id} className="call-audio-toggle-name">
          {name}
          <span className={`call-audio-badge call-audio-badge-${badge}`}>{badge}</span>
          {status === true && <span className="call-audio-status-chip active">active</span>}
          {status === false && <span className="call-audio-status-chip unsupported">not supported</span>}
        </span>
        <span className="call-audio-toggle-desc">{description}</span>
      </div>
      <label className="call-audio-toggle-switch">
        <input
          type="checkbox"
          aria-labelledby={id}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="call-audio-toggle-slider" />
      </label>
    </div>
  );
}

function CallAudioSettingsPopup({
  popupRef,
  isMobile,
  settings,
  capabilities,
  devices,
  trackStatus,
  warning,
  onPatch,
  onClose,
}: {
  popupRef: RefObject<HTMLDivElement | null>;
  isMobile: boolean;
  settings: CallSettings;
  capabilities: CallCapabilities;
  devices: CallDevice[];
  trackStatus: CallTrackStatus | null;
  warning: string | null;
  onPatch: (patch: Partial<CallSettings>) => void;
  onClose: () => void;
}) {
  const inputDevices = devices.filter((d) => d.kind === "audioinput");
  const outputDevices = devices.filter((d) => d.kind === "audiooutput");

  return (
    <div
      className="call-audio-popup-backdrop"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={popupRef}
        className="call-audio-popup"
        role="dialog"
        aria-modal="true"
        aria-label="Audio settings"
      >
      <div className="call-audio-popup-header">
        <span>Audio settings</span>
        <button type="button" className="call-audio-popup-close" aria-label="Close" autoFocus onClick={onClose}>
          <X aria-hidden="true" size={14} />
        </button>
      </div>

      <div className="call-audio-popup-body">
        {warning && <p className="call-audio-popup-warning">{warning}</p>}

        <section className="call-audio-popup-section">
          <div className="call-audio-section-label">Devices</div>
          <label className="call-audio-device-row">
            <span>Microphone</span>
            <select
              value={settings.inputDeviceId}
              disabled={!capabilities.canSelectInputDevice}
              onChange={(e) => onPatch({ inputDeviceId: e.target.value })}
            >
              <option value="">System default</option>
              {inputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          </label>
          <label className="call-audio-device-row">
            <span>Speaker</span>
            <select
              value={settings.outputDeviceId}
              disabled={!capabilities.canSelectOutputDevice}
              onChange={(e) => onPatch({ outputDeviceId: e.target.value })}
            >
              <option value="">System default</option>
              {outputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          </label>
          {!capabilities.canSelectOutputDevice && (
            <p className="call-audio-popup-note">This browser uses the system default output only.</p>
          )}
        </section>

        <div className="call-audio-popup-divider" />

        <section className="call-audio-popup-section">
          <div className="call-audio-section-label">Levels</div>
          <div className="call-audio-slider-row">
            <div className="call-audio-slider-head">
              <span>Input gain (mic boost)</span>
              <span className="call-audio-slider-value">{Math.round(settings.inputGain)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={200}
              step={1}
              value={settings.inputGain}
              onChange={(e) => onPatch({ inputGain: Number(e.target.value) })}
            />
          </div>
          <div className="call-audio-slider-row">
            <div className="call-audio-slider-head">
              <span>Output volume</span>
              <span className="call-audio-slider-value">{Math.round(settings.outputVolume)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={settings.outputVolume}
              onChange={(e) => onPatch({ outputVolume: Number(e.target.value) })}
            />
          </div>
        </section>

        <div className="call-audio-popup-divider" />

        <section className="call-audio-popup-section">
          <div className="call-audio-section-label">Processing</div>
          <div className="call-audio-toggle-group">
            <AudioToggleRow
              name="Noise suppression"
              description="Filters background noise via browser"
              badge="browser"
              checked={settings.noiseSuppression}
              disabled={!capabilities.canUseNoiseSuppression}
              status={trackStatus?.noiseSuppression ?? null}
              onChange={(v) => onPatch({ noiseSuppression: v })}
            />
            <AudioToggleRow
              name="Echo cancellation"
              description="Prevents mic from picking up speakers"
              badge="browser"
              checked={settings.echoCancellation}
              disabled={!capabilities.canUseEchoCancellation}
              status={trackStatus?.echoCancellation ?? null}
              onChange={(v) => onPatch({ echoCancellation: v })}
            />
            <AudioToggleRow
              name="Auto gain control"
              description="Normalises mic level automatically"
              badge="browser"
              checked={settings.autoGainControl}
              disabled={!capabilities.canUseAutoGainControl}
              status={trackStatus?.autoGainControl ?? null}
              onChange={(v) => onPatch({ autoGainControl: v })}
            />
            <AudioToggleRow
              name="Voice enhancement"
              description="Highpass filter + dynamics compressor"
              badge="software"
              checked={settings.voiceEnhancement}
              disabled={!capabilities.canUseVoiceEnhancement}
              status={null}
              onChange={(v) => onPatch({ voiceEnhancement: v })}
            />
            {settings.voiceEnhancement && (
              <div className="call-audio-sub-sliders">
                <div className="call-audio-slider-row">
                  <div className="call-audio-slider-head">
                    <span>Compressor threshold</span>
                    <span className="call-audio-slider-value">{Math.round(settings.voiceEnhancementThreshold)} dB</span>
                  </div>
                  <input
                    type="range"
                    min={-50}
                    max={0}
                    step={1}
                    value={settings.voiceEnhancementThreshold}
                    onChange={(e) => onPatch({ voiceEnhancementThreshold: Number(e.target.value) })}
                  />
                </div>
                <div className="call-audio-slider-row">
                  <div className="call-audio-slider-head">
                    <span>Highpass cutoff</span>
                    <span className="call-audio-slider-value">{Math.round(settings.voiceEnhancementHighpass)} Hz</span>
                  </div>
                  <input
                    type="range"
                    min={60}
                    max={300}
                    step={5}
                    value={settings.voiceEnhancementHighpass}
                    onChange={(e) => onPatch({ voiceEnhancementHighpass: Number(e.target.value) })}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {isMobile && (
          <>
            <div className="call-audio-popup-divider" />
            <section className="call-audio-popup-section">
              <div className="call-audio-section-label">Speaker mode</div>
              <div className="call-audio-speaker-row" role="group" aria-label="Speaker mode">
                <button
                  type="button"
                  className={`call-audio-speaker-btn${settings.speakerMode === "small" ? " active" : ""}`}
                  aria-pressed={settings.speakerMode === "small"}
                  onClick={() => onPatch({ speakerMode: "small" })}
                >
                  <Smartphone aria-hidden="true" size={15} />
                  Earpiece
                </button>
                <button
                  type="button"
                  className={`call-audio-speaker-btn${settings.speakerMode === "large" ? " active" : ""}`}
                  aria-pressed={settings.speakerMode === "large"}
                  onClick={() => onPatch({ speakerMode: "large" })}
                >
                  <Volume2 aria-hidden="true" size={15} />
                  Loudspeaker
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
    </div>
  );
}

function MobileActiveScreen({
  peerName,
  callType,
  callPhase,
  isPeerSpeaking,
  isProximityNear,
  isMicMuted,
  isCameraEnabled,
  cameraFacingMode,
  speakerMode,
  timer,
  hasRemoteVideo,
  localVideoStream,
  remoteVideoStream,
  mirrorLocalVideo,
  onToggleMic,
  onToggleCamera,
  onToggleFlip,
  onOpenSpeakerSheet,
  onEnd,
}: {
  peerName: string;
  callType: "audio" | "video";
  callPhase: string;
  isPeerSpeaking: boolean;
  isProximityNear: boolean;
  isMicMuted: boolean;
  isCameraEnabled: boolean;
  cameraFacingMode: "user" | "environment";
  speakerMode: "small" | "large";
  timer: string;
  hasRemoteVideo: boolean;
  localVideoStream: MediaStream | null;
  remoteVideoStream: MediaStream | null;
  mirrorLocalVideo: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleFlip: () => void;
  onOpenSpeakerSheet: () => void;
  onEnd: () => void;
}) {
  // Local video elements for mobile — srcObject is set directly from the stream props
  // so the UI reacts as soon as the stream is available without timing fragility.
  const mobileRemoteRef = useRef<HTMLVideoElement>(null);
  const mobileLocalRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const dst = mobileRemoteRef.current;
    if (!dst || !remoteVideoStream) return;

    const attachAndPlay = () => {
      if (dst.srcObject !== remoteVideoStream) {
        dst.srcObject = remoteVideoStream;
      }
      dst.muted = true;
      void dst.play().catch(() => undefined);
    };

    attachAndPlay();

    // Android WebView may reject the first play() until metadata is ready or the
    // track unmutes — listen for those events and retry.
    const tracks = remoteVideoStream.getVideoTracks();
    const onTrackChange = () => attachAndPlay();
    for (const track of tracks) {
      track.addEventListener("unmute", onTrackChange);
    }
    dst.addEventListener("loadedmetadata", attachAndPlay);
    dst.addEventListener("canplay", attachAndPlay, { once: true });

    return () => {
      for (const track of tracks) {
        track.removeEventListener("unmute", onTrackChange);
      }
      dst.removeEventListener("loadedmetadata", attachAndPlay);
      dst.removeEventListener("canplay", attachAndPlay);
    };
  }, [remoteVideoStream, hasRemoteVideo]);

  useEffect(() => {
    const dst = mobileLocalRef.current;
    if (!dst || !localVideoStream) return;
    dst.srcObject = localVideoStream;
    void dst.play().catch(() => undefined);
  }, [localVideoStream, hasRemoteVideo, isCameraEnabled, callType]);

  const initial = peerName ? peerName.charAt(0).toUpperCase() : "?";
  const showRemoteVideo = hasRemoteVideo || remoteVideoStream !== null;
  const showAvatar = !showRemoteVideo && (callType === "audio" || !isCameraEnabled);
  const showVideo = callType === "video" && isCameraEnabled;
  const showProximityBlank =
    isProximityNear &&
    (callType === "audio" || !isCameraEnabled || !showRemoteVideo);
  return (
    <div className={`mobile-active-screen${(showVideo || showRemoteVideo || (callType === "video" && isCameraEnabled)) ? " mobile-active-screen--video" : ""}`}>
      {showProximityBlank && (
        <div className="mobile-active-proximity-blank" aria-hidden="true" />
      )}
      {/* Case 1: Local camera only (no remote video yet) — show self-view fullscreen */}
      {callType === "video" && isCameraEnabled && !showRemoteVideo && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: '#000' }}>
          <video
            ref={mobileLocalRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: mirrorLocalVideo && cameraFacingMode === 'user' ? 'scaleX(-1)' : 'none',
            }}
          />
        </div>
      )}

      {/* Case 2: Remote video active — show remote fullscreen, local as PiP */}
      {showRemoteVideo && remoteVideoStream && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: '#000' }}>
          <video
            ref={mobileRemoteRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {isCameraEnabled && (
            <video
              ref={mobileLocalRef}
              autoPlay
              playsInline
              muted
              style={{
                position: 'absolute', bottom: 8, right: 8,
                width: 88, height: 120, objectFit: 'cover',
                borderRadius: 8, border: '2px solid rgba(255,255,255,0.35)',
                transform: mirrorLocalVideo && cameraFacingMode === 'user' ? 'scaleX(-1)' : 'none',
                zIndex: 2,
              }}
            />
          )}
        </div>
      )}
      {showAvatar && (
        <>
          {(() => {
            const isAnimating = isPeerSpeaking || callPhase === "outgoing" || callPhase === "connecting";
            return (
              <>
                <div className="mobile-active-avatar-wrap">
                  <div className={`mobile-active-audio-ring${isAnimating ? "" : " silent"}`} />
                  <div className={`mobile-active-audio-ring${isAnimating ? "" : " silent"}`} />
                  <div className="mobile-active-avatar">{initial}</div>
                </div>
                <div className="mobile-active-name">{peerName}</div>
                <div className="mobile-active-time">
                  {callPhase === "in-call" ? timer : callPhase === "outgoing" ? "Calling…" : "Connecting…"}
                </div>
                <div className="mobile-active-waveform">
                  {[0,1,2,3,4,5,6].map((i) => (
                    <div key={i} className={`mobile-active-wave-bar${isAnimating ? "" : " silent"}`} />
                  ))}
                </div>
              </>
            );
          })()}
        </>
      )}
      <div className="mobile-active-controls">
        {/* Mic */}
        <div className="mobile-active-ctrl">
          <button
            type="button"
            className={`mobile-active-ctrl-btn${isMicMuted ? " muted" : ""}`}
            aria-label={isMicMuted ? "Unmute" : "Mute"}
            onClick={onToggleMic}
          >
            <svg viewBox="0 0 24 24">{isMicMuted
              ? <><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8"/></>
              : <><path d="M12 1a3 3 0 013 3v8a3 3 0 01-6 0V4a3 3 0 013-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></>
            }</svg>
          </button>
          <span className="mobile-active-ctrl-lbl">{isMicMuted ? "Unmute" : "Mute"}</span>
        </div>
        {/* Speaker */}
        <div className="mobile-active-ctrl">
          <button
            type="button"
            className={`mobile-active-ctrl-btn${speakerMode === "large" ? " active" : ""}`}
            aria-label="Audio output"
            onClick={onOpenSpeakerSheet}
          >
            <svg viewBox="0 0 24 24">
              {speakerMode === "large"
                ? <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/></>
                : <><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></>
              }
            </svg>
          </button>
          <span className="mobile-active-ctrl-lbl">{speakerMode === "large" ? "Speaker" : "Earpiece"}</span>
        </div>
        {/* Camera */}
        <div className="mobile-active-ctrl">
          <button
            type="button"
            className={`mobile-active-ctrl-btn${!isCameraEnabled ? " muted" : ""}`}
            aria-label={isCameraEnabled ? "Turn off camera" : "Turn on camera"}
            onClick={onToggleCamera}
          >
            <svg viewBox="0 0 24 24">
              {isCameraEnabled
                ? <><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></>
                : <><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3m3-3h6l2 3h2a2 2 0 012 2v9.34m-7.72-2.06A4 4 0 1111.17 9"/></>
              }
            </svg>
          </button>
          <span className="mobile-active-ctrl-lbl">{isCameraEnabled ? "Camera" : "Camera off"}</span>
        </div>
        {/* Flip camera — only during video */}
        {callType === "video" && isCameraEnabled && (
          <div className="mobile-active-ctrl">
            <button type="button" className="mobile-active-ctrl-btn" aria-label="Flip camera" onClick={onToggleFlip}>
              <svg viewBox="0 0 24 24"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15"/></svg>
            </button>
            <span className="mobile-active-ctrl-lbl">Flip</span>
          </div>
        )}
        {/* End */}
        <div className="mobile-active-ctrl">
          <button type="button" className="mobile-active-ctrl-btn end" aria-label="End call" onClick={onEnd}>
            <svg viewBox="0 0 24 24" style={{ transform: "rotate(135deg)" }}><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
          </button>
          <span className="mobile-active-ctrl-lbl">End</span>
        </div>
      </div>
    </div>
  );
}

function PendingAttachmentCard({
  pending,
  onRemove
}: {
  pending: PendingLocalAttachment;
  onRemove: () => void;
}) {
  const { file, previewUrl } = pending;
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const showThumb = isImage || isVideo;

  if (showThumb) {
    return (
      <article className="pending-attachment-card pending-attachment-card--thumb">
        <div className="pending-attachment-thumb" aria-hidden={true}>
          {previewUrl ? (
            isVideo ? (
              <video src={previewUrl} muted playsInline preload="metadata" />
            ) : (
              <img src={previewUrl} alt="" />
            )
          ) : (
            <span className="pending-attachment-thumb-placeholder">
              {isVideo ? <Video aria-hidden="true" size={22} /> : <Image aria-hidden="true" size={22} />}
            </span>
          )}
        </div>
        <button
          type="button"
          className="pending-attachment-remove"
          aria-label={`Remove ${file.name}`}
          onClick={onRemove}
        >
          <X aria-hidden="true" size={14} />
        </button>
      </article>
    );
  }

  return (
    <article className="pending-attachment-card pending-attachment-card--file">
      <div className="pending-attachment-copy">
        <strong title={file.name}>{file.name}</strong>
      </div>
      <button
        type="button"
        className="pending-attachment-remove"
        aria-label={`Remove ${file.name}`}
        onClick={onRemove}
      >
        <X aria-hidden="true" size={14} />
      </button>
    </article>
  );
}

function ChatInfoPanel({
  accessToken,
  chat,
  chatPhotoInputRef,
  chatTitleDraft,
  canManageChat,
  currentUser,
  currentUserId,
  detailsTab,
  isUploading,
  sharedContentItems,
  onChatPhotoSelect,
  onChatSettingsSubmit,
  onClose,
  onCommentsEnabledChange,
  onDetailsTabChange,
  onFocusComposer,
  onMediaVisibilityChange,
  onOpenImage,
  onPinPermissionChange,
  onPreferenceChange,
  onTitleDraftChange,
}: {
  accessToken: string | null;
  chat: Chat;
  chatPhotoInputRef: RefObject<HTMLInputElement | null>;
  chatTitleDraft: string;
  canManageChat: boolean;
  currentUser: User | null;
  currentUserId: string | undefined;
  detailsTab: SharedContentTab;
  isUploading: boolean;
  sharedContentItems: FamilyFile[];
  onChatPhotoSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onChatSettingsSubmit: (event: FormEvent) => void;
  onClose: () => void;
  onCommentsEnabledChange: (enabled: boolean) => void;
  onDetailsTabChange: (tab: SharedContentTab) => void;
  onFocusComposer: () => void;
  onMediaVisibilityChange: (enabled: boolean) => void;
  onOpenImage: (file: FamilyFile, previewUrl: string) => void;
  onPinPermissionChange: (permission: "everyone" | "admins_only") => void;
  onPreferenceChange: (
    payload: { isMuted?: boolean; isPinned?: boolean; isFavorite?: boolean },
    notice: string
  ) => void;
  onTitleDraftChange: (value: string) => void;
}) {
  const chatName = displayChatName(chat, currentUserId);
  const [activeControl, setActiveControl] = useState<ChatInfoControl>(null);
  const { nameEditor, permissions } = chatInfoControlVisibility(activeControl);
  const canRename =
    canManageChat && chat.type !== "direct" && chatTitleDraft.trim() !== chatName.trim();

  const showSettingsIsland =
    (canManageChat && chat.type !== "direct") ||
    chat.type !== "family" ||
    Boolean(chat.mediaVisibilityPendingApproval);

  return (
    <aside className="chat-details-panel chat-info-screen" role="dialog" aria-modal="true" aria-labelledby="chat-info-title">
      <header className="chat-info-topbar">
        <button type="button" className="chat-info-back" aria-label="Back to chat" onClick={onClose}>
          <span className="ms-icon ms-icon--24" aria-hidden={true}>
            arrow_back
          </span>
        </button>
        <h2 id="chat-info-title" className="visually-hidden">
          {chatName}
        </h2>
        {canManageChat && chat.type !== "direct" && (
          <div className="chat-info-settings-menu">
            <button
              type="button"
              className="chat-info-topbar-action"
              aria-controls="chat-info-permissions"
              aria-expanded={permissions}
              aria-label="Chat permissions"
              title="Chat permissions"
              onClick={() => setActiveControl((current) => (current === "permissions" ? null : "permissions"))}
            >
              <Settings aria-hidden="true" size={22} />
            </button>
            {permissions && (
              <section
                id="chat-info-permissions"
                className="chat-info-permissions-popup"
                role="dialog"
                aria-label="Chat permissions"
              >
                <div className="chat-info-permissions-heading">
                  <strong>Permissions</strong>
                  <small>Who can pin messages</small>
                </div>
                <label className="chat-info-permission-option">
                  <input
                    type="radio"
                    name="pinPermission"
                    value="everyone"
                    checked={(chat.pinPermission ?? "everyone") === "everyone"}
                    onChange={() => void onPinPermissionChange("everyone")}
                  />
                  <span>Everyone</span>
                </label>
                <label className="chat-info-permission-option">
                  <input
                    type="radio"
                    name="pinPermission"
                    value="admins_only"
                    checked={(chat.pinPermission ?? "everyone") === "admins_only"}
                    onChange={() => void onPinPermissionChange("admins_only")}
                  />
                  <span>Admins only</span>
                </label>
              </section>
            )}
          </div>
        )}
      </header>

      <div className="chat-info-body">
        <section className="chat-info-hero">
          <div className="chat-info-avatar-wrap">
            <RealAvatar
              accessToken={accessToken}
              className={`avatar avatar-xl chat-avatar ${chatAvatarTypeClass(chat)}`}
              fallbackKind={chatAvatarFallbackKind(chat)}
              file={chatAvatarFile(chat, currentUserId)}
              label={chatName}
            />
            {canManageChat && (
              <>
                <button
                  type="button"
                  className="chat-info-avatar-edit"
                  aria-label="Change chat photo"
                  title="Change chat photo"
                  disabled={isUploading}
                  onClick={() => chatPhotoInputRef.current?.click()}
                >
                  <span className="ms-icon ms-icon--24" aria-hidden={true}>
                    add_a_photo
                  </span>
                </button>
                <input
                  ref={chatPhotoInputRef}
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="visually-hidden"
                  disabled={isUploading}
                  type="file"
                  onChange={onChatPhotoSelect}
                />
              </>
            )}
          </div>
          <div className="chat-info-title-row">
            {nameEditor ? (
              <form className="chat-info-title-inline-editor" onSubmit={onChatSettingsSubmit}>
                <input
                  id="chat-info-name"
                  className="chat-info-inline-input"
                  aria-label="Chat name"
                  autoFocus
                  maxLength={255}
                  value={chatTitleDraft}
                  onChange={(event) => onTitleDraftChange(event.target.value)}
                />
                <button type="submit" className="chat-info-title-save" disabled={!canRename}>
                  Save
                </button>
                <button
                  type="button"
                  className="chat-info-title-cancel"
                  aria-label="Cancel editing chat name"
                  onClick={() => setActiveControl(null)}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <h3>{chatName}</h3>
            )}
            {!nameEditor && canManageChat && chat.type !== "direct" && (
              <button
                type="button"
                className="chat-info-title-edit"
                aria-controls="chat-info-name-editor"
                aria-expanded={nameEditor}
                aria-label="Edit chat name"
                title="Edit chat name"
                onClick={() => setActiveControl((current) => (current === "name" ? null : "name"))}
              >
                <Pencil aria-hidden="true" size={18} />
              </button>
            )}
          </div>
          <p className="chat-info-subtitle">
            {chat.type === "direct"
              ? "Direct message"
              : `${chat.members.length} member${chat.members.length === 1 ? "" : "s"}`}
          </p>
          <p className="chat-info-meta">{encryptionProtocolLabel(chat.encryptionProtocol)}</p>
        </section>

        <section className="chat-info-actions" aria-label="Chat actions">
          <button type="button" className="chat-info-action" onClick={onFocusComposer}>
            <span className="ms-icon ms-icon--24" aria-hidden={true}>
              chat
            </span>
            <span>Message</span>
          </button>
          <button
            type="button"
            className="chat-info-action"
            aria-pressed={chat.isMuted}
            onClick={() =>
              void onPreferenceChange(
                { isMuted: !chat.isMuted },
                chat.isMuted ? "Notifications enabled" : "Chat muted"
              )
            }
          >
            <span className="ms-icon ms-icon--24" aria-hidden={true}>
              {chat.isMuted ? "notifications" : "notifications_off"}
            </span>
            <span>{chat.isMuted ? "Unmute" : "Mute"}</span>
          </button>
          <button
            type="button"
            className="chat-info-action"
            aria-pressed={chat.isFavorite}
            onClick={() =>
              void onPreferenceChange(
                { isFavorite: !chat.isFavorite },
                chat.isFavorite ? "Removed from favorites" : "Added to favorites"
              )
            }
          >
            <span
              className={`ms-icon ms-icon--24${chat.isFavorite ? " ms-icon--filled" : ""}`}
              aria-hidden={true}
            >
              star
            </span>
            <span>{chat.isFavorite ? "Saved" : "Favorite"}</span>
          </button>
        </section>

        {showSettingsIsland && (
          <div className="chat-info-section">
            <div className="chat-info-island">
              {chat.type !== "family" && (
                <label className="chat-info-row chat-info-row--toggle">
                  <span className="chat-info-row-copy">
                    <strong>Family storage</strong>
                    <small>Show media in shared family storage</small>
                  </span>
                  <span className="call-audio-toggle-switch">
                    <input
                      type="checkbox"
                      checked={mediaVisibilityToggleChecked(chat)}
                      disabled={!canUpdateMediaVisibility(chat, currentUser)}
                      onChange={(event) => void onMediaVisibilityChange(event.target.checked)}
                    />
                    <span className="call-audio-toggle-slider" aria-hidden={true} />
                  </span>
                </label>
              )}

              {chat.mediaVisibilityPendingApproval && (
                <p className="chat-info-island-note">
                  Approval {chat.mediaVisibilityApprovalCount}/{chat.mediaVisibilityApprovalRequired}
                </p>
              )}

              {chat.type === "channel" && (
                <label className="chat-info-row chat-info-row--toggle">
                  <span className="chat-info-row-copy">
                    <strong>Comments</strong>
                    <small>Allow members to comment on posts</small>
                  </span>
                  <span className="call-audio-toggle-switch">
                    <input
                      type="checkbox"
                      checked={chat.commentsEnabled}
                      disabled={!canManageChat}
                      onChange={(event) => void onCommentsEnabledChange(event.target.checked)}
                    />
                    <span className="call-audio-toggle-slider" aria-hidden={true} />
                  </span>
                </label>
              )}
            </div>
          </div>
        )}

        <div className="chat-info-section chat-info-section--media">
          <div className="chat-info-tabs" role="tablist" aria-label="Shared content">
            {(["media", "files", "links"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`chat-info-tab${detailsTab === tab ? " active" : ""}`}
                aria-pressed={detailsTab === tab}
                onClick={() => onDetailsTabChange(tab)}
              >
                {tab === "media" ? "Media" : tab === "files" ? "Files" : "Links"}
              </button>
            ))}
          </div>
          {sharedContentItems.length > 0 ? (
            <div className="details-media-grid chat-info-media-grid">
              {sharedContentItems.map((file) => (
                <SharedContentThumb
                  accessToken={accessToken}
                  file={file}
                  key={file.id}
                  onOpenImage={onOpenImage}
                />
              ))}
            </div>
          ) : (
            <p className="chat-info-empty">
              {detailsTab === "links"
                ? "No links yet"
                : detailsTab === "media"
                  ? "No media yet"
                  : "No files yet"}
            </p>
          )}
        </div>

        <div className="chat-info-section">
          <p className="chat-info-section-label">
            {chat.members.length} member{chat.members.length === 1 ? "" : "s"}
          </p>
          <div className="chat-info-island">
            <ul className="chat-info-member-list">
              {chat.members.map((member) => (
                <li key={member.id}>
                  <article className="chat-info-member-row">
                    <RealAvatar
                      accessToken={accessToken}
                      className="avatar member-avatar"
                      file={member.profilePhoto}
                      label={member.displayName}
                    />
                    <div className="chat-info-member-copy">
                      <strong>{member.displayName}</strong>
                      <span>@{member.username}</span>
                    </div>
                    <small>{member.role}</small>
                  </article>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NewChatScreen({
  accessToken,
  screen,
  members,
  memberSearch,
  groupTitle,
  groupMemberIds,
  onMemberSearchChange,
  onScreenChange,
  onClose,
  onStartDirect,
  onGroupTitleChange,
  onToggleGroupMember,
  onCreateGroup,
  onCreateChannel,
}: {
  accessToken: string | null;
  screen: NewChatScreen;
  members: User[];
  memberSearch: string;
  groupTitle: string;
  groupMemberIds: string[];
  onMemberSearchChange: (value: string) => void;
  onScreenChange: (screen: NewChatScreen) => void;
  onClose: () => void;
  onStartDirect: (userId: string) => void;
  onGroupTitleChange: (value: string) => void;
  onToggleGroupMember: (userId: string) => void;
  onCreateGroup: (event: FormEvent) => void;
  onCreateChannel: (event: FormEvent) => void;
}) {
  const composeFormId = screen === "channel" ? "new-channel-form" : "new-group-form";
  const canCreateCompose = groupTitle.trim().length > 0 && groupMemberIds.length > 0;

  if (screen === "group" || screen === "channel") {
    const isChannel = screen === "channel";
    return (
      <section className="new-chat-screen" role="dialog" aria-modal="true" aria-labelledby="new-chat-compose-title">
        <header className="new-chat-screen-header">
          <button type="button" className="new-chat-screen-back" aria-label="Back" onClick={() => onScreenChange("pick")}>
            <span className="ms-icon ms-icon--24" aria-hidden={true}>
              arrow_back
            </span>
          </button>
          <h2 id="new-chat-compose-title">{isChannel ? "New channel" : "New group"}</h2>
          <button
            type="submit"
            form={composeFormId}
            className="new-chat-screen-action"
            disabled={!canCreateCompose}
          >
            Create
          </button>
        </header>
        <form
          id={composeFormId}
          className="new-chat-compose"
          onSubmit={isChannel ? onCreateChannel : onCreateGroup}
        >
          <label className="new-chat-compose-title-field">
            <span>{isChannel ? "Channel name" : "Group name"}</span>
            <input
              autoFocus
              maxLength={255}
              placeholder={isChannel ? "Channel name" : "Group name"}
              value={groupTitle}
              onChange={(event) => onGroupTitleChange(event.target.value)}
            />
          </label>
          <label className="search-field new-chat-screen-search">
            <span className="ms-icon ms-icon--20" aria-hidden={true}>
              search
            </span>
            <input
              placeholder="Search members"
              value={memberSearch}
              onChange={(event) => onMemberSearchChange(event.target.value)}
            />
          </label>
          <p className="new-chat-section-label">Members</p>
          <ul className="new-chat-contact-list">
            {members.map((member) => {
              const selected = groupMemberIds.includes(member.id);
              return (
                <li key={member.id}>
                  <button
                    type="button"
                    className={`new-chat-contact-row${selected ? " selected" : ""}`}
                    aria-pressed={selected}
                    onClick={() => onToggleGroupMember(member.id)}
                  >
                    <RealAvatar
                      accessToken={accessToken}
                      className="avatar chat-avatar"
                      file={member.profilePhoto}
                      label={member.displayName}
                    />
                    <span className="new-chat-contact-copy">
                      <strong>{member.displayName}</strong>
                      <small>{member.role}</small>
                    </span>
                    <span className={`new-chat-check${selected ? " selected" : ""}`} aria-hidden={true}>
                      {selected ? (
                        <span className="ms-icon ms-icon--20 ms-icon--filled">check_circle</span>
                      ) : (
                        <span className="ms-icon ms-icon--20">radio_button_unchecked</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </form>
      </section>
    );
  }

  return (
    <section className="new-chat-screen" role="dialog" aria-modal="true" aria-labelledby="new-chat-title">
      <header className="new-chat-screen-header">
        <button type="button" className="new-chat-screen-close" aria-label="Close new message" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <h2 id="new-chat-title">New Message</h2>
        <span className="new-chat-screen-spacer" aria-hidden={true} />
      </header>
      <label className="search-field new-chat-screen-search">
        <span className="ms-icon ms-icon--20" aria-hidden={true}>
          search
        </span>
        <input
          autoFocus
          placeholder="Search contacts"
          value={memberSearch}
          onChange={(event) => onMemberSearchChange(event.target.value)}
        />
      </label>
      <div className="new-chat-actions">
        <button type="button" className="new-chat-action-row" onClick={() => onScreenChange("group")}>
          <span className="new-chat-action-icon" aria-hidden={true}>
            <span className="ms-icon ms-icon--22 ms-icon--filled">group</span>
          </span>
          <span className="new-chat-action-copy">
            <strong>New Group</strong>
            <small>Chat with several family members</small>
          </span>
          <span className="ms-icon ms-icon--20 new-chat-action-chevron" aria-hidden={true}>
            chevron_right
          </span>
        </button>
        <button type="button" className="new-chat-action-row" onClick={() => onScreenChange("channel")}>
          <span className="new-chat-action-icon new-chat-action-icon--channel" aria-hidden={true}>
            <span className="ms-icon ms-icon--22 ms-icon--filled">campaign</span>
          </span>
          <span className="new-chat-action-copy">
            <strong>New Channel</strong>
            <small>Broadcast updates to members</small>
          </span>
          <span className="ms-icon ms-icon--20 new-chat-action-chevron" aria-hidden={true}>
            chevron_right
          </span>
        </button>
      </div>
      <p className="new-chat-section-label">Contacts</p>
      <ul className="new-chat-contact-list">
        {members.length === 0 ? (
          <li className="new-chat-empty">No contacts match your search.</li>
        ) : (
          members.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                className="new-chat-contact-row"
                onClick={() => onStartDirect(member.id)}
              >
                <RealAvatar
                  accessToken={accessToken}
                  className="avatar chat-avatar"
                  file={member.profilePhoto}
                  label={member.displayName}
                />
                <span className="new-chat-contact-copy">
                  <strong>{member.displayName}</strong>
                  {member.username ? <small>@{member.username}</small> : null}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function MobileMinimizedCallBar({
  peerName,
  callPhase,
  callTimer,
  micMuted,
  onToggleMic,
  onEnd,
  onExpand,
}: {
  peerName: string;
  callPhase: CallPhase;
  callTimer: string;
  micMuted: boolean;
  onToggleMic: () => void;
  onEnd: () => void;
  onExpand: () => void;
}) {
  const statusLabel =
    callPhase === "in-call"
      ? callTimer
      : callPhase === "outgoing"
        ? "Calling…"
        : "Connecting…";

  return (
    <div className="mobile-call-strip" role="status" aria-live="polite">
      <button
        type="button"
        className={`mobile-call-strip-btn${micMuted ? " is-muted" : ""}`}
        aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
        onClick={(event) => {
          event.stopPropagation();
          onToggleMic();
        }}
      >
        <span className="ms-icon ms-icon--22" aria-hidden={true}>
          {micMuted ? "mic_off" : "mic"}
        </span>
      </button>
      <button
        type="button"
        className="mobile-call-strip-main"
        aria-label="Restore call"
        onClick={onExpand}
      >
        <span className="mobile-call-bar-pulse" aria-hidden="true" />
        <span className="mobile-call-strip-label">
          {peerName} · {statusLabel}
        </span>
      </button>
      <button
        type="button"
        className="mobile-call-strip-btn mobile-call-strip-btn--end"
        aria-label="End call"
        onClick={(event) => {
          event.stopPropagation();
          onEnd();
        }}
      >
        <span className="ms-icon ms-icon--22" aria-hidden={true}>
          call_end
        </span>
      </button>
    </div>
  );
}

function MobileIncomingScreen({
  peerName,
  callType,
  onAccept,
  onDecline,
}: {
  peerName: string;
  callType: "audio" | "video";
  onAccept: () => void;
  onDecline: () => void;
}) {
  const initial = peerName ? peerName.charAt(0).toUpperCase() : "?";
  return (
    <div className="mobile-incoming-screen">
      <div className="mobile-incoming-avatar-wrap">
        <div className="mobile-incoming-ripple" />
        <div className="mobile-incoming-ripple" />
        <div className="mobile-incoming-ripple" />
        <div className="mobile-incoming-avatar">{initial}</div>
      </div>
      <div className="mobile-incoming-name">{peerName}</div>
      <div className="mobile-incoming-status">
        {callType === "video" ? "Incoming video call…" : "Incoming call…"}
      </div>
      <div className="mobile-incoming-actions">
        <div className="mobile-incoming-btn-wrap">
          <button type="button" className="mobile-call-btn" aria-label="Accept call" onClick={onAccept}>
            <svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
          </button>
          <span className="mobile-call-btn-label">Accept</span>
        </div>
        <div className="mobile-incoming-btn-wrap">
          <button type="button" className="mobile-call-btn decline" aria-label="Decline call" onClick={onDecline}>
            <svg viewBox="0 0 24 24" style={{ transform: "rotate(135deg)" }}><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
          </button>
          <span className="mobile-call-btn-label">Decline</span>
        </div>
      </div>
    </div>
  );
}

function CallSpeakerSheet({
  devices,
  currentOutputDeviceId,
  speakerMode,
  onSelect,
  onClose,
}: {
  devices: CallDevice[];
  currentOutputDeviceId: string;
  speakerMode: "small" | "large";
  onSelect: (deviceId: string | null, mode: "small" | "large") => void;
  onClose: () => void;
}) {
  const outputDevices = devices.filter((d) => d.kind === "audiooutput");
  const hasEnumerable = outputDevices.length > 0;

  return (
    <div
      className="call-speaker-sheet-backdrop"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="call-speaker-sheet" role="dialog" aria-label="Audio output">
        <div className="call-speaker-sheet-title">Audio output</div>

        {!hasEnumerable && (
          <>
            <button
              type="button"
              className="call-speaker-sheet-item"
              onClick={() => { onSelect(null, "small"); onClose(); }}
            >
              <svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
              <span className="call-speaker-sheet-label">Earpiece</span>
              <span className="call-speaker-sheet-check-slot" aria-hidden="true">
                {speakerMode === "small" && !currentOutputDeviceId && (
                  <svg className="call-speaker-sheet-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                )}
              </span>
            </button>
            <button
              type="button"
              className="call-speaker-sheet-item"
              onClick={() => { onSelect(null, "large"); onClose(); }}
            >
              <svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/></svg>
              <span className="call-speaker-sheet-label">Speaker</span>
              <span className="call-speaker-sheet-check-slot" aria-hidden="true">
                {speakerMode === "large" && !currentOutputDeviceId && (
                  <svg className="call-speaker-sheet-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                )}
              </span>
            </button>
          </>
        )}

        {hasEnumerable && outputDevices.map((d) => (
          <button
            key={d.deviceId}
            type="button"
            className="call-speaker-sheet-item"
            onClick={() => { onSelect(d.deviceId, "large"); onClose(); }}
          >
            {d.deviceId === "default" || d.label.toLowerCase().includes("speaker")
              ? <svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/></svg>
              : <svg viewBox="0 0 24 24"><path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/></svg>
            }
            <span className="call-speaker-sheet-label">{d.label || "Audio output"}</span>
            <span className="call-speaker-sheet-check-slot" aria-hidden="true">
              {currentOutputDeviceId === d.deviceId && (
                <svg className="call-speaker-sheet-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CallVideoSettingsPopup({
  settings,
  capabilities,
  devices,
  isMobile,
  onPatch,
  onClose,
}: {
  settings: CallSettings;
  capabilities: CallCapabilities;
  devices: CallDevice[];
  isMobile: boolean;
  onPatch: (patch: Partial<CallSettings>) => void;
  onClose: () => void;
}) {
  const videoDevices = devices.filter((d) => d.kind === "videoinput");

  return (
    <div
      className="call-audio-popup-backdrop"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="call-audio-popup"
        role="dialog"
        aria-modal="true"
        aria-label="Video settings"
      >
        <div className="call-audio-popup-header">
          <span>Video settings</span>
          <button type="button" className="call-audio-popup-close" aria-label="Close" autoFocus onClick={onClose}>
            <X aria-hidden="true" size={14} />
          </button>
        </div>
        <div className="call-audio-popup-body">
          {!isMobile && (
            <section className="call-audio-popup-section">
              <div className="call-audio-section-label">Camera device</div>
              <label className="call-audio-device-row">
                <span>Camera</span>
                <select
                  value={settings.videoDeviceId}
                  disabled={!capabilities.canUseCamera || videoDevices.length === 0}
                  onChange={(e) => onPatch({ videoDeviceId: e.target.value })}
                >
                  <option value="">System default</option>
                  {videoDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                  ))}
                </select>
              </label>
            </section>
          )}
          {!isMobile && <div className="call-audio-popup-divider" />}
          <section className="call-audio-popup-section">
            <div className="call-audio-section-label">Display</div>
            <div className="call-audio-toggle-group">
              <div className="call-audio-toggle-row">
                <div className="call-audio-toggle-info">
                  <span className="call-audio-toggle-name">Mirror my video</span>
                  <span className="call-audio-toggle-desc">Flip the local preview horizontally (front camera)</span>
                </div>
                <label className="call-audio-toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.mirrorLocalVideo}
                    onChange={(e) => onPatch({ mirrorLocalVideo: e.target.checked })}
                  />
                  <span className="call-audio-toggle-track" />
                </label>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
