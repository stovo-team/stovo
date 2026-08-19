import type { FamilyFile } from "../../../api/files";
import type { Chat, Message } from "../../../api/chats";

export type CallPhase = "idle" | "outgoing" | "incoming" | "connecting" | "in-call";

export type CallTrackStatus = {
  echoCancellation: boolean | null;
  noiseSuppression: boolean | null;
  autoGainControl: boolean | null;
};

export type ChatAvatarFallbackKind = "direct" | "group" | "channel" | "voice" | "family" | "archive";

export type NewChatScreen = "pick" | "group" | "channel" | "voice";
export type ChatFilter = "all" | "unread" | "groups" | "direct" | "channels" | "voice" | "muted";
export type ChatSectionKey = "archive" | "voice" | "channels" | "groups" | "dms";
export type SharedContentTab = "media" | "audio" | "files" | "links";
export type ChatInfoControl = "name" | "settings" | null;

export type NotificationActionCommand =
  | { type: "reply"; text: string }
  | { type: "callback" }
  | { type: "discard" };

export type SwipeReplyState = {
  messageId: string;
  offset: number;
  activated: boolean;
};

export type SwipeReplyGestureState = {
  messageId: string;
  pointerId: number;
  startX: number;
  startY: number;
  lastOffset: number;
  lock: "pending" | "horizontal";
};

export type MessageLongPressState = {
  messageId: string;
  pointerId: number;
  startX: number;
  startY: number;
  timerId: number;
};

export type ChatExitSwipeState = {
  pointerId: number;
  startX: number;
  startY: number;
  lock: "pending" | "horizontal" | "vertical";
  committed: boolean;
};

export type PendingMessageFocus = {
  messageId: string;
  highlightClassName: "message-pin-flash" | "message-context-flash" | "message-audio-context-flash";
  lockPinTracking?: boolean;
};

export type SharedContentItem =
  | { kind: "attachment"; file: FamilyFile; messageId: string }
  | { kind: "link"; url: string; messageId: string };

export type MessageStatusValue = Message["statuses"][number]["status"];
export type MessageStateUpdate = Message[] | ((current: Message[]) => Message[]);

export interface SendMessageErrorAck {
  ok: false;
  clientMessageId?: string;
  message?: string;
}

export type PendingLocalAttachment = {
  localId: string;
  file: File;
  previewUrl: string | null;
};

export type { Chat, Message, FamilyFile };
