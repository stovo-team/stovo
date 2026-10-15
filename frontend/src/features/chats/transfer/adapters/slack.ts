import JSZip from "jszip";

import { validateArchive, type ChatArchive, type ChatArchiveMessage } from "../archive";
import { adapterError, emptyArchive, isRecord, parseTimestamp, textValue } from "./shared";
import { CHAT_ADAPTER_LIMITS, ChatTransferAdapterError } from "./types";

export const SLACK_IMPORT_LIMITS = Object.freeze({
  maxZipEntries: CHAT_ADAPTER_LIMITS.maxZipEntries,
  maxExpandedBytes: CHAT_ADAPTER_LIMITS.maxExpandedZipBytes
});

type SlackUser = { id: string; name: string };
type SlackChannel = { id: string; name: string; members?: string[] };

function slackTimestamp(value: unknown): string {
  if (typeof value === "number") return parseTimestamp(value, "Slack export");
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value)) return parseTimestamp(Number(value), "Slack export");
  return adapterError("invalid_source_timestamp", "Slack message has an invalid timestamp");
}

function nameFromChannel(name: string): string {
  return name.replace(/[^\p{L}\p{N}_.-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "channel";
}

function checkFileLimit(bytes: Uint8Array): void {
  if (bytes.byteLength > CHAT_ADAPTER_LIMITS.maxInputBytes) {
    adapterError("archive_too_large", "Slack export exceeds the compressed input size limit");
  }
}

function buildUsers(value: unknown): Map<string, SlackUser> {
  if (!Array.isArray(value)) adapterError("invalid_archive", "Slack export is missing users.json data");
  const users = new Map<string, SlackUser>();
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = textValue(item.id);
    if (!id) continue;
    users.set(id, { id, name: textValue(item.real_name) ?? textValue(item.name) ?? id });
  }
  return users;
}

function buildChannel(value: unknown): SlackChannel {
  if (!isRecord(value) || !textValue(value.id) || !textValue(value.name)) {
    return adapterError("unrecognized_format", "Slack archive channel entry is malformed");
  }
  return { id: String(value.id), name: String(value.name), members: Array.isArray(value.members) ? value.members.filter((id): id is string => typeof id === "string") : [] };
}

function addSlackMessage(
  archive: ChatArchive,
  raw: Record<string, unknown>,
  users: Map<string, SlackUser>,
  userNames: Map<string, string>
): void {
  if (raw.type && raw.type !== "message") return;
  const authorId = textValue(raw.user) ?? textValue(raw.bot_id) ?? "slack-system";
  const user = users.get(authorId);
  userNames.set(authorId, user?.name ?? (authorId === "slack-system" ? "Slack system" : authorId));
  const sourceId = textValue(raw.ts);
  if (!sourceId) adapterError("invalid_source_message", "Slack message has no timestamp ID");
  const attachmentIds: string[] = [];
  if (Array.isArray(raw.files)) {
    for (const [index, file] of raw.files.entries()) {
      if (!isRecord(file)) continue;
      const filename = textValue(file.name) ?? textValue(file.title) ?? `slack-file-${index + 1}`;
      const id = `slack-attachment-${sourceId}-${index + 1}`;
      const externalUrl = textValue(file.url_private) ?? textValue(file.permalink);
      archive.attachments.push({
        id,
        path: `attachments/${id}_${filename.replace(/[\\/]/g, "_")}`,
        filename: filename.replace(/[\\/]/g, "_"),
        mimeType: textValue(file.mimetype) ?? "application/octet-stream",
        size: Number.isSafeInteger(file.size) && Number(file.size) >= 0 ? Number(file.size) : 0,
        ...(externalUrl ? { externalUrl } : {})
      });
      attachmentIds.push(id);
      archive.warnings.push({ code: "attachment_link_only", message: `Slack file ${filename} is represented as a link; bytes were not included` });
    }
  }
  const reactions = Array.isArray(raw.reactions)
    ? raw.reactions.filter(isRecord).map((reaction) => ({
      emoji: textValue(reaction.name) ?? "",
      participantIds: Array.isArray(reaction.users) ? reaction.users.filter((id): id is string => typeof id === "string") : []
    })).filter((reaction) => reaction.emoji)
    : [];
  const message: ChatArchiveMessage = {
    sourceId,
    authorId,
    timestamp: slackTimestamp(raw.ts),
    kind: attachmentIds.length > 0 && !textValue(raw.text) ? "file" : "text",
    text: textValue(raw.text) ?? "",
    attachmentIds,
    reactions,
    metadata: {}
  };
  const threadRoot = textValue(raw.thread_ts);
  if (threadRoot && threadRoot !== sourceId) message.replyToSourceId = threadRoot;
  archive.messages.push(message);
}

function makeArchive(channel: SlackChannel, users: Map<string, SlackUser>, messages: unknown[], profileId: string): ChatArchive {
  if (messages.length > CHAT_ADAPTER_LIMITS.maxMessages) {
    return adapterError("message_limit_exceeded", "Slack channel exceeds the message count limit");
  }
  const archive = emptyArchive("slack", profileId, channel.name, channel.id);
  const usedUsers = new Map<string, string>();
  for (const item of messages) {
    if (!isRecord(item)) return adapterError("invalid_archive", "Slack message entry is malformed");
    addSlackMessage(archive, item, users, usedUsers);
  }
  archive.participants = [...usedUsers].map(([sourceId, displayName]) => ({ sourceId, displayName }));
  archive.messages.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  return validateArchive(archive);
}

async function parseSlackJson(bytes: Uint8Array): Promise<ChatArchive> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return adapterError("invalid_archive", "Slack export is neither a ZIP file nor valid JSON");
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.channels)) {
    return adapterError("unrecognized_format", "Slack JSON must contain a channels array and messages");
  }
  if (parsed.channels.length !== 1) {
    return adapterError(parsed.channels.length > 1 ? "multiple_conversations" : "unrecognized_format", "V1 accepts exactly one Slack channel per file");
  }
  const channel = buildChannel(parsed.channels[0]);
  if (!Array.isArray(parsed.messages)) return adapterError("unrecognized_format", "Slack JSON is missing channel messages");
  return makeArchive(channel, buildUsers(parsed.users ?? []), parsed.messages, "slack-channel-json");
}

export async function parseSlackExport(bytes: Uint8Array): Promise<ChatArchive> {
  checkFileLimit(bytes);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return parseSlackJson(bytes);

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false });
  } catch {
    return adapterError("invalid_archive", "Slack export is not a readable ZIP archive");
  }
  const entries = Object.values(zip.files);
  if (entries.length > SLACK_IMPORT_LIMITS.maxZipEntries) {
    return adapterError("too_many_archive_entries", "Slack ZIP exceeds the entry count limit");
  }
  let expandedBytes = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    const originalName = entry.unsafeOriginalName ?? entry.name;
    if (originalName.startsWith("/") || originalName.includes("\\") || originalName.split("/").some((part) => part === ".." || part === ".")) {
      return adapterError("unsafe_archive_path", "Slack ZIP contains an unsafe entry path");
    }
    const size = (entry as JSZip.JSZipObject & { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
    if (typeof size === "number") expandedBytes += size;
    if (expandedBytes > SLACK_IMPORT_LIMITS.maxExpandedBytes) {
      return adapterError("archive_too_large", "Slack ZIP exceeds the expanded size limit");
    }
  }

  const channelsEntry = zip.file("channels.json");
  const usersEntry = zip.file("users.json");
  if (!channelsEntry || !usersEntry) return adapterError("unrecognized_format", "Slack ZIP is missing channels.json or users.json");
  let channels: unknown;
  let userRows: unknown;
  try {
    [channels, userRows] = await Promise.all([channelsEntry.async("string"), usersEntry.async("string")]).then(([channelText, userText]) => [JSON.parse(channelText), JSON.parse(userText)]);
  } catch {
    return adapterError("invalid_archive", "Slack ZIP contains malformed channel or user data");
  }
  if (!Array.isArray(channels)) return adapterError("invalid_archive", "Slack channels.json must contain an array");
  if (channels.length !== 1) {
    return adapterError(channels.length > 1 ? "multiple_conversations" : "unrecognized_format", "V1 accepts exactly one Slack channel per ZIP");
  }
  const channel = buildChannel(channels[0]);
  const users = buildUsers(userRows);
  const slug = nameFromChannel(channel.name);
  const dailyEntries = entries.filter((entry) => !entry.dir && entry.name.startsWith(`${slug}/`) && /\/\d{4}-\d{2}-\d{2}\.json$/.test(entry.name));
  if (dailyEntries.length === 0) return adapterError("unrecognized_format", "Slack ZIP has no dated message files for its channel");

  const rows: unknown[] = [];
  for (const entry of dailyEntries.sort((left, right) => left.name.localeCompare(right.name))) {
    try {
      const data: unknown = JSON.parse(await entry.async("string"));
      if (!Array.isArray(data)) return adapterError("invalid_archive", `Slack message file ${entry.name} must contain an array`);
      rows.push(...data);
      if (rows.length > CHAT_ADAPTER_LIMITS.maxMessages) {
        return adapterError("message_limit_exceeded", "Slack channel exceeds the message count limit");
      }
    } catch (error) {
      if (error instanceof ChatTransferAdapterError) throw error;
      return adapterError("invalid_archive", `Slack message file ${entry.name} is malformed`);
    }
  }
  return makeArchive(channel, users, rows, "slack-channel-zip");
}
