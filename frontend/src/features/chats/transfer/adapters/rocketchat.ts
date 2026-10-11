import { validateArchive, type ChatArchiveMessage } from "../archive";
import { adapterError, buildAttachment, decodeJson, emptyArchive, isRecord, parseTimestamp, textValue } from "./shared";
import { CHAT_ADAPTER_LIMITS } from "./types";

function roomTimestamp(value: unknown): string {
  if (typeof value === "number") return parseTimestamp(value, "Rocket.Chat");
  if (typeof value === "string") return parseTimestamp(value, "Rocket.Chat");
  if (isRecord(value) && typeof value.$date === "number") return parseTimestamp(value.$date / 1000, "Rocket.Chat");
  if (isRecord(value) && typeof value.$date === "string") return parseTimestamp(value.$date, "Rocket.Chat");
  return adapterError("invalid_source_timestamp", "Rocket.Chat message has no usable timestamp");
}

export async function parseRocketChatExport(bytes: Uint8Array) {
  const parsed = decodeJson(bytes, "Rocket.Chat room export");
  if (Array.isArray(parsed)) {
    const roomIds = new Set(parsed.filter(isRecord).map((message) => textValue(message.rid)).filter(Boolean));
    if (roomIds.size > 1) return adapterError("multiple_conversations", "Rocket.Chat JSON contains messages from multiple rooms");
    if (parsed.some((message) => !isRecord(message))) return adapterError("invalid_archive", "Rocket.Chat message entry is malformed");
    const roomId = [...roomIds][0];
    return parseRoom({ room: { _id: roomId, name: roomId ?? "Rocket.Chat room" }, messages: parsed }, bytes.byteLength);
  }
  if (!isRecord(parsed)) return adapterError("unrecognized_format", "Rocket.Chat export must contain one room and its messages");
  if (Array.isArray(parsed.rooms)) {
    if (parsed.rooms.length !== 1) {
      return adapterError(parsed.rooms.length > 1 ? "multiple_conversations" : "unrecognized_format", "V1 accepts exactly one Rocket.Chat room per file");
    }
    const first = parsed.rooms[0];
    if (!isRecord(first)) return adapterError("invalid_archive", "Rocket.Chat room entry is malformed");
    return parseRoom(first, bytes.byteLength);
  }
  return parseRoom(parsed, bytes.byteLength);
}

function parseRoom(input: Record<string, unknown>, inputBytes: number) {
  if (inputBytes > CHAT_ADAPTER_LIMITS.maxInputBytes) {
    return adapterError("archive_too_large", "Rocket.Chat room export exceeds the input size limit");
  }
  const room = isRecord(input.room) ? input.room : input;
  const messagesRaw = input.messages;
  if (!Array.isArray(messagesRaw)) return adapterError("unrecognized_format", "Rocket.Chat export has no room messages");
  if (messagesRaw.length > CHAT_ADAPTER_LIMITS.maxMessages) {
    return adapterError("message_limit_exceeded", "Rocket.Chat export exceeds the message count limit");
  }
  const roomId = textValue(room._id) ?? textValue(room.id);
  const roomName = textValue(room.name) ?? textValue(room.fname) ?? roomId ?? "Rocket.Chat room";
  const archive = emptyArchive("rocketchat", "rocketchat-room-json", roomName, roomId);
  const authors = new Map<string, string>();
  const messageIds = new Set(messagesRaw.filter(isRecord).map((message) => textValue(message._id) ?? textValue(message.id)).filter(Boolean));

  for (const [index, raw] of messagesRaw.entries()) {
    if (!isRecord(raw)) return adapterError("invalid_archive", "Rocket.Chat message entry is malformed");
    const sourceRoom = textValue(raw.rid);
    if (sourceRoom && roomId && sourceRoom !== roomId) {
      return adapterError("multiple_conversations", "Rocket.Chat message belongs to a different room");
    }
    const user = isRecord(raw.u) ? raw.u : {};
    const authorId = textValue(user._id) ?? textValue(user.id) ?? textValue(user.username) ?? "rocketchat-system";
    const displayName = textValue(user.name) ?? textValue(user.username) ?? "Rocket.Chat system";
    authors.set(authorId, displayName);
    const sourceId = textValue(raw._id) ?? textValue(raw.id) ?? `rocketchat-message-${index + 1}`;
    const attachmentIds: string[] = [];
    if (Array.isArray(raw.attachments)) {
      for (const [attachmentIndex, item] of raw.attachments.entries()) {
        if (!isRecord(item)) continue;
        const filename = textValue(item.title) ?? textValue(item.name) ?? `attachment-${attachmentIndex + 1}`;
        const id = `rocketchat-attachment-${sourceId}-${attachmentIndex + 1}`;
        const externalUrl = textValue(item.title_link) ?? textValue(item.image_url) ?? textValue(item.url);
        archive.attachments.push(buildAttachment({ id, filename, externalUrl }));
        attachmentIds.push(id);
        if (externalUrl) archive.warnings.push({ code: "attachment_link_only", message: `Rocket.Chat attachment ${filename} is available only as a link` });
      }
    }
    const timestamp = roomTimestamp(raw.ts ?? raw.createdAt);
    const message: ChatArchiveMessage = {
      sourceId,
      authorId,
      timestamp,
      kind: attachmentIds.length > 0 && !textValue(raw.msg) ? "file" : "text",
      text: textValue(raw.msg) ?? "",
      attachmentIds,
      metadata: {}
    };
    const replyId = textValue(raw.tmid) ?? textValue(raw.tmsg);
    if (replyId && messageIds.has(replyId)) message.replyToSourceId = replyId;
    else if (replyId) archive.warnings.push({ code: "reply_target_missing", message: `Rocket.Chat reply target ${replyId} was not included; the reply was flattened` });
    archive.messages.push(message);
  }
  archive.participants = [...authors].map(([sourceId, displayName]) => ({ sourceId, displayName }));
  archive.messages.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  return validateArchive(archive);
}
