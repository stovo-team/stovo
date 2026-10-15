import JSZip from "jszip";

import { validateArchive, type ChatArchive, type ChatArchiveMessage, type ChatProviderId } from "../archive";
import type { ExportCompatibility, ExportPackage, ExportProfile } from "./types";
import { safeFilename } from "./shared";

const encoder = new TextEncoder();

export const CHAT_EXPORT_PROFILES: readonly ExportProfile[] = [
  { providerId: "stovo", profileId: "stovo-chat-archive-v1", formatVersion: "1", compatibility: "stovo_round_trip", knownLosses: [], sideEffects: [], mediaHandling: "embedded" },
  { providerId: "telegram", profileId: "telegram-readable-chat-json-v1", formatVersion: "1", compatibility: "provider_archive", knownLosses: ["provider-native import is not verified", "unsupported rich-text and service metadata may be flattened"], sideEffects: [], mediaHandling: "references" },
  { providerId: "whatsapp", profileId: "whatsapp-readable-chat-zip-v1", formatVersion: "1", compatibility: "provider_archive", knownLosses: ["WhatsApp TXT export cannot be reimported into WhatsApp", "reactions and rich formatting are flattened"], sideEffects: [], mediaHandling: "embedded" },
  { providerId: "slack", profileId: "slack-channel-readable-zip-v1", formatVersion: "1", compatibility: "provider_archive", knownLosses: ["Slack native import compatibility is not verified", "file links are preserved as references"], sideEffects: [], mediaHandling: "references" },
  { providerId: "mattermost", profileId: "mattermost-channel-csv-v1", formatVersion: "Channel Export CSV", compatibility: "provider_archive", knownLosses: ["CSV does not carry file bytes, reactions, or rich message blocks"], sideEffects: [], mediaHandling: "references" },
  { providerId: "rocketchat", profileId: "rocketchat-room-readable-json-v1", formatVersion: "1", compatibility: "provider_archive", knownLosses: ["Rocket.Chat native importer compatibility is not verified", "file attachments are exported as filename and URL references only"], sideEffects: [], mediaHandling: "references" }
];

function profile(providerId: ChatProviderId): ExportProfile {
  const found = CHAT_EXPORT_PROFILES.find((item) => item.providerId === providerId);
  if (!found) throw new Error(`No export profile for ${providerId}`);
  return found;
}

function packageFor(
  exportProfile: ExportProfile,
  filename: string,
  mimeType: string,
  bytes: Uint8Array,
  warnings: ChatArchive["warnings"]
): ExportPackage {
  return { filename, mimeType, bytes, compatibility: exportProfile.compatibility, warnings };
}

function baseWarnings(archive: ChatArchive): ChatArchive["warnings"] {
  const hasMetadata = Boolean(archive.conversation.metadata && Object.keys(archive.conversation.metadata).length) ||
    archive.messages.some((message) => Boolean(message.metadata && Object.keys(message.metadata).length));
  const hasParticipantAttributes = archive.participants.some((participant) => Boolean(participant.attributes && Object.keys(participant.attributes).length));
  const warnings = [...archive.warnings];
  if (hasMetadata || hasParticipantAttributes) warnings.push({ code: "source_metadata_omitted", message: "Provider-specific metadata was omitted from this export profile" });
  if (archive.messages.some((message) => !["text", "file"].includes(message.kind))) {
    warnings.push({ code: "structured_message_flattened", message: "Structured, system, or interactive messages are represented as text where possible" });
  }
  return warnings;
}

function safeSlug(value: string): string {
  const slug = value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  return slug || "chat";
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return btoa(binary);
}

function safeManifest(archive: ChatArchive) {
  return {
    schemaVersion: 1,
    source: { providerId: archive.source.providerId, profileId: archive.source.profileId },
    exportedAt: archive.exportedAt ?? new Date().toISOString(),
    conversation: {
      ...(archive.conversation.sourceId ? { sourceId: archive.conversation.sourceId } : {}),
      title: archive.conversation.title,
      ...(archive.conversation.metadata ? { metadata: archive.conversation.metadata } : {})
    },
    participants: archive.participants.map(({ sourceId, displayName, attributes }) => ({ sourceId, displayName, ...(attributes ? { attributes } : {}) })),
    messages: archive.messages.map((message) => ({
      sourceId: message.sourceId,
      authorId: message.authorId,
      timestamp: message.timestamp,
      kind: message.kind,
      ...(message.text !== undefined ? { text: message.text } : {}),
      ...(message.replyToSourceId ? { replyToSourceId: message.replyToSourceId } : {}),
      ...(message.threadRootSourceId ? { threadRootSourceId: message.threadRootSourceId } : {}),
      attachmentIds: [...(message.attachmentIds ?? [])],
      ...(message.reactions?.length ? { reactions: message.reactions.map((reaction) => ({ emoji: reaction.emoji, participantIds: [...(reaction.participantIds ?? [])] })) } : {}),
      ...(message.isEdited ? { isEdited: true } : {}),
      ...(message.deletedAt ? { deletedAt: message.deletedAt } : {}),
      ...(message.metadata && Object.keys(message.metadata).length ? { metadata: message.metadata } : {})
    })),
    attachments: archive.attachments.map((attachment) => ({
      id: attachment.id,
      path: attachment.path,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      ...(attachment.checksum ? { checksum: attachment.checksum } : {}),
      ...(attachment.bytes ? { bytes: base64(attachment.bytes) } : {}),
      ...(attachment.externalUrl ? { externalUrl: attachment.externalUrl } : {})
    })),
    warnings: [...archive.warnings]
  };
}

export async function serializeStovoArchive(input: ChatArchive): Promise<ExportPackage> {
  const archive = validateArchive(input);
  const manifest = safeManifest(archive);
  return packageFor(profile("stovo"), `${safeSlug(archive.conversation.title)}.stovo-chat.json`, "application/vnd.stovo.chat+json", encoder.encode(JSON.stringify(manifest, null, 2)), [...archive.warnings]);
}

function exportText(message: ChatArchiveMessage): string {
  return message.text ?? "";
}

export async function serializeTelegramExport(input: ChatArchive): Promise<ExportPackage> {
  const archive = validateArchive(input);
  const participant = new Map(archive.participants.map((item) => [item.sourceId, item.displayName]));
  const attachment = new Map(archive.attachments.map((item) => [item.id, item]));
  const warnings = baseWarnings(archive);
  const data = {
    name: archive.conversation.title,
    type: "personal_chat",
    id: archive.conversation.sourceId ?? "stovo-export",
    messages: archive.messages.map((message, index) => {
      const attachmentId = message.attachmentIds?.[0];
      const item = attachmentId ? attachment.get(attachmentId) : undefined;
      if (item) warnings.push({ code: "attachment_reference_only", message: `Telegram-readable JSON refers to ${item.filename}; include media separately` });
      const timestamp = new Date(message.timestamp);
      return {
        id: message.sourceId || index + 1,
        type: "message",
        date: timestamp.toISOString(),
        date_unixtime: String(Math.floor(timestamp.getTime() / 1000)),
        from: participant.get(message.authorId) ?? "Unknown participant",
        from_id: message.authorId,
        text: exportText(message),
        ...(message.replyToSourceId ? { reply_to_message_id: message.replyToSourceId } : {}),
        ...(item ? { file: `attachments/${safeFilename(item.filename)}` } : {})
      };
    })
  };
  return packageFor(profile("telegram"), `${safeSlug(archive.conversation.title)}.telegram.json`, "application/json", encoder.encode(JSON.stringify(data, null, 2)), warnings);
}

function whatsappDate(timestamp: string): string {
  const date = new Date(timestamp);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const year = String(date.getUTCFullYear()).slice(-2);
  let hours = date.getUTCHours();
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const time = `${hours}:${String(date.getUTCMinutes()).padStart(2, "0")} ${suffix}`;
  return `${month}/${day}/${year}, ${time}`;
}

export async function serializeWhatsAppExport(input: ChatArchive): Promise<ExportPackage> {
  const archive = validateArchive(input);
  const zip = new JSZip();
  const participants = new Map(archive.participants.map((item) => [item.sourceId, item.displayName]));
  const attachments = new Map(archive.attachments.map((item) => [item.id, item]));
  const warnings = baseWarnings(archive);
  const lines = archive.messages.map((message) => {
    let text = exportText(message);
    for (const id of message.attachmentIds ?? []) {
      const item = attachments.get(id);
      if (!item) continue;
      text = `${text}${text ? " " : ""}<attached: ${safeFilename(item.filename)}>`;
      if (item.bytes) zip.file(safeFilename(item.filename), item.bytes);
      else warnings.push({ code: "attachment_bytes_missing", message: `WhatsApp package has no bytes for ${item.filename}` });
    }
    return `${whatsappDate(message.timestamp)} - ${participants.get(message.authorId) ?? "Unknown participant"}: ${text}`;
  });
  zip.file(`${safeSlug(archive.conversation.title)}.txt`, lines.join("\n"));
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return packageFor(profile("whatsapp"), `${safeSlug(archive.conversation.title)}.whatsapp.zip`, "application/zip", bytes, warnings);
}

function slackSeconds(timestamp: string): string {
  return (Date.parse(timestamp) / 1000).toFixed(6);
}

export async function serializeSlackExport(input: ChatArchive): Promise<ExportPackage> {
  const archive = validateArchive(input);
  const zip = new JSZip();
  const channelName = safeSlug(archive.conversation.title);
  const channelId = archive.conversation.sourceId ?? "stovo-channel";
  zip.file("channels.json", JSON.stringify([{ id: channelId, name: channelName, is_private: true, members: archive.participants.map((item) => item.sourceId) }], null, 2));
  zip.file("users.json", JSON.stringify(archive.participants.map((item) => ({ id: item.sourceId, name: safeSlug(item.displayName), real_name: item.displayName })), null, 2));
  const messagesByDay = new Map<string, Array<Record<string, unknown>>>();
  const participants = new Map(archive.participants.map((item) => [item.sourceId, item]));
  const attachments = new Map(archive.attachments.map((item) => [item.id, item]));
  const warnings = baseWarnings(archive);
  for (const message of archive.messages) {
    const day = new Date(message.timestamp).toISOString().slice(0, 10);
    const row: Record<string, unknown> = {
      type: "message",
      user: message.authorId,
      text: exportText(message),
      ts: slackSeconds(message.timestamp)
    };
    if (message.replyToSourceId) row.thread_ts = message.replyToSourceId;
    if (message.reactions?.length) row.reactions = message.reactions.map((reaction) => ({ name: reaction.emoji, users: reaction.participantIds ?? [] }));
    if (message.attachmentIds?.length) {
      row.files = message.attachmentIds.map((id) => {
        const item = attachments.get(id);
        if (!item) return null;
        warnings.push({ code: "attachment_link_only", message: `Slack archive does not embed ${item.filename}` });
        return { id: item.id, name: item.filename, mimetype: item.mimeType, size: item.size, ...(item.externalUrl ? { permalink: item.externalUrl } : {}) };
      }).filter(Boolean);
    }
    if (!participants.has(message.authorId)) warnings.push({ code: "unknown_author", message: `Slack export has no user record for ${message.authorId}` });
    const rows = messagesByDay.get(day) ?? [];
    rows.push(row);
    messagesByDay.set(day, rows);
  }
  for (const [day, rows] of messagesByDay) zip.file(`${channelName}/${day}.json`, JSON.stringify(rows, null, 2));
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return packageFor(profile("slack"), `${channelName}.slack.zip`, "application/zip", bytes, warnings);
}

const MATTERMOST_CSV_HEADER = ["Post Creation Time", "User Id", "User Email", "User Type", "User Name", "Post Id", "Parent Post Id", "Post Message", "Post Type"];

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function mattermostTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss} +0000 UTC`;
}

export async function serializeMattermostCSV(input: ChatArchive): Promise<ExportPackage> {
  const archive = validateArchive(input);
  const participants = new Map(archive.participants.map((item) => [item.sourceId, item.displayName]));
  const warnings = baseWarnings(archive);
  if (archive.attachments.length > 0) warnings.push({ code: "attachments_not_supported", message: "Mattermost Channel Export CSV cannot carry attachment bytes" });
  const rows = [MATTERMOST_CSV_HEADER, ...archive.messages.map((message) => [
    mattermostTimestamp(message.timestamp),
    message.authorId,
    "",
    "user",
    participants.get(message.authorId) ?? message.authorId,
    message.sourceId,
    message.replyToSourceId ?? "",
    exportText(message),
    "message"
  ])];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  return packageFor(profile("mattermost"), `${safeSlug(archive.conversation.title)}.mattermost.csv`, "text/csv", encoder.encode(csv), warnings);
}

export async function serializeRocketChatExport(input: ChatArchive): Promise<ExportPackage> {
  const archive = validateArchive(input);
  const participants = new Map(archive.participants.map((item) => [item.sourceId, item.displayName]));
  const attachments = new Map(archive.attachments.map((item) => [item.id, item]));
  const warnings = baseWarnings(archive);
  const roomId = archive.conversation.sourceId ?? "stovo-room";
  const data = {
    room: { _id: roomId, name: archive.conversation.title, t: "c" },
    messages: archive.messages.map((message) => ({
      _id: message.sourceId,
      rid: roomId,
      msg: exportText(message),
      ts: message.timestamp,
      u: { _id: message.authorId, username: safeSlug(participants.get(message.authorId) ?? message.authorId), name: participants.get(message.authorId) ?? "Unknown participant" },
      ...(message.replyToSourceId ? { tmid: message.replyToSourceId } : {}),
      ...(message.attachmentIds?.length ? { attachments: message.attachmentIds.map((id) => {
        const attachment = attachments.get(id);
        if (!attachment) return null;
        warnings.push({ code: attachment.bytes ? "attachment_bytes_omitted" : "attachment_link_only", message: `Rocket.Chat JSON does not embed ${attachment.filename}` });
        return { title: attachment.filename, ...(attachment.externalUrl ? { title_link: attachment.externalUrl } : {}) };
      }).filter(Boolean) } : {})
    }))
  };
  return packageFor(profile("rocketchat"), `${safeSlug(archive.conversation.title)}.rocketchat.json`, "application/json", encoder.encode(JSON.stringify(data, null, 2)), warnings);
}

export async function serializeChatArchive(input: ChatArchive, exportProfile: ExportProfile): Promise<ExportPackage> {
  const registeredProfile = CHAT_EXPORT_PROFILES.find((item) => item.providerId === exportProfile.providerId && item.profileId === exportProfile.profileId);
  if (!registeredProfile || registeredProfile.compatibility !== exportProfile.compatibility || registeredProfile.formatVersion !== exportProfile.formatVersion || registeredProfile.mediaHandling !== exportProfile.mediaHandling || JSON.stringify(registeredProfile.knownLosses) !== JSON.stringify(exportProfile.knownLosses) || JSON.stringify(registeredProfile.sideEffects) !== JSON.stringify(exportProfile.sideEffects)) {
    throw new Error("Unsupported or mismatched chat export profile");
  }
  const archive = validateArchive(input);
  if (exportProfile.compatibility === "native_import_verified" && exportProfile.providerId !== "stovo") {
    throw new Error("V1 does not advertise provider native import compatibility");
  }
  const serializers: Record<ChatProviderId, (value: ChatArchive) => Promise<ExportPackage>> = {
    stovo: serializeStovoArchive,
    telegram: serializeTelegramExport,
    whatsapp: serializeWhatsAppExport,
    slack: serializeSlackExport,
    mattermost: serializeMattermostCSV,
    rocketchat: serializeRocketChatExport
  };
  const packageResult = await serializers[exportProfile.providerId](archive);
  return { ...packageResult, compatibility: exportProfile.compatibility as ExportCompatibility };
}
