import {
  ChangeEvent,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  Bell,
  BellOff,
  Camera,
  CheckCheck,
  ChevronLeft,
  FileText,
  Forward,
  Image,
  Info,
  MessageCircle,
  Mic,
  MicOff,
  MoreVertical,
  Paperclip,
  Phone,
  PhoneOff,
  Pin,
  Plus,
  Reply,
  SlidersHorizontal,
  Smartphone,
  Volume2,
  VolumeX,
  Search,
  Send,
  ShieldCheck,
  Smile,
  Star,
  WifiOff,
  X
} from "lucide-react";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { Socket, io } from "socket.io-client";

import { User } from "../api/auth";
import {
  Chat,
  Message,
  addMessageReaction,
  createChannelChat,
  createDirectChat,
  createGroupChat,
  forwardMessage,
  getChat,
  getChats,
  getMessages,
  markMessageRead,
  sendMessage,
  removeMessageReaction,
  updateChat,
  updateChatPreferences
} from "../api/chats";
import { Family } from "../api/family";
import { ApiError, getApiUrl, isTunnelHost } from "../api/client";
import {
  decryptMessage,
  decryptMessages,
  encryptMessageContent,
  ensureLocalEncryptionIdentity,
  encryptionProtocolLabel
} from "../api/messageCrypto";
import {
  FamilyFile,
  formatFileSize,
  saveFileToDisk,
  uploadFile
} from "../api/files";
import { useAuth } from "../auth/AuthContext";
import ImageLightbox from "../components/ImageLightbox";
import useFilePreviewUrl from "../hooks/useFilePreviewUrl";
import AppNav from "./AppNav";
import AudioCallController, {
  CallAudioCapabilities,
  CallAudioDevice,
  CallAudioSettings,
  DEFAULT_CALL_AUDIO_SETTINGS
} from "../realtime/AudioCallController";

type CallPhase = "idle" | "outgoing" | "incoming" | "connecting" | "in-call";

function displayChatName(chat: Chat, currentUserId: string | undefined) {
  if (chat.type === "family" || chat.type === "group" || chat.type === "channel") {
    return chat.title ?? "General Family Chat";
  }
  const otherMember = chat.members.find((member) => member.id !== currentUserId);
  return otherMember?.displayName ?? "Direct chat";
}

function chatInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.at(0)?.toUpperCase())
    .join("");
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
type NewChatMode = "direct" | "group" | "channel";
type ChatFilter = "all" | "unread" | "groups" | "direct" | "muted";
type ChatSectionKey = "dms" | "groups" | "channels";
type SharedContentTab = "media" | "files" | "links";

const CHAT_FILTERS: Array<{ label: string; value: ChatFilter }> = [
  { label: "All", value: "all" },
  { label: "Unread", value: "unread" },
  { label: "Groups", value: "groups" },
  { label: "Direct", value: "direct" },
  { label: "Muted", value: "muted" }
];
const CHAT_SECTION_ORDER: Array<{ key: ChatSectionKey; label: string }> = [
  { key: "channels", label: "Channels" },
  { key: "groups", label: "Groups" },
  { key: "dms", label: "DMs" }
];
const MESSAGE_REACTION_CHOICES = ["👍", "❤️", "😂", "😮", "🙏"];
const MESSAGE_CONTEXT_MENU_WIDTH = 236;
const MESSAGE_CONTEXT_MENU_HEIGHT = 220;

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

function chatAvatarTypeClass(chat: Chat) {
  if (chat.type === "family") {
    return "family";
  }
  if (chat.type === "group" || chat.type === "channel") {
    return "group";
  }
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

type ChatToast = {
  id: string;
  chatId: string;
  title: string;
  body: string;
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

function AttachmentCard({
  accessToken,
  file,
  compact = false,
  onOpenImage
}: {
  accessToken: string | null;
  file: FamilyFile;
  compact?: boolean;
  onOpenImage?: (file: FamilyFile, previewUrl: string) => void;
}) {
  const isImage = file.mimeType.startsWith("image/");
  const previewUrl = useFilePreviewUrl(accessToken, file, isImage);

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
        {isImage && accessToken && (
          <div className="attachment-action-row">
            <button
              type="button"
              className="attachment-action-button subtle"
              onClick={() => void saveFileToDisk(accessToken, file)}
            >
              Save
            </button>
          </div>
        )}
      </div>
      {accessToken && !isImage && (
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

function pendingAttachmentKindLabel(file: FamilyFile) {
  if (file.mimeType.startsWith("image/")) {
    return "Image";
  }
  if (file.mimeType.startsWith("video/")) {
    return "Video";
  }
  if (file.mimeType.startsWith("audio/")) {
    return "Audio";
  }
  if (file.mimeType === "application/pdf") {
    return "PDF";
  }
  return "File";
}

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
  label
}: {
  accessToken: string | null;
  className: string;
  file: FamilyFile | null | undefined;
  label: string;
}) {
  const previewUrl = useFilePreviewUrl(accessToken, file ?? null, Boolean(file));

  return (
    <span className={className}>
      {previewUrl ? <img src={previewUrl} alt="" /> : chatInitials(label)}
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
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1") {
    return false;
  }
  return true;
}

export default function ChatsPage() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { accessToken, currentUser, authRequest, updateCurrentUser } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [composer, setComposer] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<FamilyFile[]>([]);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [targetUserId, setTargetUserId] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [chatFilter, setChatFilter] = useState<ChatFilter>("all");
  const [messageSearch, setMessageSearch] = useState("");
  const [isMessageSearchOpen, setIsMessageSearchOpen] = useState(false);
  const [isChatMenuOpen, setIsChatMenuOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [newChatMode, setNewChatMode] = useState<NewChatMode>("direct");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<SharedContentTab>("media");
  const [chatTitleDraft, setChatTitleDraft] = useState("");
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [fullViewImage, setFullViewImage] = useState<{
    file: FamilyFile;
    previewUrl: string;
  } | null>(null);
  const [messageContextMenu, setMessageContextMenu] = useState<{
    message: Message;
    x: number;
    y: number;
  } | null>(null);
  const [threadRootMessageId, setThreadRootMessageId] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ChatToast[]>([]);
  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const [activeCallChatId, setActiveCallChatId] = useState<string | null>(null);
  const [callPeerUserId, setCallPeerUserId] = useState<string | null>(null);
  const [callNotice, setCallNotice] = useState<string | null>(null);
  const [callAudioSettings, setCallAudioSettings] = useState<CallAudioSettings>(
    DEFAULT_CALL_AUDIO_SETTINGS
  );
  const [isCallAudioSettingsOpen, setIsCallAudioSettingsOpen] = useState(false);
  const [callAudioDevices, setCallAudioDevices] = useState<CallAudioDevice[]>([]);
  const [callAudioCapabilities, setCallAudioCapabilities] = useState<CallAudioCapabilities>({
    canSelectInputDevice: false,
    canSelectOutputDevice: false,
    canUseNoiseSuppression: false,
    canUseEchoCancellation: false,
    canUseAutoGainControl: false,
    canUseVoiceEnhancement: false
  });
  const [callAudioWarning, setCallAudioWarning] = useState<string | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== "undefined" ? window.matchMedia("(max-width: 768px)").matches : false
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const socketRef = useRef<Socket | null>(null);
  const audioCallRef = useRef<AudioCallController | null>(null);
  const soundDisabledRef = useRef(callAudioSettings.soundDisabled);
  const ringtoneAudioContextRef = useRef<AudioContext | null>(null);
  const ringtoneTimerRef = useRef<number | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const loadOverviewRequestRef = useRef(0);
  const loadChatRequestRef = useRef(0);
  const activeChatIdRef = useRef<string | undefined>(chatId);
  const activeCallChatIdRef = useRef<string | null>(null);
  const chatsRef = useRef<Chat[]>([]);
  const messagesRef = useRef<Message[]>([]);
  const messageCacheRef = useRef<Record<string, Message[]>>({});
  const hasLoadedOverviewRef = useRef(false);
  const typingStopTimerRef = useRef<number | null>(null);
  const messagesPanelRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const chatPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const chatMenuRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const sendInFlightRef = useRef(false);
  const unreadTotal = useMemo(
    () => chats.reduce((total, chat) => total + chat.unreadCount, 0),
    [chats]
  );

  const dismissToast = useCallback((toastId: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ChatToast, "id">) => {
      const id = createClientMessageId();
      setToasts((current) => [...current.slice(-2), { id, ...toast }]);
      window.setTimeout(() => {
        dismissToast(id);
      }, 5000);
    },
    [dismissToast]
  );

  const stopIncomingRingtone = useCallback(() => {
    if (ringtoneTimerRef.current !== null) {
      window.clearInterval(ringtoneTimerRef.current);
      ringtoneTimerRef.current = null;
    }
    if (ringtoneAudioContextRef.current) {
      void ringtoneAudioContextRef.current.close().catch(() => undefined);
      ringtoneAudioContextRef.current = null;
    }
  }, []);

  const playIncomingRingtoneBurst = useCallback(async () => {
    const AudioCtor =
      typeof window === "undefined"
        ? null
        : (
            window.AudioContext ||
            (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          );
    if (!AudioCtor) {
      return;
    }
    if (!ringtoneAudioContextRef.current) {
      ringtoneAudioContextRef.current = new AudioCtor();
    }
    const context = ringtoneAudioContextRef.current;
    if (!context) {
      return;
    }
    if (context.state === "suspended") {
      await context.resume().catch(() => undefined);
    }
    const baseTime = context.currentTime;
    [880, 660].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      const startAt = baseTime + index * 0.2;
      gainNode.gain.setValueAtTime(0.0001, startAt);
      gainNode.gain.exponentialRampToValueAtTime(0.12, startAt + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.16);
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.18);
    });
  }, []);

  useEffect(() => {
    soundDisabledRef.current = callAudioSettings.soundDisabled;
  }, [callAudioSettings.soundDisabled]);

  const startIncomingRingtone = useCallback(() => {
    if (soundDisabledRef.current) {
      return;
    }
    if (ringtoneTimerRef.current !== null) {
      return;
    }
    void playIncomingRingtoneBurst().catch(() => undefined);
    ringtoneTimerRef.current = window.setInterval(() => {
      void playIncomingRingtoneBurst().catch(() => undefined);
    }, 1800);
  }, [playIncomingRingtoneBurst]);

  const refreshCallAudioDevices = useCallback(async () => {
    const controller = audioCallRef.current;
    if (!controller) {
      return;
    }
    const devices = await controller.getAvailableDevices();
    setCallAudioDevices(devices);
  }, []);

  const applyCallAudioPatch = useCallback(async (patch: Partial<CallAudioSettings>) => {
    const controller = audioCallRef.current;
    setCallAudioWarning(null);
    setCallAudioSettings((current) => ({ ...current, ...patch }));
    if (!controller) {
      return;
    }
    try {
      await controller.applyAudioSettings(patch);
    } catch (err) {
      setCallAudioWarning(
        err instanceof Error ? err.message : "Could not apply audio setting. Check permissions."
      );
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const media = window.matchMedia("(max-width: 768px)");
    const onChange = (event: MediaQueryListEvent) => {
      setIsMobileViewport(event.matches);
    };
    setIsMobileViewport(media.matches);
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, []);

  const directTargets = useMemo(
    () => members.filter((member) => member.id !== currentUser?.id),
    [members, currentUser?.id]
  );

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
      dms: [],
      groups: [],
      channels: []
    };
    for (const chat of filteredChats) {
      if (chat.type === "direct") {
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
    const query = messageSearch.trim().toLowerCase();
    if (!query) {
      return messages;
    }
    return messages.filter((message) => {
      const attachmentText = message.attachments.map((file) => file.originalName).join(" ");
      return `${message.content ?? ""} ${message.senderDisplayName ?? ""} ${attachmentText}`
        .toLowerCase()
        .includes(query);
    });
  }, [messageSearch, messages]);
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
    if (activeCallChat) {
      const member = activeCallChat.members.find((candidate) => candidate.id === callPeerUserId);
      if (member?.displayName) {
        return member.displayName;
      }
    }
    const member = members.find((candidate) => candidate.id === callPeerUserId);
    return member?.displayName ?? "Unknown contact";
  }, [activeCallChat, callPeerUserId, currentUser, members]);
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
      if (accessToken) {
        await markMessageRead(accessToken, messageId).catch(() => undefined);
      }
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
    [accessToken, applyMessagesForChat, currentUser?.id]
  );

  const loadOverview = useCallback(async () => {
    if (!accessToken) {
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
        getChats(accessToken)
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
  }, [accessToken, authRequest]);

  const loadSelectedChat = useCallback(
    async (requestedChatId: string | undefined, preserveVisibleMessages = false) => {
      if (!accessToken) {
        return;
      }

      const requestId = loadChatRequestRef.current + 1;
      loadChatRequestRef.current = requestId;
      const isCurrentRequest = () => loadChatRequestRef.current === requestId;

      if (!requestedChatId) {
        setSelectedChat(null);
        setMessages([]);
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

      try {
        const [chat, messageResult] = await Promise.all([
          getChat(accessToken, requestedChatId),
          getMessages(accessToken, requestedChatId)
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
    [accessToken, applyMessagesForChat, currentUser?.id, markChatRead]
  );

  const syncCurrentView = useCallback(async () => {
    await loadOverview();
    await loadSelectedChat(activeChatIdRef.current, true);
  }, [loadOverview, loadSelectedChat]);
  const loadRef = useRef(syncCurrentView);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

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
  }, [chatId]);
  useEffect(() => {
    activeCallChatIdRef.current = activeCallChatId;
  }, [activeCallChatId]);

  useEffect(() => {
    if (isLoading || chatId || chats.length === 0 || isMobileViewport) {
      return;
    }
    openChat(chats[0]);
  }, [chatId, chats, isLoading, isMobileViewport]);

  useLayoutEffect(() => {
    if (!selectedChat || messages.length === 0 || messageSearch.trim()) {
      return;
    }

    const panel = messagesPanelRef.current;
    if (panel) {
      panel.scrollTop = panel.scrollHeight;
    }
  }, [selectedChat?.id, messages.length, messageSearch]);

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
    setPendingAttachments([]);
    setTypingNames([]);
    setMessageSearch("");
    setIsMessageSearchOpen(false);
    setIsChatMenuOpen(false);
    setIsEmojiPickerOpen(false);
    setMessageContextMenu(null);
    setReplyTarget(null);
    setThreadRootMessageId(null);
    setForwardTarget(null);
    setFullViewImage(null);
    setDetailsTab("media");
  }, [chatId]);

  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent) {
      if (!chatMenuRef.current?.contains(event.target as Node)) {
        setIsChatMenuOpen(false);
      }
      if (!emojiPickerRef.current?.contains(event.target as Node)) {
        setIsEmojiPickerOpen(false);
      }
      setMessageContextMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      setIsChatMenuOpen(false);
      setIsEmojiPickerOpen(false);
      setIsMessageSearchOpen(false);
      setIsDetailsOpen(false);
      setIsNewChatOpen(false);
      setFullViewImage(null);
      setMessageContextMenu(null);
      setForwardTarget(null);
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const transports: Array<"polling" | "websocket"> = preferPollingFirst(window.location.hostname)
      ? ["polling", "websocket"]
      : ["websocket", "polling"];

    const socket = io(getApiUrl(), {
      path: "/socket.io",
      auth: { token: accessToken },
      query: { token: accessToken },
      transports,
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity
    });
    socketRef.current = socket;
    const audioController = new AudioCallController(socket, accessToken);
    audioController.attachRemoteAudioElement(remoteAudioRef.current);
    setCallAudioCapabilities(audioController.getCapabilities());
    setCallAudioSettings(audioController.getAudioSettings());
    audioCallRef.current = audioController;

    const syncAfterSocketResume = () => {
      void loadRef.current();
    };

    socket.on("connect", syncAfterSocketResume);
    socket.on("connect_error", syncAfterSocketResume);
    socket.io.on("reconnect", syncAfterSocketResume);

    socket.on("message:new", (message: Message) => {
      void (async () => {
      const displayMessage = await decryptMessage(message.chatId, message, currentUser?.id);
      const hasKnownChat = chatsRef.current.some((chat) => chat.id === message.chatId);
      const isActiveChat = message.chatId === activeChatIdRef.current;
      const isMine = message.senderId === currentUser?.id;
      const preview = messagePreviewText(displayMessage);
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
      if (!isMine && !isActiveChat) {
        const sourceChat =
          chatsRef.current.find((chat) => chat.id === message.chatId) ??
          selectedChat ??
          null;
        if (sourceChat) {
          pushToast({
            chatId: message.chatId,
            title: displayChatName(sourceChat, currentUser?.id),
            body: `${displayMessage.senderDisplayName ?? "Someone"}: ${preview}`
          });
        }
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
      setError(payload.message ?? "Realtime connection error");
    });

    socket.on(
      "call:ringing",
      (payload: { chatId: string; callerId: string; calleeId: string; expiresAt?: string }) => {
        const selfUserId = currentUser?.id ?? null;
        const isCaller = selfUserId !== null && payload.callerId === selfUserId;
        setActiveCallChatId(payload.chatId);
        setCallPeerUserId(isCaller ? payload.calleeId : payload.callerId);
        if (isCaller) {
          setCallPhase("outgoing");
          stopIncomingRingtone();
        } else {
          setCallPhase("incoming");
          setCallNotice("Incoming audio call");
          startIncomingRingtone();
        }
      }
    );

    socket.on("call:accepted", (payload: { chatId: string; callerId: string; calleeId: string }) => {
      if (!currentUser || payload.chatId !== activeCallChatIdRef.current) {
        return;
      }
      stopIncomingRingtone();
      const peerId = payload.callerId === currentUser.id ? payload.calleeId : payload.callerId;
      setCallPeerUserId(peerId);
      setCallPhase("connecting");
      if (payload.callerId === currentUser.id) {
        void audioController
          .startOutgoing(payload.chatId, peerId)
          .then(() => setCallPhase("in-call"))
          .catch(async (err) => {
            await resetCallState("Microphone permission or audio device failed");
            setError(err instanceof Error ? err.message : "Could not start call");
          });
      } else {
        setCallPhase("in-call");
      }
    });

    socket.on(
      "call:signal",
      (payload: { chatId: string; fromUserId: string; data: Record<string, unknown> }) => {
        void audioController.handleSignal(payload).catch((err) => {
          setError(err instanceof Error ? err.message : "Call signaling failed");
        });
      }
    );

    socket.on("call:declined", () => {
      stopIncomingRingtone();
      void resetCallState("Call declined");
    });
    socket.on("call:canceled", () => {
      stopIncomingRingtone();
      void resetCallState("Call canceled");
    });
    socket.on("call:timeout", () => {
      stopIncomingRingtone();
      void resetCallState("Missed call");
    });
    socket.on("call:ended", () => {
      stopIncomingRingtone();
      void resetCallState("Call ended");
    });
    socket.on("call:error", (payload: { message?: string }) => {
      stopIncomingRingtone();
      setError(payload.message ?? "Call failed");
      void resetCallState();
    });

    return () => {
      socket.off("connect", syncAfterSocketResume);
      socket.off("connect_error", syncAfterSocketResume);
      socket.io.off("reconnect", syncAfterSocketResume);
      stopIncomingRingtone();
      void audioController.cleanup();
      audioCallRef.current = null;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, applyMessagesForChat, currentUser?.id, startIncomingRingtone, stopIncomingRingtone]);

  useEffect(() => {
    if (!isCallAudioSettingsOpen) {
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
  }, [isCallAudioSettingsOpen, refreshCallAudioDevices]);

  useEffect(() => {
    if (callAudioSettings.soundDisabled) {
      stopIncomingRingtone();
    }
  }, [callAudioSettings.soundDisabled, stopIncomingRingtone]);

  async function resetCallState(notice?: string) {
    stopIncomingRingtone();
    await audioCallRef.current?.cleanup();
    setCallPhase("idle");
    setActiveCallChatId(null);
    setCallPeerUserId(null);
    setCallAudioSettings(DEFAULT_CALL_AUDIO_SETTINGS);
    setIsCallAudioSettingsOpen(false);
    setCallAudioWarning(null);
    setCallNotice(notice ?? null);
  }

  async function startDirectAudioCall() {
    if (!selectedChat || selectedChat.type !== "direct" || !currentUser) {
      return;
    }
    const socket = socketRef.current;
    if (!socket) {
      setError("Realtime is not connected yet. Please wait a moment and try calling again.");
      return;
    }
    const connected = await ensureSocketConnected(socket, 4500);
    if (!connected) {
      setError("Realtime connection is offline. Please refresh and try again.");
      return;
    }
    const peer = selectedChat.members.find((member) => member.id !== currentUser.id);
    if (!peer) {
      return;
    }
    setError(null);
    setCallNotice(null);
    setCallPhase("outgoing");
    setActiveCallChatId(selectedChat.id);
    setCallPeerUserId(peer.id);
    socket.emit("call:start", { chatId: selectedChat.id });
  }

  async function acceptIncomingCall() {
    if (!socketRef.current || !activeCallChatId || !callPeerUserId) {
      return;
    }
    setCallNotice(null);
    setCallPhase("connecting");
    stopIncomingRingtone();
    socketRef.current.emit("call:accept", { chatId: activeCallChatId });
    try {
      await audioCallRef.current?.acceptIncoming(activeCallChatId, callPeerUserId);
      setCallPhase("in-call");
    } catch (err) {
      await resetCallState("Microphone permission or audio device failed");
      setError(err instanceof Error ? err.message : "Could not join call");
    }
  }

  function declineIncomingCall() {
    if (!socketRef.current || !activeCallChatId) {
      return;
    }
    stopIncomingRingtone();
    socketRef.current.emit("call:decline", { chatId: activeCallChatId });
  }

  async function endActiveCall() {
    if (!socketRef.current || !activeCallChatId) {
      return;
    }
    const endingChatId = activeCallChatId;
    setCallNotice("Ending call...");
    stopIncomingRingtone();
    socketRef.current.emit("call:end", { chatId: activeCallChatId });
    await audioCallRef.current?.cleanup().catch(() => undefined);
    setCallPhase("idle");
    setActiveCallChatId(null);
    setCallPeerUserId(null);
    setCallAudioSettings(DEFAULT_CALL_AUDIO_SETTINGS);
    setIsCallAudioSettingsOpen(false);
    setCallAudioWarning(null);
    setCallNotice("Call ended");
    if (selectedChat?.id === endingChatId && selectedChat.type === "direct") {
      window.setTimeout(() => {
        setCallNotice((current) => (current === "Call ended" ? null : current));
      }, 2200);
    }
  }

  async function handleCreateDirectChat(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !targetUserId) {
      return;
    }

    setError(null);
    try {
      const chat = await createDirectChat(accessToken, targetUserId);
      await loadOverview();
      setIsNewChatOpen(false);
      setTargetUserId("");
      navigate(`/app/chats/${chat.id}`);
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
      setIsNewChatOpen(false);
      setGroupTitle("");
      setGroupMemberIds([]);
      navigate(`/app/chats/${chat.id}`);
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
      setSettingsNotice("Chat settings saved");
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
      setIsNewChatOpen(false);
      setGroupTitle("");
      setGroupMemberIds([]);
      navigate(`/app/chats/${chat.id}`);
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
    setSettingsNotice(null);
    try {
      const uploaded = await uploadFile(accessToken, file);
      const chat = await updateChat(accessToken, selectedChat.id, {
        chatPhotoFileId: uploaded.id
      });
      setSelectedChat(chat);
      setChats((current) => current.map((item) => (item.id === chat.id ? chat : item)));
      setSettingsNotice("Chat photo updated");
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
    setSettingsNotice(null);
    try {
      const chat = await updateChat(accessToken, selectedChat.id, {
        mediaVisibility: enabled ? "family" : "members"
      });
      setSelectedChat(chat);
      setChats((current) => current.map((item) => (item.id === chat.id ? chat : item)));
      setSettingsNotice(
        chat.mediaVisibilityPendingApproval
          ? "Waiting for the other DM approval"
          : "Media access updated"
      );
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not update media access");
    }
  }

  async function handleCommentsEnabledChange(enabled: boolean) {
    if (!accessToken || !selectedChat || selectedChat.type !== "channel" || !canManageSelectedChat) {
      return;
    }
    setError(null);
    setSettingsNotice(null);
    try {
      const chat = await updateChat(accessToken, selectedChat.id, {
        commentsEnabled: enabled
      });
      setSelectedChat(chat);
      setChats((current) => current.map((item) => (item.id === chat.id ? chat : item)));
      setSettingsNotice(enabled ? "Comments enabled" : "Comments disabled");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not update comments");
    }
  }

  function applyChatUpdate(chat: Chat) {
    setSelectedChat((current) => (current?.id === chat.id ? chat : current));
    setChats((current) => current.map((item) => (item.id === chat.id ? chat : item)));
  }

  async function handleChatPreferenceChange(
    payload: { isMuted?: boolean; isPinned?: boolean; isFavorite?: boolean },
    notice: string
  ) {
    if (!accessToken || !selectedChat) {
      return;
    }

    setError(null);
    setSettingsNotice(null);
    try {
      const chat = await updateChatPreferences(accessToken, selectedChat.id, payload);
      applyChatUpdate(chat);
      setSettingsNotice(notice);
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
      setSettingsNotice("No messages to mark read");
      setIsChatMenuOpen(false);
      return;
    }
    await markChatRead(selectedChat.id, latestMessage.id);
    setSettingsNotice("Marked as read");
    setIsChatMenuOpen(false);
  }

  function focusComposer() {
    setIsDetailsOpen(false);
    window.setTimeout(() => composerInputRef.current?.focus(), 0);
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
    navigate(`/app/chats/${chat.id}`);
  }

  function insertEmoji(emoji: string) {
    const input = composerInputRef.current;
    const start = input?.selectionStart ?? composer.length;
    const end = input?.selectionEnd ?? composer.length;
    const nextValue = `${composer.slice(0, start)}${emoji}${composer.slice(end)}`.slice(0, 4000);
    setComposer(nextValue);
    setIsEmojiPickerOpen(false);
    window.setTimeout(() => {
      const cursor = Math.min(start + emoji.length, nextValue.length);
      composerInputRef.current?.focus();
      composerInputRef.current?.setSelectionRange(cursor, cursor);
    }, 0);
  }

  function openMessageSearch() {
    setIsMessageSearchOpen(true);
    setIsChatMenuOpen(false);
  }

  function handleComposerChange(value: string) {
    setComposer(value);
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

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    if (!accessToken) {
      return;
    }

    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selectedFiles.length === 0) {
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const uploaded: FamilyFile[] = [];
      for (const file of selectedFiles) {
        uploaded.push(await uploadFile(accessToken, file, selectedChat?.id));
      }
      setPendingAttachments((current) => [...current, ...uploaded]);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not upload file");
    } finally {
      setIsUploading(false);
    }
  }

  function removePendingAttachment(fileId: string) {
    setPendingAttachments((current) => current.filter((file) => file.id !== fileId));
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
    setIsChatMenuOpen(false);
    setMessageContextMenu({
      message,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - MESSAGE_CONTEXT_MENU_WIDTH)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - MESSAGE_CONTEXT_MENU_HEIGHT))
    });
  }

  function handleReplyToMessage(message: Message) {
    if (channelCommentsDisabledForViewer) {
      setError("Comments are disabled for this channel");
      setMessageContextMenu(null);
      return;
    }
    if (selectedChat?.type === "channel") {
      setThreadRootMessageId(message.id);
    }
    setReplyTarget(message);
    setMessageContextMenu(null);
    requestAnimationFrame(() => composerInputRef.current?.focus());
  }

  async function handleOpenThread(rootMessage: Message) {
    setThreadRootMessageId(rootMessage.id);
    setReplyTarget(rootMessage);
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
      setSettingsNotice("Message forwarded");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not forward message");
    }
  }

  async function handleSendMessage(event: FormEvent) {
    event.preventDefault();
    if (sendInFlightRef.current) {
      return;
    }
    const content = composer.trim();
    if (!accessToken || !selectedChat || (!content && pendingAttachments.length === 0)) {
      return;
    }
    if (!currentUser) {
      setError("Authentication required");
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
    const clientMessageId = createClientMessageId();
    const createdAt = new Date().toISOString();
    const attachments = pendingAttachments;
    const isChannelThreadMessage = selectedChat.type === "channel" && Boolean(threadRootMessageId);
    const threadRootForSend = isChannelThreadMessage ? threadRootMessageId : null;
    const replyToMessageId = isChannelThreadMessage ? null : replyTarget?.id ?? null;
    const optimisticMessage: Message = {
      id: `pending:${clientMessageId}`,
      chatId: selectedChat.id,
      senderId: currentUser.id,
      senderDisplayName: currentUser.displayName,
      type: inferOptimisticMessageType(attachments, content || null),
      content: content || null,
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
      forwardedFrom: null,
      statuses: [{ userId: currentUser.id, status: "sent", createdAt }],
      reactions: [],
      attachments,
      clientMessageId,
      deliveryState: "sending"
    };
    setError(null);
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
    setComposer("");
    setPendingAttachments([]);
    setReplyTarget(null);
    socketRef.current?.emit("typing:stop", { chatId: selectedChat.id });

    try {
      sendInFlightRef.current = true;
      setIsSendingMessage(true);
      const encrypted = await encryptMessageContent(selectedChat, content || null, currentUser.id);
      const message = await sendMessage(
        accessToken,
        selectedChat.id,
        encrypted.content,
        attachments.map((file) => file.id),
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
      applyMessagesForChat(selectedChat.id, (current) =>
        markPendingMessageFailed(
          current,
          clientMessageId,
          err instanceof ApiError ? String(err.message) : "Message failed"
        )
      );
      setError(err instanceof ApiError ? String(err.message) : "Message failed");
    } finally {
      sendInFlightRef.current = false;
      setIsSendingMessage(false);
    }
  }

  if (chatId && !isLoading && !isChatLoading && !selectedChat && !error) {
    return <Navigate to="/app/chats" replace />;
  }

  return (
    <main className="app-shell app-frame messenger-shell">
      <AppNav unreadTotalOverride={unreadTotal} />
      <section className="messenger-workspace">
        {error && <p className="error-text floating-alert" role="alert">{error}</p>}
        {settingsNotice && (
          <p className="success-text floating-alert" role="status">
            {settingsNotice}
          </p>
        )}
        <div className="toast-stack" aria-live="polite" aria-atomic="false">
          {toasts.map((toast) => (
            <button
              key={toast.id}
              type="button"
              className="toast-card"
              onClick={() => {
                dismissToast(toast.id);
                const chat = chatsRef.current.find((item) => item.id === toast.chatId);
                if (chat) {
                  openChat(chat);
                } else {
                  navigate(`/app/chats/${toast.chatId}`);
                }
              }}
            >
              <strong>{toast.title}</strong>
              <span>{toast.body}</span>
            </button>
          ))}
        </div>
        {!isOnline && (
          <p className="offline-banner" role="status">
            <WifiOff aria-hidden="true" size={18} />
            Offline. Messages will send when you are back online.
          </p>
        )}

        <div
          className={`chat-layout ${isDetailsOpen && selectedChat ? "details-open" : ""} ${
            chatId ? "has-active-chat" : "chat-list-view"
          }`}
        >
          <aside className="chat-sidebar">
            <div className="chat-sidebar-header">
              <div className="sidebar-title-row">
                <span className="avatar app-avatar">{chatInitials(family?.name ?? "Stovo")}</span>
                <div>
                  <p className="eyebrow">{family?.name ?? "Stovo"}</p>
                  <h1>Chats</h1>
                </div>
                <div className="sidebar-actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Create chat"
                    title="Create chat"
                    onClick={() => setIsNewChatOpen(true)}
                  >
                    <Plus aria-hidden="true" size={20} />
                  </button>
                </div>
              </div>
              <label className="search-field">
                <Search aria-hidden="true" size={18} />
                <input
                  placeholder="Search chats"
                  value={chatSearch}
                  onChange={(event) => setChatSearch(event.target.value)}
                />
              </label>
              <div className="filter-chip-row" aria-label="Chat filters">
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
                                file={chatAvatarFile(chat, currentUser?.id)}
                                label={chatName}
                              />
                              <span className="chat-list-copy">
                                <span className="chat-list-topline">
                                  <strong>{chatName}</strong>
                                  <time>{formatChatTime(chat.updatedAt)}</time>
                                </span>
                                <span>{chatPreview(chat)}</span>
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
                  <button type="button" onClick={() => setIsNewChatOpen(true)}>
                    Start a chat
                  </button>
                </div>
              )}
            </div>
          </aside>

          <section className="chat-detail">
            {selectedChat ? (
              <>
                <div className="chat-detail-header">
                  <button
                    type="button"
                    className="mobile-back-button"
                    aria-label="Back to chats"
                    onClick={() => {
                      setIsDetailsOpen(false);
                      setSelectedChat(null);
                      navigate("/app/chats");
                    }}
                  >
                    <ChevronLeft aria-hidden="true" size={18} />
                    Chats
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
                      file={chatAvatarFile(selectedChat, currentUser?.id)}
                      label={displayChatName(selectedChat, currentUser?.id)}
                    />
                    <span>
                      <strong>{displayChatName(selectedChat, currentUser?.id)}</strong>
                      <small>
                        {typingNames.length > 0
                          ? `${typingNames.join(", ")} typing...`
                          : `${selectedChat.members.length} member${
                              selectedChat.members.length === 1 ? "" : "s"
                            }`}
                      </small>
                    </span>
                  </button>
                  <span className="encryption-pill chat-header-encryption-pill">
                    <ShieldCheck aria-hidden="true" size={13} />
                    {encryptionProtocolLabel(selectedChat.encryptionProtocol)}
                  </span>
                  <div className="chat-header-actions">
                    {selectedChat.type === "direct" && (
                      <button
                        type="button"
                        className="icon-button subtle"
                        aria-label="Start audio call"
                        title="Start audio call"
                        onClick={() => void startDirectAudioCall()}
                        disabled={callPhase !== "idle" && activeCallChatId === selectedChat.id}
                      >
                        <Phone aria-hidden="true" size={19} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-button subtle"
                      aria-label="Search chat"
                      title="Search chat"
                      aria-expanded={isMessageSearchOpen}
                      onClick={openMessageSearch}
                    >
                      <Search aria-hidden="true" size={19} />
                    </button>
                    <button
                      type="button"
                      className="icon-button subtle"
                      aria-label="Chat details"
                      title="Chat details"
                      onClick={() => setIsDetailsOpen((value) => !value)}
                    >
                      <Info aria-hidden="true" size={19} />
                    </button>
                    <div className="menu-anchor" ref={chatMenuRef}>
                      <button
                        type="button"
                        className="icon-button subtle"
                        aria-label="More actions"
                        aria-expanded={isChatMenuOpen}
                        aria-haspopup="menu"
                        title="More actions"
                        onClick={() => setIsChatMenuOpen((value) => !value)}
                      >
                        <MoreVertical aria-hidden="true" size={19} />
                      </button>
                      {isChatMenuOpen && (
                        <div className="action-menu" role="menu">
                          <button type="button" role="menuitem" onClick={openMessageSearch}>
                            <Search aria-hidden="true" size={16} />
                            Search messages
                          </button>
                          <button type="button" role="menuitem" onClick={() => void handleMarkSelectedChatRead()}>
                            <CheckCheck aria-hidden="true" size={16} />
                            Mark as read
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() =>
                              void handleChatPreferenceChange(
                                { isPinned: !selectedChat.isPinned },
                                selectedChat.isPinned ? "Chat unpinned" : "Chat pinned"
                              )
                            }
                          >
                            <Pin aria-hidden="true" size={16} />
                            {selectedChat.isPinned ? "Unpin chat" : "Pin chat"}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() =>
                              void handleChatPreferenceChange(
                                { isMuted: !selectedChat.isMuted },
                                selectedChat.isMuted ? "Notifications enabled" : "Chat muted"
                              )
                            }
                          >
                            {selectedChat.isMuted ? (
                              <Bell aria-hidden="true" size={16} />
                            ) : (
                              <BellOff aria-hidden="true" size={16} />
                            )}
                            {selectedChat.isMuted ? "Unmute" : "Mute"}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() =>
                              void handleChatPreferenceChange(
                                { isFavorite: !selectedChat.isFavorite },
                                selectedChat.isFavorite ? "Removed from favorites" : "Added to favorites"
                              )
                            }
                          >
                            <Star aria-hidden="true" size={16} />
                            {selectedChat.isFavorite ? "Remove favorite" : "Favorite"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {isMessageSearchOpen && (
                  <div className="search-field message-search-field" role="search">
                    <Search aria-hidden="true" size={18} />
                    <input
                      autoFocus
                      aria-label="Search this chat"
                      placeholder="Search this chat"
                      value={messageSearch}
                      onChange={(event) => setMessageSearch(event.target.value)}
                    />
                    <button
                      type="button"
                      className="icon-button subtle clear-search-button"
                      aria-label="Close message search"
                      onClick={() => {
                        setMessageSearch("");
                        setIsMessageSearchOpen(false);
                      }}
                    >
                      <X aria-hidden="true" size={16} />
                    </button>
                  </div>
                )}
                <div
                  className={messages.length === 0 ? "phase-empty-state" : "messages-panel"}
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
                      <Search aria-hidden="true" size={28} />
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
                            <ChevronLeft aria-hidden="true" size={16} />
                            Back to chat
                          </button>
                          <span>
                            {selectedChat?.type === "channel" ? "Comments on: " : "Thread on: "}
                            {messageActionSummary(threadRootMessage)}
                          </span>
                        </div>
                      )}
                      <div className="date-separator">{formatDateSeparator(visibleMessages[0]?.createdAt)}</div>
                      {visibleMessages.map((message) => {
                        const mine = message.senderId === currentUser?.id;
                        const repliedMessage = message.replyToMessageId
                          ? messages.find((candidate) => candidate.id === message.replyToMessageId)
                          : null;
                        const senderProfile = selectedChat.members.find(
                          (member) => member.id === message.senderId
                        );
                        const showSenderIdentity = !mine && isMultiMemberChat(selectedChat.type);
                        return (
                          <article
                            className={`message-bubble ${mine ? "mine" : ""} ${message.deliveryState ?? ""}`}
                            key={message.id}
                            onContextMenu={(event) => openMessageContextMenu(event, message)}
                          >
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
                            {!mine && !showSenderIdentity && (
                              <strong className="message-sender">
                                {message.senderDisplayName ?? "Family member"}
                              </strong>
                            )}
                            {repliedMessage && (
                              <span className="message-reference">
                                Reply to {repliedMessage.senderDisplayName ?? "Family member"}:{" "}
                                {messageActionSummary(repliedMessage)}
                              </span>
                            )}
                            {message.forwardedFrom && (
                              <span className="message-reference">
                                Forwarded from {message.forwardedFrom.senderDisplayName ?? "Family member"}
                              </span>
                            )}
                            {message.content ? (
                              <p>{message.content}</p>
                            ) : message.deliveryError ? (
                              <p className="encrypted-message-unavailable">{message.deliveryError}</p>
                            ) : null}
                            {message.attachments.length > 0 && (
                              <div className="message-attachments">
                                {message.attachments.map((file) => (
                                  <AttachmentCard
                                    accessToken={accessToken}
                                    file={file}
                                    key={file.id}
                                    compact
                                    onOpenImage={(attachment, previewUrl) =>
                                      setFullViewImage({ file: attachment, previewUrl })
                                    }
                                  />
                                ))}
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
                            <span className="message-meta">
                              {messageDeliveryLabel(message, mine)}
                              {mine && message.deliveryState !== "failed" && (
                                <CheckCheck aria-hidden="true" size={14} />
                              )}
                            </span>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
                {typingNames.length > 0 && (
                  <p className="typing-indicator">{typingNames.join(", ")} typing...</p>
                )}
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
                      disabled={messageContextMenu.message.id.startsWith("pending:")}
                      onClick={() => {
                        setForwardTarget(messageContextMenu.message);
                        setMessageContextMenu(null);
                      }}
                    >
                      <Forward aria-hidden="true" size={16} />
                      Forward
                    </button>
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
                {(callPhase !== "idle" || callNotice) && selectedChat.type === "direct" && activeCallChatId === selectedChat.id && (
                  <section className="call-banner" aria-live="polite">
                    <strong>
                      {callPhase === "incoming"
                        ? "Incoming audio call"
                        : callPhase === "outgoing"
                          ? "Ringing..."
                          : callPhase === "connecting"
                            ? "Connecting..."
                            : callPhase === "in-call"
                              ? "Audio call in progress"
                              : "Call"}
                    </strong>
                    {callNotice && <span>{callNotice}</span>}
                    <div className="call-controls-row">
                      {callPhase === "incoming" && (
                        <>
                          <div className="call-control-wrap">
                            <button
                              type="button"
                              className="call-control-btn accept-call"
                              aria-label="Accept call"
                              onClick={() => void acceptIncomingCall()}
                            >
                              <Phone aria-hidden="true" size={20} />
                            </button>
                            <span>Accept</span>
                          </div>
                          <div className="call-control-wrap">
                            <button
                              type="button"
                              className="call-control-btn end-call"
                              aria-label="Decline call"
                              onClick={declineIncomingCall}
                            >
                              <PhoneOff aria-hidden="true" size={20} />
                            </button>
                            <span>Decline</span>
                          </div>
                        </>
                      )}
                      {(callPhase === "outgoing" || callPhase === "connecting" || callPhase === "in-call") && (
                        <>
                          <div className="call-control-wrap">
                            <button
                              type="button"
                              className={`call-control-btn${callAudioSettings.micMuted ? " is-muted" : ""}`}
                              aria-label={callAudioSettings.micMuted ? "Unmute microphone" : "Mute microphone"}
                              onClick={() => void applyCallAudioPatch({ micMuted: !callAudioSettings.micMuted })}
                            >
                              {callAudioSettings.micMuted ? <MicOff aria-hidden="true" size={20} /> : <Mic aria-hidden="true" size={20} />}
                            </button>
                            <span>{callAudioSettings.micMuted ? "Unmute" : "Mute"}</span>
                          </div>
                          <div className="call-control-wrap">
                            <button
                              type="button"
                              className={`call-control-btn${callAudioSettings.soundDisabled ? " is-muted" : ""}`}
                              aria-label={callAudioSettings.soundDisabled ? "Enable speaker" : "Disable speaker"}
                              onClick={() => void applyCallAudioPatch({ soundDisabled: !callAudioSettings.soundDisabled })}
                            >
                              {callAudioSettings.soundDisabled ? <VolumeX aria-hidden="true" size={20} /> : <Volume2 aria-hidden="true" size={20} />}
                            </button>
                            <span>{callAudioSettings.soundDisabled ? "Unmute" : "Dynamic"}</span>
                          </div>
                          {isMobileViewport && (
                            <div className="call-control-wrap">
                              <button
                                type="button"
                                className={`call-control-btn${callAudioSettings.speakerMode === "large" ? " is-on" : ""}`}
                                aria-label={callAudioSettings.speakerMode === "small" ? "Switch to loudspeaker" : "Switch to earpiece"}
                                onClick={() => void applyCallAudioPatch({ speakerMode: callAudioSettings.speakerMode === "small" ? "large" : "small" })}
                              >
                                {callAudioSettings.speakerMode === "small"
                                  ? <Smartphone aria-hidden="true" size={20} />
                                  : <Volume2 aria-hidden="true" size={20} />}
                              </button>
                              <span>{callAudioSettings.speakerMode === "small" ? "Speaker" : "Earpiece"}</span>
                            </div>
                          )}
                          <div className="call-control-wrap">
                            <button
                              type="button"
                              className={`call-control-btn${isCallAudioSettingsOpen ? " is-on" : ""}`}
                              aria-label="Audio settings"
                              aria-pressed={isCallAudioSettingsOpen}
                              onClick={() => setIsCallAudioSettingsOpen((current) => !current)}
                            >
                              <SlidersHorizontal aria-hidden="true" size={20} />
                            </button>
                            <span>Settings</span>
                          </div>
                          <div className="call-control-wrap">
                            <button
                              type="button"
                              className="call-control-btn end-call"
                              aria-label="End call"
                              onClick={() => void endActiveCall()}
                            >
                              <PhoneOff aria-hidden="true" size={20} />
                            </button>
                            <span>End</span>
                          </div>
                        </>
                      )}
                    </div>
                    {isCallAudioSettingsOpen && (
                      <div className="call-audio-settings-panel">
                        {callAudioWarning && <p className="muted-copy">{callAudioWarning}</p>}
                        <label>
                          Microphone
                          <select
                            value={callAudioSettings.inputDeviceId}
                            disabled={!callAudioCapabilities.canSelectInputDevice}
                            onChange={(event) =>
                              void applyCallAudioPatch({ inputDeviceId: event.target.value })
                            }
                          >
                            <option value="">System default</option>
                            {callAudioDevices
                              .filter((device) => device.kind === "audioinput")
                              .map((device) => (
                                <option key={device.deviceId} value={device.deviceId}>
                                  {device.label}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Speaker output
                          <select
                            value={callAudioSettings.outputDeviceId}
                            disabled={!callAudioCapabilities.canSelectOutputDevice}
                            onChange={(event) =>
                              void applyCallAudioPatch({ outputDeviceId: event.target.value })
                            }
                          >
                            <option value="">System default</option>
                            {callAudioDevices
                              .filter((device) => device.kind === "audiooutput")
                              .map((device) => (
                                <option key={device.deviceId} value={device.deviceId}>
                                  {device.label}
                                </option>
                              ))}
                          </select>
                        </label>
                        {!callAudioCapabilities.canSelectOutputDevice && (
                          <p className="muted-copy">
                            This browser uses default output only.
                          </p>
                        )}
                        <label className="inline-toggle">
                          <input
                            type="checkbox"
                            checked={callAudioSettings.echoCancellation}
                            disabled={!callAudioCapabilities.canUseEchoCancellation}
                            onChange={(event) =>
                              void applyCallAudioPatch({
                                echoCancellation: event.target.checked
                              })
                            }
                          />
                          <span>Echo cancellation</span>
                        </label>
                        <label className="inline-toggle">
                          <input
                            type="checkbox"
                            checked={callAudioSettings.noiseSuppression}
                            disabled={!callAudioCapabilities.canUseNoiseSuppression}
                            onChange={(event) =>
                              void applyCallAudioPatch({
                                noiseSuppression: event.target.checked
                              })
                            }
                          />
                          <span>Noise suppression</span>
                        </label>
                        <label className="inline-toggle">
                          <input
                            type="checkbox"
                            checked={callAudioSettings.autoGainControl}
                            disabled={!callAudioCapabilities.canUseAutoGainControl}
                            onChange={(event) =>
                              void applyCallAudioPatch({
                                autoGainControl: event.target.checked
                              })
                            }
                          />
                          <span>Auto gain control</span>
                        </label>
                        <label className="inline-toggle">
                          <input
                            type="checkbox"
                            checked={callAudioSettings.voiceEnhancement}
                            disabled={!callAudioCapabilities.canUseVoiceEnhancement}
                            onChange={(event) =>
                              void applyCallAudioPatch({
                                voiceEnhancement: event.target.checked
                              })
                            }
                          />
                          <span>Voice enhancement</span>
                        </label>
                        {isMobileViewport && (
                          <div className="call-device-row" role="group" aria-label="Audio output">
                            <button
                              type="button"
                              className={`call-device-btn${callAudioSettings.speakerMode === "small" ? " active" : ""}`}
                              aria-pressed={callAudioSettings.speakerMode === "small"}
                              onClick={() => void applyCallAudioPatch({ speakerMode: "small" })}
                            >
                              <Smartphone aria-hidden="true" size={18} />
                              <span>Earpiece</span>
                            </button>
                            <button
                              type="button"
                              className={`call-device-btn${callAudioSettings.speakerMode === "large" ? " active" : ""}`}
                              aria-pressed={callAudioSettings.speakerMode === "large"}
                              onClick={() => void applyCallAudioPatch({ speakerMode: "large" })}
                            >
                              <Volume2 aria-hidden="true" size={18} />
                              <span>Loudspeaker</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                )}
                <form className="message-composer" onSubmit={handleSendMessage}>
                  {channelCommentsDisabledForViewer && (
                    <p className="muted-copy">Comments are disabled in this channel.</p>
                  )}
                  {missingCommentThread && (
                    <p className="muted-copy">Open a post thread to comment.</p>
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
                  {pendingAttachments.length > 0 && (
                    <div className="pending-attachments">
                      {pendingAttachments.map((file) => (
                        <article key={file.id} className="pending-attachment-card">
                          <div className="pending-attachment-copy">
                            <strong>{file.originalName}</strong>
                            <span>
                              {pendingAttachmentKindLabel(file)} / {formatFileSize(file.sizeBytes)}
                            </span>
                          </div>
                          <button
                            type="button"
                            aria-label={`Remove ${file.originalName}`}
                            onClick={() => removePendingAttachment(file.id)}
                          >
                            <X aria-hidden="true" size={14} />
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                  <div className="message-composer-row">
                    <button
                      type="button"
                      className="file-picker"
                      aria-label="Attach files"
                      title="Attach files"
                      disabled={isUploading || channelCommentsDisabledForViewer || missingCommentThread}
                      onClick={() => attachmentInputRef.current?.click()}
                    >
                      <Paperclip aria-hidden="true" size={20} />
                    </button>
                    <div className="emoji-picker-shell" ref={emojiPickerRef}>
                      <button
                        type="button"
                        className="emoji-picker-button"
                        aria-label="Add emoji"
                        aria-expanded={isEmojiPickerOpen}
                        title="Add emoji"
                        disabled={channelCommentsDisabledForViewer || missingCommentThread}
                        onClick={() => setIsEmojiPickerOpen((current) => !current)}
                      >
                        <Smile aria-hidden="true" size={20} />
                      </button>
                      {isEmojiPickerOpen && (
                        <div className="emoji-picker" role="menu" aria-label="Choose emoji">
                          <EmojiPicker
                            onEmojiClick={handleComposerEmojiPick}
                            autoFocusSearch={false}
                            lazyLoadEmojis
                            width={320}
                            height={380}
                          />
                        </div>
                      )}
                    </div>
                    <input
                      ref={attachmentInputRef}
                      accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/x-wav,audio/ogg,audio/webm,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                      className="visually-hidden"
                      disabled={isUploading || channelCommentsDisabledForViewer || missingCommentThread}
                      multiple
                      type="file"
                      onChange={handleFileSelect}
                    />
                    <input
                      ref={composerInputRef}
                      maxLength={4000}
                      placeholder={
                        channelCommentsDisabledForViewer
                          ? "Comments are disabled"
                          : missingCommentThread
                            ? "Open a post thread to comment"
                            : selectedChat?.type === "channel" && canPostInSelectedChannel
                              ? "Post an update"
                              : "Message"
                      }
                      value={composer}
                      disabled={channelCommentsDisabledForViewer || missingCommentThread}
                      onChange={(event) => handleComposerChange(event.target.value)}
                    />
                    <button
                      type="submit"
                      aria-label="Send message"
                      disabled={
                        isUploading ||
                        isSendingMessage ||
                        channelCommentsDisabledForViewer ||
                        missingCommentThread ||
                        (!composer.trim() && pendingAttachments.length === 0)
                      }
                    >
                      {isUploading ? (
                        "Uploading"
                      ) : isSendingMessage ? (
                        "Sending"
                      ) : (
                        <>
                          <Send aria-hidden="true" size={18} />
                          <span>Send</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="empty-state chat-empty-state">
                <MessageCircle aria-hidden="true" size={42} />
                <strong>Select a chat</strong>
                <p>Choose a conversation on the left, or start a new small-circle chat.</p>
                <button type="button" onClick={() => setIsNewChatOpen(true)}>
                  New message
                </button>
              </div>
            )}
          </section>
          {selectedChat && isDetailsOpen && (
            <aside className="chat-details-panel">
              <div className="details-hero">
                <button
                  type="button"
                  className="icon-button subtle close-panel-button"
                  aria-label="Close details"
                  title="Close details"
                  onClick={() => setIsDetailsOpen(false)}
                >
                  <X aria-hidden="true" size={18} />
                </button>
                <RealAvatar
                  accessToken={accessToken}
                  className={`avatar avatar-xl chat-avatar ${chatAvatarTypeClass(selectedChat)}`}
                  file={chatAvatarFile(selectedChat, currentUser?.id)}
                  label={displayChatName(selectedChat, currentUser?.id)}
                />
                {canManageSelectedChat && (
                  <>
                    <button
                      type="button"
                      className="avatar-edit-button"
                      aria-label="Change chat photo"
                      title="Change chat photo"
                      disabled={isUploading}
                      onClick={() => chatPhotoInputRef.current?.click()}
                    >
                      <Camera aria-hidden="true" size={16} />
                    </button>
                    <input
                      ref={chatPhotoInputRef}
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      className="visually-hidden"
                      disabled={isUploading}
                      type="file"
                      onChange={handleChatPhotoSelect}
                    />
                  </>
                )}
                <h2>{displayChatName(selectedChat, currentUser?.id)}</h2>
                <p>
                  {selectedChat.type === "direct"
                    ? "Direct message"
                    : `${selectedChat.members.length} members`}
                </p>
                <span className="encryption-pill details-encryption-pill">
                  <ShieldCheck aria-hidden="true" size={13} />
                  {encryptionProtocolLabel(selectedChat.encryptionProtocol)}
                </span>
                <div className="details-action-row">
                  <button type="button" onClick={focusComposer}>
                    <MessageCircle aria-hidden="true" size={18} />
                    Message
                  </button>
                  <button
                    type="button"
                    aria-pressed={selectedChat.isMuted}
                    onClick={() =>
                      void handleChatPreferenceChange(
                        { isMuted: !selectedChat.isMuted },
                        selectedChat.isMuted ? "Notifications enabled" : "Chat muted"
                      )
                    }
                  >
                    {selectedChat.isMuted ? (
                      <Bell aria-hidden="true" size={18} />
                    ) : (
                      <BellOff aria-hidden="true" size={18} />
                    )}
                    {selectedChat.isMuted ? "Unmute" : "Mute"}
                  </button>
                  <button
                    type="button"
                    aria-pressed={selectedChat.isFavorite}
                    onClick={() =>
                      void handleChatPreferenceChange(
                        { isFavorite: !selectedChat.isFavorite },
                        selectedChat.isFavorite ? "Removed from favorites" : "Added to favorites"
                      )
                    }
                  >
                    <Star aria-hidden="true" size={18} />
                    {selectedChat.isFavorite ? "Saved" : "Favorite"}
                  </button>
                </div>
              </div>

              <form className="details-form" onSubmit={handleChatSettingsSubmit}>
                <label>
                  Chat name
                  <input
                    disabled={!canManageSelectedChat}
                    value={chatTitleDraft}
                    onChange={(event) => setChatTitleDraft(event.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  disabled={
                    !canManageSelectedChat ||
                    !chatTitleDraft.trim() ||
                    chatTitleDraft.trim() === displayChatName(selectedChat, currentUser?.id)
                  }
                >
                  Save
                </button>
              </form>

              {selectedChat.type !== "family" && (
                <section className="details-section">
                  <div className="section-title-row">
                    <h3>Media access</h3>
                    <span>
                      {selectedChat.mediaVisibility === "family" ? "Family storage" : "Chat members"}
                    </span>
                  </div>
                  <label className="inline-toggle media-visibility-toggle">
                    <input
                      type="checkbox"
                      checked={mediaVisibilityToggleChecked(selectedChat)}
                      disabled={!canUpdateMediaVisibility(selectedChat, currentUser)}
                      onChange={(event) => void handleMediaVisibilityChange(event.target.checked)}
                    />
                    <span>Show media in family storage</span>
                  </label>
                  {selectedChat.mediaVisibilityPendingApproval && (
                    <p className="muted-copy">
                      {`Approval ${selectedChat.mediaVisibilityApprovalCount}/${selectedChat.mediaVisibilityApprovalRequired}`}
                    </p>
                  )}
                </section>
              )}

              {selectedChat.type === "channel" && (
                <section className="details-section">
                  <div className="section-title-row">
                    <h3>Comments</h3>
                    <span>{selectedChat.commentsEnabled ? "Enabled" : "Disabled"}</span>
                  </div>
                  <label className="inline-toggle media-visibility-toggle">
                    <input
                      type="checkbox"
                      checked={selectedChat.commentsEnabled}
                      disabled={!canManageSelectedChat}
                      onChange={(event) => void handleCommentsEnabledChange(event.target.checked)}
                    />
                    <span>Allow comments</span>
                  </label>
                </section>
              )}

              <section className="details-section">
                <div className="section-title-row">
                  <h3>Shared content</h3>
                  <span>{detailsTab === "links" ? 0 : sharedContentItems.length}</span>
                </div>
                <div className="tab-row" role="tablist" aria-label="Shared content">
                  <button
                    type="button"
                    className={detailsTab === "media" ? "active" : ""}
                    aria-pressed={detailsTab === "media"}
                    onClick={() => setDetailsTab("media")}
                  >
                    Media
                  </button>
                  <button
                    type="button"
                    className={detailsTab === "files" ? "active" : ""}
                    aria-pressed={detailsTab === "files"}
                    onClick={() => setDetailsTab("files")}
                  >
                    Files
                  </button>
                  <button
                    type="button"
                    className={detailsTab === "links" ? "active" : ""}
                    aria-pressed={detailsTab === "links"}
                    onClick={() => setDetailsTab("links")}
                  >
                    Links
                  </button>
                </div>
                {sharedContentItems.length > 0 ? (
                  <div className="details-media-grid">
                    {sharedContentItems.map((file) => (
                      <SharedContentThumb
                        accessToken={accessToken}
                        file={file}
                        key={file.id}
                        onOpenImage={(attachment, previewUrl) =>
                          setFullViewImage({ file: attachment, previewUrl })
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p className="muted-copy">
                    {detailsTab === "links"
                      ? "Links shared in messages will appear here."
                      : detailsTab === "media"
                        ? "Shared photos and videos appear here."
                        : "Shared documents and other files appear here."}
                  </p>
                )}
              </section>

              <section className="details-section">
                <div className="section-title-row">
                  <h3>Members</h3>
                  <span>{selectedChat.members.length}</span>
                </div>
                <div className="details-member-list">
                  {selectedChat.members.map((member) => (
                    <article className="details-member-row" key={member.id}>
                      <RealAvatar
                        accessToken={accessToken}
                        className="avatar member-avatar"
                        file={member.profilePhoto}
                        label={member.displayName}
                      />
                      <div>
                        <strong>{member.displayName}</strong>
                        <span>@{member.username}</span>
                      </div>
                      <small>{member.role}</small>
                    </article>
                  ))}
                </div>
              </section>
            </aside>
          )}
        </div>
        <audio ref={remoteAudioRef} autoPlay className="visually-hidden" />
        {callPhase === "incoming" && activeCallChatId && (
          <div className="modal-backdrop call-modal-backdrop" role="presentation">
            <section className="messenger-modal call-modal" role="dialog" aria-modal="true" aria-labelledby="incoming-call-title">
              <div className="modal-header">
                <h2 id="incoming-call-title">Incoming call</h2>
              </div>
              <p className="muted-copy">{activeCallPeerName} is calling you.</p>
              {callNotice && <p className="muted-copy">{callNotice}</p>}
              <div className="call-controls-row call-modal-controls">
                <div className="call-control-wrap">
                  <button
                    type="button"
                    className="call-control-btn accept-call"
                    aria-label="Accept call"
                    onClick={() => void acceptIncomingCall()}
                  >
                    <Phone aria-hidden="true" size={22} />
                  </button>
                  <span>Accept</span>
                </div>
                <div className="call-control-wrap">
                  <button
                    type="button"
                    className="call-control-btn end-call"
                    aria-label="Decline call"
                    onClick={declineIncomingCall}
                  >
                    <PhoneOff aria-hidden="true" size={22} />
                  </button>
                  <span>Decline</span>
                </div>
              </div>
            </section>
          </div>
        )}
        {isNewChatOpen && (
          <div className="modal-backdrop" role="presentation">
            <section className="messenger-modal" role="dialog" aria-modal="true" aria-labelledby="new-chat-title">
              <div className="modal-header">
                <h2 id="new-chat-title">New chat</h2>
                <button
                  type="button"
                  className="icon-button subtle"
                  aria-label="Close new chat"
                  title="Close"
                  onClick={() => setIsNewChatOpen(false)}
                >
                  <X aria-hidden="true" size={18} />
                </button>
              </div>
              <div className="segmented-control">
                <button
                  type="button"
                  className={newChatMode === "direct" ? "active" : ""}
                  aria-pressed={newChatMode === "direct"}
                  onClick={() => setNewChatMode("direct")}
                >
                  DM
                </button>
                <button
                  type="button"
                  className={newChatMode === "group" ? "active" : ""}
                  aria-pressed={newChatMode === "group"}
                  onClick={() => setNewChatMode("group")}
                >
                  Group
                </button>
                <button
                  type="button"
                  className={newChatMode === "channel" ? "active" : ""}
                  aria-pressed={newChatMode === "channel"}
                  onClick={() => setNewChatMode("channel")}
                >
                  Channel
                </button>
              </div>
              {newChatMode === "direct" ? (
                <form className="modal-form" onSubmit={handleCreateDirectChat}>
                  <label>
                    Member
                    <select
                      value={targetUserId}
                      onChange={(event) => setTargetUserId(event.target.value)}
                    >
                      <option value="">Select member</option>
                      {directTargets.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" disabled={!targetUserId}>
                    Start DM
                  </button>
                </form>
              ) : (
                <form
                  className="modal-form"
                  onSubmit={newChatMode === "channel" ? handleCreateChannelChat : handleCreateGroupChat}
                >
                  <label>
                    {newChatMode === "channel" ? "Channel name" : "Group name"}
                    <input
                      maxLength={255}
                      value={groupTitle}
                      onChange={(event) => setGroupTitle(event.target.value)}
                    />
                  </label>
                  <div className="member-picker">
                    {directTargets.map((member) => (
                      <label className="member-choice" key={member.id}>
                        <input
                          type="checkbox"
                          checked={groupMemberIds.includes(member.id)}
                          onChange={() => toggleGroupMember(member.id)}
                        />
                        <span>{member.displayName}</span>
                        <small>{member.role}</small>
                      </label>
                    ))}
                  </div>
                  <button type="submit" disabled={!groupTitle.trim() || groupMemberIds.length === 0}>
                    {newChatMode === "channel" ? "Create channel" : "Create group"}
                  </button>
                </form>
              )}
            </section>
          </div>
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

        {fullViewImage && (
          <ImageLightbox
            imageUrl={fullViewImage.previewUrl}
            title={fullViewImage.file.originalName}
            subtitle={`${fullViewImage.file.mimeType} / ${formatFileSize(fullViewImage.file.sizeBytes)}`}
            onClose={() => setFullViewImage(null)}
            onDownload={
              accessToken ? () => void saveFileToDisk(accessToken, fullViewImage.file) : undefined
            }
          />
        )}
      </section>
    </main>
  );
}
