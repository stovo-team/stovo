export const CHAT_ARCHIVE_LIMITS = Object.freeze({
  maxMessages: 50_000,
  maxParticipants: 10_000,
  maxAttachments: 10_000,
  maxAttachmentBytes: 50 * 1024 * 1024,
  maxTotalAttachmentBytes: 100 * 1024 * 1024
});

export type ChatProviderId = "stovo" | "telegram" | "whatsapp" | "slack" | "mattermost" | "rocketchat";

export type ChatArchiveSource = {
  providerId: ChatProviderId;
  profileId: string;
};

export type ChatArchiveParticipant = {
  sourceId: string;
  displayName: string;
  attributes?: Record<string, string>;
};

export type ChatArchiveReaction = {
  emoji: string;
  participantIds?: string[];
};

export type ChatArchiveMessage = {
  sourceId: string;
  authorId: string;
  timestamp: string;
  kind: string;
  text?: string;
  replyToSourceId?: string;
  threadRootSourceId?: string;
  attachmentIds?: string[];
  reactions?: ChatArchiveReaction[];
  isEdited?: boolean;
  deletedAt?: string;
  metadata?: Record<string, unknown>;
};

export type ChatArchiveAttachment = {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  size: number;
  checksum?: string;
  bytes?: Uint8Array;
  externalUrl?: string;
};

export type ChatArchiveWarning = {
  code: string;
  message: string;
};

export type ChatArchive = {
  schemaVersion: 1;
  source: ChatArchiveSource;
  exportedAt?: string;
  conversation: {
    sourceId?: string;
    title: string;
    metadata?: Record<string, unknown>;
  };
  participants: ChatArchiveParticipant[];
  messages: ChatArchiveMessage[];
  attachments: ChatArchiveAttachment[];
  warnings: ChatArchiveWarning[];
};

export type ArchiveValidationCode =
  | "invalid_archive"
  | "unsupported_schema_version"
  | "unsupported_provider"
  | "unsupported_profile"
  | "conversation_required"
  | "multiple_conversations"
  | "too_many_participants"
  | "too_many_messages"
  | "too_many_attachments"
  | "duplicate_participant_id"
  | "duplicate_message_id"
  | "duplicate_attachment_id"
  | "invalid_timestamp"
  | "messages_not_chronological"
  | "unknown_author"
  | "unknown_reply_target"
  | "unsafe_attachment_path"
  | "invalid_attachment"
  | "attachment_too_large"
  | "archive_attachments_too_large"
  | "unknown_attachment"
  | "invalid_warning";

export class ChatArchiveValidationError extends Error {
  readonly code: ArchiveValidationCode;

  constructor(code: ArchiveValidationCode, message: string) {
    super(message);
    this.name = "ChatArchiveValidationError";
    this.code = code;
  }
}

const supportedProfiles: Record<ChatProviderId, ReadonlySet<string>> = {
  stovo: new Set(["stovo-chat-archive-v1"]),
  telegram: new Set(["telegram-desktop-json"]),
  whatsapp: new Set(["whatsapp-chat-txt"]),
  slack: new Set(["slack-channel-zip", "slack-channel-json"]),
  mattermost: new Set(["mattermost-channel-csv"]),
  rocketchat: new Set(["rocketchat-room-json"])
};

function fail(code: ArchiveValidationCode, message: string): never {
  throw new ChatArchiveValidationError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseTimestamp(value: unknown, field: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    return fail("invalid_timestamp", `${field} must be an ISO-8601 timestamp with a timezone`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return fail("invalid_timestamp", `${field} is not a valid timestamp`);
  }
  return parsed;
}

function assertObjectArray(value: unknown, field: string): asserts value is Record<string, unknown>[] {
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
    fail("invalid_archive", `${field} must be an array of objects`);
  }
}

function isSafeRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/") || value.includes("\\") || /^[a-z]:/i.test(value)) {
    return false;
  }
  return value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

export function validateArchive(input: unknown): ChatArchive {
  if (!isRecord(input)) {
    return fail("invalid_archive", "Chat archive must be an object");
  }
  if (input.schemaVersion !== 1) {
    return fail("unsupported_schema_version", "Only ChatArchive schema version 1 is supported");
  }
  if (Array.isArray(input.conversations) && input.conversations.length > 1) {
    return fail("multiple_conversations", "V1 imports exactly one conversation per archive");
  }

  const source = input.source;
  if (!isRecord(source) || !isNonEmptyString(source.providerId) || !isNonEmptyString(source.profileId)) {
    return fail("unsupported_provider", "Archive source must name a supported provider and profile");
  }
  if (!(source.providerId in supportedProfiles)) {
    return fail("unsupported_provider", `Unsupported archive provider: ${source.providerId}`);
  }
  const providerId = source.providerId as ChatProviderId;
  if (!supportedProfiles[providerId].has(source.profileId)) {
    return fail("unsupported_profile", `Unsupported ${providerId} archive profile: ${source.profileId}`);
  }

  const conversation = input.conversation;
  if (!isRecord(conversation) || !isNonEmptyString(conversation.title) || !isNonEmptyString(conversation.sourceId)) {
    return fail("conversation_required", "Archive must contain one conversation with a source ID and title");
  }
  if (input.exportedAt !== undefined) parseTimestamp(input.exportedAt, "exportedAt");

  assertObjectArray(input.participants, "participants");
  assertObjectArray(input.messages, "messages");
  assertObjectArray(input.attachments, "attachments");
  if (!Array.isArray(input.warnings)) {
    return fail("invalid_warning", "warnings must be an array");
  }
  if (input.participants.length > CHAT_ARCHIVE_LIMITS.maxParticipants) {
    return fail("too_many_participants", "Archive exceeds the participant limit");
  }
  if (input.messages.length > CHAT_ARCHIVE_LIMITS.maxMessages) {
    return fail("too_many_messages", "Archive exceeds the message limit");
  }
  if (input.attachments.length > CHAT_ARCHIVE_LIMITS.maxAttachments) {
    return fail("too_many_attachments", "Archive exceeds the attachment count limit");
  }

  const participantIds = new Set<string>();
  for (const participant of input.participants) {
    if (!isNonEmptyString(participant.sourceId) || !isNonEmptyString(participant.displayName)) {
      return fail("invalid_archive", "Each participant needs a source ID and display name");
    }
    if (participantIds.has(participant.sourceId)) {
      return fail("duplicate_participant_id", `Duplicate participant source ID: ${participant.sourceId}`);
    }
    participantIds.add(participant.sourceId);
  }

  const messageIds = new Set<string>();
  const timestamps: number[] = [];
  const attachmentReferences = new Set<string>();
  for (const message of input.messages) {
    if (!isNonEmptyString(message.sourceId) || !isNonEmptyString(message.authorId) || !isNonEmptyString(message.kind)) {
      return fail("invalid_archive", "Each message needs a source ID, author ID, and kind");
    }
    if (messageIds.has(message.sourceId)) {
      return fail("duplicate_message_id", `Duplicate message source ID: ${message.sourceId}`);
    }
    if (!participantIds.has(message.authorId)) {
      return fail("unknown_author", `Message author ${message.authorId} is not in participants`);
    }
    messageIds.add(message.sourceId);
    timestamps.push(parseTimestamp(message.timestamp, `Message ${message.sourceId} timestamp`));
    if (message.deletedAt !== undefined) parseTimestamp(message.deletedAt, `Message ${message.sourceId} deletedAt`);
    if (message.text !== undefined && typeof message.text !== "string") {
      return fail("invalid_archive", `Message ${message.sourceId} text must be a string`);
    }
    if (message.attachmentIds !== undefined) {
      if (!Array.isArray(message.attachmentIds) || message.attachmentIds.some((id) => !isNonEmptyString(id))) {
        return fail("invalid_archive", `Message ${message.sourceId} attachmentIds must be non-empty strings`);
      }
      for (const id of message.attachmentIds) attachmentReferences.add(id);
    }
  }
  for (let index = 1; index < timestamps.length; index += 1) {
    if (timestamps[index] < timestamps[index - 1]) {
      return fail("messages_not_chronological", "Messages must be ordered by ascending timestamp");
    }
  }
  for (const message of input.messages) {
    for (const replyId of [message.replyToSourceId, message.threadRootSourceId]) {
      if (replyId !== undefined && (!isNonEmptyString(replyId) || !messageIds.has(replyId))) {
        return fail("unknown_reply_target", `Message ${message.sourceId} references an unknown reply target`);
      }
    }
  }

  const attachmentIds = new Set<string>();
  let totalAttachmentBytes = 0;
  for (const attachment of input.attachments) {
    if (!isNonEmptyString(attachment.id) || !isSafeRelativePath(attachment.path) || !isNonEmptyString(attachment.filename) || !isNonEmptyString(attachment.mimeType)) {
      return fail("unsafe_attachment_path", "Attachment metadata contains an unsafe path or missing identity");
    }
    if (attachmentIds.has(attachment.id)) {
      return fail("duplicate_attachment_id", `Duplicate attachment ID: ${attachment.id}`);
    }
    if (typeof attachment.size !== "number" || !Number.isSafeInteger(attachment.size) || attachment.size < 0) {
      return fail("invalid_attachment", `Attachment ${attachment.id} has an invalid size`);
    }
    if (attachment.size > CHAT_ARCHIVE_LIMITS.maxAttachmentBytes) {
      return fail("attachment_too_large", `Attachment ${attachment.id} exceeds the per-file size limit`);
    }
    if (attachment.bytes !== undefined && (!(attachment.bytes instanceof Uint8Array) || attachment.bytes.byteLength !== attachment.size)) {
      return fail("invalid_attachment", `Attachment ${attachment.id} bytes do not match its declared size`);
    }
    totalAttachmentBytes += attachment.size;
    if (totalAttachmentBytes > CHAT_ARCHIVE_LIMITS.maxTotalAttachmentBytes) {
      return fail("archive_attachments_too_large", "Archive exceeds the total attachment size limit");
    }
    attachmentIds.add(attachment.id);
  }
  for (const id of attachmentReferences) {
    if (!attachmentIds.has(id)) {
      return fail("unknown_attachment", `Message references unknown attachment ${id}`);
    }
  }

  for (const warning of input.warnings) {
    if (!isRecord(warning) || !isNonEmptyString(warning.code) || !isNonEmptyString(warning.message)) {
      return fail("invalid_warning", "Each warning needs a code and message");
    }
  }

  return input as unknown as ChatArchive;
}
