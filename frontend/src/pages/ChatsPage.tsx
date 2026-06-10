import {
  ChangeEvent,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
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
  Pin,
  Plus,
  Reply,
  RotateCcw,
  SlidersHorizontal,
  Smartphone,
  Video,
  VideoOff,
  Volume2,
  Maximize2,
  Minimize2,
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
import CallController, {
  CallCapabilities,
  CallDevice,
  CallSettings,
} from "../realtime/CallController";
import {
  getAudioSettings,
  saveAudioSettings,
  toPersistedSettings,
  mergeWithDefaults
} from "../api/audioSettings";
import { Capacitor } from "@capacitor/core";
import { App, AppState } from "@capacitor/app";
import {
  addProximityListener,
  disableNativeCallMode,
  enableNativeCallMode,
  isNativeCallPluginAvailable,
} from "../native/callPlugin";

type CallPhase = "idle" | "outgoing" | "incoming" | "connecting" | "in-call";

type CallTrackStatus = {
  echoCancellation: boolean | null;
  noiseSuppression: boolean | null;
  autoGainControl: boolean | null;
};

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
  const ringtoneAudioContextRef = useRef<AudioContext | null>(null);
  const ringtoneTimerRef = useRef<number | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const loadOverviewRequestRef = useRef(0);
  const loadChatRequestRef = useRef(0);
  const activeChatIdRef = useRef<string | undefined>(chatId);
  const activeCallChatIdRef = useRef<string | null>(null);
  const callTypeRef = useRef<"audio" | "video">("audio");
  const callPhaseRef = useRef<CallPhase>("idle");
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
  const saveAudioSettingsTimerRef = useRef<number | null>(null);
  const soundDisabledRef = useRef(callAudioSettings.soundDisabled);
  const callSettingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const callSettingsMenuRef = useRef<HTMLDivElement | null>(null);
  const callAudioPopupRef = useRef<HTMLDivElement | null>(null);
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
      gainNode.gain.exponentialRampToValueAtTime(0.35, startAt + 0.02);
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
    callTypeRef.current = callType;
  }, [callType]);
  useEffect(() => {
    callPhaseRef.current = callPhase;
  }, [callPhase]);

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
      if (!emojiPickerRef.current?.contains(event.target as Node)) {
        setIsEmojiPickerOpen(false);
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
      setIsChatMenuOpen(false);
      setIsEmojiPickerOpen(false);
      setIsMessageSearchOpen(false);
      setIsDetailsOpen(false);
      setIsNewChatOpen(false);
      setFullViewImage(null);
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
    const audioController = new CallController(socket, accessToken);
    audioController.attachRemoteAudioElement(remoteAudioRef.current);
    audioController.onVideoUnavailable = () => {
      setCallType("audio");
      setCallNotice("Camera not available — continuing with audio only");
    };
    audioController.onConnectionFailed = () => {
      console.error("[call] onConnectionFailed fired");
      if (callPhaseRef.current === "idle") return;
      void resetCallState("Call connection lost");
    };
    audioController.onConnectionEstablished = () => {
      console.log("[call] onConnectionEstablished fired");
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
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      void (async () => {
        try {
          const currentState = await App.getState();
          if (!appStateCancelled) {
            socket.emit("app:state", { foreground: currentState.isActive });
          }
          const listener = await App.addListener("appStateChange", (state: AppState) => {
            socket.emit("app:state", { foreground: state.isActive });
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
    }

    const syncAfterSocketResume = () => {
      void loadRef.current();
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
      (payload: { chatId: string; callerId: string; calleeId: string; callType?: string; expiresAt?: string }) => {
        console.log("[call:ringing] received", payload, "selfId=", currentUser?.id);
        const selfUserId = currentUser?.id ?? null;
        const isCaller = selfUserId !== null && payload.callerId === selfUserId;
        const incomingCallType: "audio" | "video" = payload.callType === "video" ? "video" : "audio";
        setCallType(incomingCallType);
        setActiveCallChatId(payload.chatId);
        // Sync ref immediately so call:accepted guard sees the chatId before React re-renders
        activeCallChatIdRef.current = payload.chatId;
        setCallPeerUserId(isCaller ? payload.calleeId : payload.callerId);
        if (isCaller) {
          setCallPhase("outgoing");
          stopIncomingRingtone();
        } else {
          setCallPhase("incoming");
          setCallNotice(incomingCallType === "video" ? "Incoming video call" : "Incoming audio call");
          startIncomingRingtone();
        }
      }
    );

    socket.on("call:accepted", (payload: { chatId: string; callerId: string; calleeId: string; callType?: string }) => {
      console.log("[call:accepted] chatId=", payload.chatId, "ref=", activeCallChatIdRef.current, "currentUser=", currentUser?.id);
      if (!currentUser || payload.chatId !== activeCallChatIdRef.current) {
        console.warn("[call:accepted] GUARD FAILED — bailing. currentUser=", !!currentUser, "chatMatch=", payload.chatId === activeCallChatIdRef.current);
        return;
      }
      stopIncomingRingtone();
      const peerId = payload.callerId === currentUser.id ? payload.calleeId : payload.callerId;
      const acceptedCallType: "audio" | "video" = payload.callType === "video" ? "video" : "audio";
      setCallPeerUserId(peerId);
      setCallType(acceptedCallType);
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
            await resetCallState("Camera/mic permission or device failed", true);
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

    socket.on("call:declined", () => {
      stopIncomingRingtone();
      // Server already ended the session — pass serverAlreadyNotified=true so
      // cleanup() does not send a redundant call:end that would produce a
      // spurious call:error toast.
      void resetCallState("Call declined", true);
    });
    socket.on("call:canceled", () => {
      stopIncomingRingtone();
      void resetCallState("Call canceled", true);
    });
    socket.on("call:timeout", () => {
      stopIncomingRingtone();
      void resetCallState("Missed call", true);
    });
    socket.on("call:ended", () => {
      console.log("[call:ended] received");
      stopIncomingRingtone();
      void resetCallState("Call ended", true);
    });
    socket.on("call:error", (payload: { message?: string }) => {
      const message = payload.message ?? "Call failed";
      console.error("[call:error] received:", payload);
      stopIncomingRingtone();
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
      socket.off("connect", syncAfterSocketResume);
      socket.off("connect_error", syncAfterSocketResume);
      socket.io.off("reconnect", syncAfterSocketResume);
      socket.off("sync:needed", syncAfterSocketResume);
      stopIncomingRingtone();
      void audioController.cleanup().catch(() => undefined);
      audioCallRef.current = null;
      socket.disconnect();
      socketRef.current = null;
      if (saveAudioSettingsTimerRef.current !== null) {
        window.clearTimeout(saveAudioSettingsTimerRef.current);
      }
    };
  }, [accessToken, applyMessagesForChat, currentUser?.id, startIncomingRingtone, stopIncomingRingtone]);

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
      stopIncomingRingtone();
    }
  }, [callAudioSettings.soundDisabled, stopIncomingRingtone]);

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

  async function resetCallState(notice?: string, serverAlreadyNotified = false) {
    console.log("[resetCallState] notice=", notice, "serverAlreadyNotified=", serverAlreadyNotified, new Error().stack?.split("\n").slice(1, 4).join(" | "));
    dismissNativeCallNotification();
    stopIncomingRingtone();
    await audioCallRef.current?.cleanup(serverAlreadyNotified);
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
    if (!selectedChat || selectedChat.type !== "direct" || !currentUser) {
      return;
    }
    const socket = socketRef.current;
    if (!socket) {
      setError("Realtime is not connected yet. Please wait a moment and try again.");
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
    setCallType(type);
    if (type === "audio") {
      void applyCallAudioPatch({ cameraEnabled: false, speakerMode: "small" });
    }
    setCallPhase("outgoing");
    setActiveCallChatId(selectedChat.id);
    setCallPeerUserId(peer.id);
    setCallPeerDisplayName(peer.displayName ?? null);
    // Update ref synchronously so call:accepted handler sees it before next render
    activeCallChatIdRef.current = selectedChat.id;
    // Pre-acquire media NOW while we are still inside the user gesture (button click).
    // On iOS Safari, getUserMedia fails when called from an async socket callback
    // (not a user gesture). prepareForCall stores the stream so that startOutgoing's
    // ensurePeer() can reuse it without needing a new user gesture.
    try { await audioCallRef.current?.prepareForCall(type); } catch { /* handled by startOutgoing */ }
    socket.emit("call:start", { chatId: selectedChat.id, callType: type });
  }

  async function acceptIncomingCall() {
    if (!socketRef.current || !activeCallChatId || !callPeerUserId) {
      return;
    }
    dismissNativeCallNotification();
    setCallNotice(null);
    setCallPhase("connecting");
    stopIncomingRingtone();
    if (callType === "audio") {
      await applyCallAudioPatch({ cameraEnabled: false, speakerMode: "small" });
    }
    socketRef.current.emit("call:accept", { chatId: activeCallChatId });
    try {
      await audioCallRef.current?.acceptIncoming(activeCallChatId, callPeerUserId, callType);
    } catch (err) {
      if (socketRef.current?.connected) socketRef.current.emit("call:end", { chatId: activeCallChatId });
      // We already emitted call:end above; cleanup should not re-emit.
      await resetCallState("Camera/mic permission or device failed", true);
      setError(err instanceof Error ? err.message : "Could not join call");
    }
  }

  function declineIncomingCall() {
    const chatId = activeCallChatId ?? activeCallChatIdRef.current;
    if (!socketRef.current || !chatId) {
      return;
    }
    stopIncomingRingtone();
    socketRef.current.emit("call:decline", { chatId });
    // Reset local state immediately (optimistic) — don't wait for the server
    // round-trip.  The server will still send call:declined to the caller which
    // triggers their own reset.  Passing serverAlreadyNotified=true prevents
    // cleanup() from emitting a duplicate call:end.
    void resetCallState("Call declined", true);
  }

  async function endActiveCall() {
    if (!socketRef.current || !activeCallChatId) {
      return;
    }
    const endingChatId = activeCallChatId;
    setCallNotice("Ending call...");
    stopIncomingRingtone();
    socketRef.current.emit("call:end", { chatId: activeCallChatId });
    // serverAlreadyNotified=true: we just sent call:end above, cleanup should
    // not send it again or the server will return a spurious call:error.
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
                    <ChevronLeft aria-hidden="true" size={20} />
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
                      <>
                        <button
                          type="button"
                          className="icon-button subtle"
                          aria-label="Audio call"
                          title="Audio call"
                          onClick={() => void startDirectCall("audio")}
                          disabled={callPhase !== "idle" && activeCallChatId === selectedChat.id}
                        >
                          <Phone aria-hidden="true" size={19} />
                        </button>
                        <button
                          type="button"
                          className="icon-button subtle"
                          aria-label="Video call"
                          title="Video call"
                          onClick={() => void startDirectCall("video")}
                          disabled={callPhase !== "idle" && activeCallChatId === selectedChat.id}
                        >
                          <Video aria-hidden="true" size={19} />
                        </button>
                      </>
                    )}
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
            ].filter(Boolean).join(" ")}
            role="dialog"
            aria-modal="false"
            onClick={isCallMinimized && isMobileViewport ? () => setIsCallMinimized(false) : undefined}
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
            {!(isMobileViewport && !isCallMinimized && callPhase === "incoming") && (
            <div className="call-popup-header">
              {isCallMinimized && isMobileViewport ? (
                // Mobile minimized bar: [mic] [pulse · name · timer] [end-call]
                // Tap the name/timer area (or anywhere outside the buttons) to restore.
                <>
                  {/* Mic toggle */}
                  <button
                    type="button"
                    style={{
                      background: callAudioSettings.micMuted ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.12)',
                      border: 'none', borderRadius: '50%',
                      width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: '#fff', flexShrink: 0,
                    }}
                    aria-label={callAudioSettings.micMuted ? "Unmute microphone" : "Mute microphone"}
                    onClick={(e) => { e.stopPropagation(); void applyCallAudioPatch({ micMuted: !callAudioSettings.micMuted }); }}
                  >
                    {callAudioSettings.micMuted ? <MicOff size={15} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}
                  </button>

                  {/* Name + timer — tap to expand */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
                    <div className="mobile-call-bar-pulse" />
                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(callPeerDisplayName ?? activeCallPeerName) ?? "Call"}
                      {callPhase === "in-call" ? ` · ${callTimer}` : callPhase === "outgoing" ? " · Calling…" : " · Connecting…"}
                    </span>
                  </div>

                  {/* End call */}
                  <button
                    type="button"
                    style={{
                      background: '#ff3b30', border: 'none', borderRadius: '50%',
                      width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: '#fff', flexShrink: 0,
                    }}
                    aria-label="End call"
                    onClick={(e) => { e.stopPropagation(); void endActiveCall(); }}
                  >
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'rotate(135deg)' }}>
                      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
                    </svg>
                  </button>
                </>
              ) : (
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
              )}
              <div className="call-popup-header-actions">
                {callPhase !== "incoming" && !(isCallMinimized && isMobileViewport) && (
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
