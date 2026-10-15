import { validateArchive, type ChatArchive, type ChatArchiveMessage } from "../archive";
import {
  adapterError,
  buildAttachment,
  decodeJson,
  emptyArchive,
  flattenRichText,
  isRecord,
  parseTimestamp,
  textValue
} from "./shared";
import { CHAT_ADAPTER_LIMITS } from "./types";

function participantId(message: Record<string, unknown>): string {
  return textValue(message.from_id) ?? textValue(message.actor_id) ?? textValue(message.from) ?? "telegram-system";
}

function telegramTimestamp(message: Record<string, unknown>): string {
  const epoch = textValue(message.date_unixtime);
  if (epoch && /^\d+(?:\.\d+)?$/.test(epoch)) return parseTimestamp(Number(epoch), "Telegram Desktop");
  return parseTimestamp(message.date, "Telegram Desktop");
}

function mediaValue(message: Record<string, unknown>): string | undefined {
  for (const key of ["photo", "file", "video_file", "audio_file", "voice_message", "sticker_emoji"]) {
    const value = textValue(message[key]);
    if (value) return value;
  }
  return undefined;
}

export async function parseTelegramExport(bytes: Uint8Array): Promise<ChatArchive> {
  const parsed = decodeJson(bytes, "Telegram Desktop export");
  if (!isRecord(parsed)) return adapterError("unrecognized_format", "Telegram export must contain one chat object");

  let chat = parsed;
  const allChats = isRecord(parsed.chats) && Array.isArray(parsed.chats.list) ? parsed.chats.list : null;
  if (allChats) {
    if (allChats.length !== 1) {
      return adapterError(allChats.length > 1 ? "multiple_conversations" : "unrecognized_format", "V1 accepts exactly one Telegram chat per file");
    }
    if (!isRecord(allChats[0])) return adapterError("unrecognized_format", "Telegram chat entry is malformed");
    chat = allChats[0];
  }
  if (!Array.isArray(chat.messages) || !textValue(chat.type)) {
    return adapterError("unrecognized_format", "File is not a Telegram Desktop single-chat JSON export");
  }
  if (chat.messages.length > CHAT_ADAPTER_LIMITS.maxMessages) {
    return adapterError("message_limit_exceeded", "Telegram export exceeds the message count limit");
  }

  const archive = emptyArchive(
    "telegram",
    "telegram-desktop-json",
    textValue(chat.name) ?? "Telegram chat",
    textValue(chat.id)
  );
  const authors = new Map<string, string>();
  const messages: ChatArchiveMessage[] = [];
  const seenAttachments = new Map<string, string>();

  for (const [index, raw] of chat.messages.entries()) {
    if (!isRecord(raw)) continue;
    if (raw.type !== "message" && raw.type !== "service") continue;
    const authorId = participantId(raw);
    const displayName = textValue(raw.from) ?? textValue(raw.actor) ?? "Telegram service";
    authors.set(authorId, displayName);

    const attachmentIds: string[] = [];
    const media = mediaValue(raw);
    if (media) {
      const id = `telegram-attachment-${textValue(raw.id) ?? index}`;
      const filename = media.split(/[\\/]/).pop() || `telegram-${index}`;
      seenAttachments.set(id, filename);
      attachmentIds.push(id);
    }
    const text = flattenRichText(raw.text) || textValue(raw.action) || "";
    const id = textValue(raw.id) ?? `telegram-message-${index}`;
    messages.push({
      sourceId: id,
      authorId,
      timestamp: telegramTimestamp(raw),
      kind: media ? "file" : raw.type === "service" ? "system" : "text",
      text,
      ...(raw.reply_to_message_id !== undefined ? { replyToSourceId: String(raw.reply_to_message_id) } : {}),
      attachmentIds,
      isEdited: Boolean(raw.edited),
      metadata: {}
    });
  }

  messages.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  if (messages.length > CHAT_ADAPTER_LIMITS.maxMessages) {
    return adapterError("message_limit_exceeded", "Telegram export exceeds the message count limit");
  }
  archive.participants = [...authors].map(([sourceId, displayName]) => ({ sourceId, displayName }));
  archive.messages = messages;
  for (const [id, filename] of seenAttachments) {
    archive.attachments.push(buildAttachment({ id, filename }));
    archive.warnings.push({ code: "attachment_bytes_missing", message: `Telegram media file ${filename} was not included with the JSON file` });
  }
  return validateArchive(archive);
}
