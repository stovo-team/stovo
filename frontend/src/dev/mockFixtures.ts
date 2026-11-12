import type { User } from "../api/auth";
import type { Chat, ChatMember, Message, MessageHistoryPage, PinnedMessage } from "../api/chats";
import type { Family } from "../api/family";
import type { ServerManifest } from "../config/profileManifest";
import {
  DEMO_FAMILY_ID,
  DEMO_USER_ID,
  demoAlex,
  demoMaya,
  demoOwner,
  demoSam,
  demoUsers,
} from "./mockUsers";

export { DEMO_FAMILY_ID, DEMO_USER_ID, demoUser } from "./mockUsers";

export const MOCK_ORIGIN = "http://127.0.0.1:5174";
export const PLANNING_CHAT_ID = "chat-planning-team";
export const PLANNING_KICKOFF_MESSAGE_ID = "msg-planning-kickoff";
const chatMember = ({ id, username, displayName, role, publicKey, profilePhoto, email, bio, timezone, lastSeenAt, lastSeenVisibility }: User): ChatMember => ({
  id,
  username,
  displayName,
  role,
  publicKey,
  profilePhoto,
  email,
  bio,
  timezone,
  isOnline: id === demoAlex.id,
  lastSeenAt,
  lastSeenVisibility,
});

const allMembers = demoUsers.map(chatMember);
const planningMembers = [demoOwner, demoAlex, demoMaya, demoSam].map(chatMember);
const directMembers = [demoOwner, demoAlex].map(chatMember);
const channelMembers = [demoOwner, demoMaya, demoSam].map(chatMember);

const family: Family = {
  id: DEMO_FAMILY_ID,
  name: "Stovo Demo",
  storageLimitMb: 10240,
  minimizedChatLayout: false,
  defaultMessageEncryptionProtocol: "server_at_rest",
  defaultProfileVisibility: "everyone",
  defaultLastSeenVisibility: "everyone",
  defaultReadReceiptsEnabled: true,
  defaultNotificationSettings: "{}",
  translationEnabled: false,
  callRecordingEnabled: false,
  aiNotesEnabled: false,
  voiceTranscriptionEnabled: false,
  screenShareBitrateKbps: 2500,
  cameraBitrateKbps: 1800,
  groupCallScreenShareBitrateKbps: 2000,
  groupCallCameraBitrateKbps: 1500,
  dmCallScreenShareBitrateKbps: 2500,
  dmCallCameraBitrateKbps: 1800,
  navTabs: { chats: true, storage: true, plans: true, settings: true },
};

const chat = (options: {
  id: string;
  type: Chat["type"];
  title: string | null;
  members: ChatMember[];
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
  lastMessageId: string;
  lastMessageSenderId: string;
  lastMessageSenderDisplayName: string;
  lastMessageContent: string;
  isPinned?: boolean;
  isFavorite?: boolean;
}): Chat => ({
  id: options.id,
  familyId: DEMO_FAMILY_ID,
  type: options.type,
  title: options.title,
  description: null,
  createdBy: DEMO_USER_ID,
  mediaVisibility: "members",
  commentsEnabled: true,
  encryptionProtocol: "legacy_plaintext",
  mediaVisibilityPendingApproval: false,
  mediaVisibilityApprovalCount: 0,
  mediaVisibilityApprovalRequired: 0,
  myMediaVisibilityApproval: false,
  chatPhoto: null,
  createdAt: options.createdAt,
  updatedAt: options.updatedAt,
  members: options.members,
  unreadCount: options.unreadCount,
  lastMessageId: options.lastMessageId,
  lastMessageSenderId: options.lastMessageSenderId,
  lastMessageSenderDisplayName: options.lastMessageSenderDisplayName,
  lastMessageContent: options.lastMessageContent,
  lastMessageType: "text",
  lastMessageCreatedAt: options.updatedAt,
  isMuted: false,
  mutedUntil: null,
  quietHoursEnabled: false,
  quietHoursStart: null,
  quietHoursEnd: null,
  notificationMode: "all",
  notifySenderIds: [],
  alwaysNotifyMentions: true,
  isPinned: options.isPinned ?? false,
  isFavorite: options.isFavorite ?? false,
  wallpaper: null,
  pinPermission: "everyone",
  messageDelaySeconds: 0,
  activeCall: null,
});

const chats: Chat[] = [
  chat({
    id: PLANNING_CHAT_ID,
    type: "group",
    title: "Planning Team",
    members: planningMembers,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-09T08:30:00.000Z",
    unreadCount: 2,
    lastMessageId: "msg-planning-follow-up",
    lastMessageSenderId: demoMaya.id,
    lastMessageSenderDisplayName: demoMaya.displayName,
    lastMessageContent: "Can we review the final checklist today?",
    isPinned: true,
  }),
  chat({
    id: "chat-direct-alex",
    type: "direct",
    title: null,
    members: directMembers,
    createdAt: "2026-10-02T11:00:00.000Z",
    updatedAt: "2026-10-09T07:55:00.000Z",
    unreadCount: 0,
    lastMessageId: "msg-direct-alex",
    lastMessageSenderId: demoOwner.id,
    lastMessageSenderDisplayName: demoOwner.displayName,
    lastMessageContent: "Thanks, I have the notes.",
  }),
  chat({
    id: "chat-announcements",
    type: "channel",
    title: "Announcements",
    members: channelMembers,
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-08T16:30:00.000Z",
    unreadCount: 1,
    lastMessageId: "msg-announcement-release",
    lastMessageSenderId: demoSam.id,
    lastMessageSenderDisplayName: demoSam.displayName,
    lastMessageContent: "The release notes are ready for a quick read.",
  }),

];

function message(options: {
  id: string;
  chatId: string;
  senderId: string;
  senderDisplayName: string;
  content: string;
  createdAt: string;
  statuses?: Message["statuses"];
  reactions?: Message["reactions"];
}): Message {
  return {
    id: options.id,
    chatId: options.chatId,
    senderId: options.senderId,
    senderDisplayName: options.senderDisplayName,
    type: "text",
    content: options.content,
    encryptionProtocol: "legacy_plaintext",
    ciphertext: null,
    nonce: null,
    keyVersion: null,
    encryptionMetadata: null,
    replyToMessageId: null,
    threadRootMessageId: null,
    messageKind: "chat",
    createdAt: options.createdAt,
    updatedAt: options.createdAt,
    deletedAt: null,
    isEdited: false,
    forwardedFrom: null,
    statuses: options.statuses ?? [{ userId: options.senderId, status: "sent", createdAt: options.createdAt }],
    reactions: options.reactions ?? [],
    attachments: [],
  };
}

const messages: Record<string, Message[]> = {
  [PLANNING_CHAT_ID]: [
    message({
      id: PLANNING_KICKOFF_MESSAGE_ID,
      chatId: PLANNING_CHAT_ID,
      senderId: demoAlex.id,
      senderDisplayName: demoAlex.displayName,
      content: "Kickoff notes are ready for review.",
      createdAt: "2026-10-08T08:10:00.000Z",
      statuses: [
        { userId: demoAlex.id, status: "sent", createdAt: "2026-10-08T08:10:00.000Z" },
        { userId: demoOwner.id, status: "read", createdAt: "2026-10-08T08:15:00.000Z" },
      ],
      reactions: [{ emoji: "👍", count: 4, userIds: [demoOwner.id, demoMaya.id, demoAlex.id, demoSam.id], reacted: true }],
    }),
    message({
      id: "msg-planning-owner-reply",
      chatId: PLANNING_CHAT_ID,
      senderId: demoOwner.id,
      senderDisplayName: demoOwner.displayName,
      content: "I will review it before lunch.",
      createdAt: "2026-10-08T08:18:00.000Z",
      statuses: [{ userId: demoOwner.id, status: "read", createdAt: "2026-10-08T08:18:00.000Z" }],
    }),
    message({
      id: "msg-planning-follow-up",
      chatId: PLANNING_CHAT_ID,
      senderId: demoMaya.id,
      senderDisplayName: demoMaya.displayName,
      content: "Can we review the final checklist today?",
      createdAt: "2026-10-09T08:30:00.000Z",
      statuses: [
        { userId: demoMaya.id, status: "sent", createdAt: "2026-10-09T08:30:00.000Z" },
        { userId: demoOwner.id, status: "delivered", createdAt: "2026-10-09T08:30:05.000Z" },
      ],
    }),
  ],
  "chat-direct-alex": [
    message({
      id: "msg-direct-alex",
      chatId: "chat-direct-alex",
      senderId: demoOwner.id,
      senderDisplayName: demoOwner.displayName,
      content: "Thanks, I have the notes.",
      createdAt: "2026-10-09T07:55:00.000Z",
    }),
  ],
  "chat-announcements": [
    message({
      id: "msg-announcement-release",
      chatId: "chat-announcements",
      senderId: demoSam.id,
      senderDisplayName: demoSam.displayName,
      content: "The release notes are ready for a quick read.",
      createdAt: "2026-10-08T16:30:00.000Z",
    }),
  ],

};

const pins: Record<string, PinnedMessage[]> = {
  [PLANNING_CHAT_ID]: [{
    chatId: PLANNING_CHAT_ID,
    messageId: PLANNING_KICKOFF_MESSAGE_ID,
    pinnedBy: demoOwner.id,
    pinnedAt: "2026-10-08T08:20:00.000Z",
    message: messages[PLANNING_CHAT_ID][0],
  }],
};

const manifest: ServerManifest = {
  profile: "family",
  display_name: "Stovo Demo",
  screens: {
    chats: true,
    media_gallery: true,
    voice_rooms: true,
    game_activity: false,
    audit_logs: false,
    member_invites: true,
    sso_management: false,
  },
  features: {
    presence_detail_level: "basic",
    end_to_end_encryption: true,
    custom_emojis: true,
    file_upload_limit_mb: 100,
    default_theme: "family_warm",
    allow_public_invites: true,
    require_sso_auth: false,
  },
  active_plugins: ["plugin-theme-packs"],
};

export interface MockData {
  family: Family;
  users: User[];
  chats: Chat[];
  messages: Record<string, Message[]>;
  pins: Record<string, PinnedMessage[]>;
}

const fixtureData = {
  family,
  users: demoUsers,
  chats,
  messages,
  pins,
  manifest,
} as const;

export function createMockData(): MockData {
  return structuredClone(fixtureData) as unknown as MockData;
}

export function createMockManifest(): ServerManifest {
  return structuredClone(fixtureData.manifest);
}

export async function addMobileLayoutMessages(
  response: Promise<Response>,
  scenario: "mobile-layout-canvas" | "mobile-layout-meetup",
  currentUserId: string,
  users: User[],
): Promise<MessageHistoryPage> {
  const page = await (await response).json() as MessageHistoryPage;
  const otherUser = users.find((user) => user.id !== currentUserId) ?? users[0];
  const message = (id: string, senderId: string, type: Message["type"], content: string | null, createdAt: string): Message => ({
    id,
    chatId: "chat-planning-team",
    senderId,
    senderDisplayName: users.find((user) => user.id === senderId)?.displayName ?? "Stovo Demo",
    type,
    content,
    encryptionProtocol: "legacy_plaintext",
    ciphertext: null,
    nonce: null,
    keyVersion: null,
    encryptionMetadata: null,
    replyToMessageId: null,
    threadRootMessageId: null,
    messageKind: "chat",
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    isEdited: false,
    forwardedFrom: null,
    statuses: [],
    reactions: [],
    attachments: [],
    ...(type === "canvas" ? { canvas: { id: "canvas-planning-notes", title: "Untitled canvas", available: true } } : {}),
  });
  const meetingText = 'guest-meeting-card:{"title":"Meetup","timing":"Starts when the host opens the meeting.","entry":"Anyone with this link can join.","url":"http://127.0.0.1:5174/meet/mock"}';
  const messages = scenario === "mobile-layout-canvas"
    ? [message("visual-canvas-card", currentUserId, "canvas", null, "2026-10-18T09:00:00.000Z")]
    : [
      message("visual-meetup-incoming", otherUser.id, "text", meetingText.replace("Meetup", "Some meetup"), "2026-10-18T09:00:00.000Z"),
      message("visual-meetup-outgoing", currentUserId, "text", meetingText, "2026-10-18T09:05:00.000Z"),
    ];
  return { ...page, messages: [...page.messages, ...messages] };
}

export function createMockIntelligenceConsentOffer(query: URLSearchParams) {
  return {
    client_id: query.get("client_id") ?? "intelligence-client",
    redirect_uri: query.get("redirect_uri") ?? "https://intelligence.example/callback",
    state: query.get("state") ?? "local-mock-state",
    chats: [
      { id: "archive-a-001", title: "Message Archive", type: "archive" },
      { id: "archive-b-002", title: "Message Archive", type: "archive" },
    ],
    grants: { read: false, process: false, external_transfer: false, export: false, codex: false, reply: false },
  };
}
