import { CHAT_ARCHIVE_LIMITS, type ChatArchive, type ChatProviderId } from "../archive";
import { parseMattermostCSV } from "./mattermost";
import { parseRocketChatExport } from "./rocketchat";
import { parseSlackExport } from "./slack";
import { parseStovoArchive } from "./stovo";
import { parseTelegramExport } from "./telegram";
import JSZip from "jszip";
import { parseWhatsAppExport, parseWhatsAppZip } from "./whatsapp";
import { adapterError, isRecord } from "./shared";
import { CHAT_ADAPTER_LIMITS, type AdapterParseContext, type ChatAdapter } from "./types";

const utf8 = new TextDecoder("utf-8", { fatal: true });

async function readBytes(file: File): Promise<Uint8Array> {
  if (file.size > CHAT_ADAPTER_LIMITS.maxInputBytes) {
    return adapterError("archive_too_large", "Selected file exceeds the import size limit");
  }
  return new Uint8Array(await file.arrayBuffer());
}

function jsonRoot(bytes: Uint8Array): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(utf8.decode(bytes));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function parseWhatsAppFile(file: File, context?: AdapterParseContext): Promise<ChatArchive> {
  const bytes = await readBytes(file);
  let text: string;
  try {
    text = utf8.decode(bytes);
  } catch {
    return adapterError("unrecognized_format", "WhatsApp export must be a UTF-8 TXT file");
  }
  const media = new Map<string, Uint8Array>();
  let totalMediaBytes = 0;
  for (const related of context?.relatedFiles ?? []) {
    if (related.size > CHAT_ADAPTER_LIMITS.maxAttachmentBytes) {
      return adapterError("attachment_too_large", `Media file ${related.name} exceeds the attachment size limit`);
    }
    totalMediaBytes += related.size;
    if (totalMediaBytes > CHAT_ARCHIVE_LIMITS.maxTotalAttachmentBytes) return adapterError("archive_too_large", "WhatsApp media files exceed the total attachment size limit");
    if (media.has(related.name)) return adapterError("invalid_archive", `Multiple selected files have the same media name: ${related.name}`);
    media.set(related.name, new Uint8Array(await related.arrayBuffer()));
  }
  return parseWhatsAppExport({ filename: file.name, text, media });
}

async function parseMattermostFile(file: File): Promise<ChatArchive> {
  try {
    return parseMattermostCSV(utf8.decode(await readBytes(file)));
  } catch {
    return adapterError("unrecognized_format", "Mattermost CSV must be valid UTF-8");
  }
}

export const chatAdapters: readonly ChatAdapter[] = [
  { providerId: "stovo", profileIds: ["stovo-chat-archive-v1"], parse: async (file) => parseStovoArchive(await readBytes(file)) },
  { providerId: "telegram", profileIds: ["telegram-desktop-json"], parse: async (file) => parseTelegramExport(await readBytes(file)) },
  { providerId: "whatsapp", profileIds: ["whatsapp-chat-txt"], parse: parseWhatsAppFile },
  { providerId: "slack", profileIds: ["slack-channel-zip", "slack-channel-json"], parse: async (file) => parseSlackExport(await readBytes(file)) },
  { providerId: "mattermost", profileIds: ["mattermost-channel-csv"], parse: parseMattermostFile },
  { providerId: "rocketchat", profileIds: ["rocketchat-room-json"], parse: async (file) => parseRocketChatExport(await readBytes(file)) }
];

export function getChatAdapter(providerId: ChatProviderId): ChatAdapter {
  const adapter = chatAdapters.find((item) => item.providerId === providerId);
  if (!adapter) return adapterError("unrecognized_format", `No chat transfer adapter is registered for ${providerId}`);
  return adapter;
}

export async function parseChatFile(file: File, context?: AdapterParseContext): Promise<ChatArchive> {
  if (file.size > CHAT_ADAPTER_LIMITS.maxInputBytes) {
    return adapterError("archive_too_large", "Selected file exceeds the import size limit");
  }
  const filename = file.name.toLowerCase();
  const bytes = await readBytes(file);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    try {
      const zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false });
      if (zip.file("channels.json") && zip.file("users.json")) return parseSlackExport(bytes);
      if (Object.values(zip.files).some((entry) => !entry.dir && (entry.unsafeOriginalName ?? entry.name).toLowerCase().endsWith(".txt"))) {
        return parseWhatsAppZip(bytes);
      }
    } catch {
      return adapterError("invalid_archive", "Selected ZIP export is not readable");
    }
    return parseSlackExport(bytes);
  }
  if (filename.endsWith(".csv")) {
    try {
      return parseMattermostCSV(utf8.decode(bytes));
    } catch {
      return adapterError("unrecognized_format", "Mattermost CSV must be valid UTF-8");
    }
  }
  if (filename.endsWith(".txt")) {
    let text: string;
    try {
      text = utf8.decode(bytes);
    } catch {
      return adapterError("unrecognized_format", "Selected text file is not UTF-8");
    }
    const media = new Map<string, Uint8Array>();
    let totalMediaBytes = 0;
    for (const related of context?.relatedFiles ?? []) {
      if (related.size > CHAT_ADAPTER_LIMITS.maxAttachmentBytes) return adapterError("attachment_too_large", `Media file ${related.name} exceeds the attachment size limit`);
      totalMediaBytes += related.size;
      if (totalMediaBytes > CHAT_ARCHIVE_LIMITS.maxTotalAttachmentBytes) return adapterError("archive_too_large", "WhatsApp media files exceed the total attachment size limit");
      if (media.has(related.name)) return adapterError("invalid_archive", `Multiple selected files have the same media name: ${related.name}`);
      media.set(related.name, new Uint8Array(await related.arrayBuffer()));
    }
    return parseWhatsAppExport({ filename: file.name, text, media });
  }

  const root = jsonRoot(bytes);
  if (root?.schemaVersion !== undefined) return parseStovoArchive(bytes);
  if (root?.channels !== undefined) return parseSlackExport(bytes);
  if (root?.chats !== undefined || root?.type !== undefined) return parseTelegramExport(bytes);
  if (root?.room !== undefined || root?.rooms !== undefined || root?.messages !== undefined) return parseRocketChatExport(bytes);
  return adapterError("unrecognized_format", "Could not identify a supported single-chat export format");
}
