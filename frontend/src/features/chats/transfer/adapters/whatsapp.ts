import JSZip from "jszip";

import { validateArchive, type ChatArchive, type ChatArchiveMessage } from "../archive";
import { adapterError, buildAttachment, emptyArchive } from "./shared";
import { CHAT_ADAPTER_LIMITS } from "./types";

export type WhatsAppExportInput = {
  filename: string;
  text: string;
  media: Map<string, Uint8Array>;
};

type ParsedLine = {
  timestamp: string;
  author: string;
  text: string;
};

function parseWhatsAppDate(date: string, time: string, meridiem?: string): string | null {
  const dateParts = date.split(/[/.]/).map(Number);
  if (dateParts.length !== 3 || dateParts.some((part) => !Number.isInteger(part))) return null;
  let [month, day, year] = dateParts;
  if (date.includes(".") || (date.includes("/") && month > 12)) [day, month, year] = dateParts;
  if (year < 100) year += year >= 70 ? 1900 : 2000;

  const timeMatch = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!timeMatch) return null;
  let hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const seconds = Number(timeMatch[3] ?? "0");
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem.toUpperCase() === "PM" ? 12 : 0);
  }
  if (hours > 23) return null;
  const instant = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  if (instant.getUTCFullYear() !== year || instant.getUTCMonth() !== month - 1 || instant.getUTCDate() !== day || minutes > 59 || seconds > 59) {
    return null;
  }
  return instant.toISOString();
}

function parseHeader(line: string): ParsedLine | null {
  const match = line.match(/^(.+?),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(AM|PM)?\s+-\s+([^:]+):\s?(.*)$/i);
  if (match) {
    const timestamp = parseWhatsAppDate(match[1], match[2], match[3]);
    if (!timestamp) return null;
    return { timestamp, author: match[4].trim(), text: match[5] };
  }
  const ios = line.match(/^\[([^\]]+)\]\s*([^:]+):\s?(.*)$/);
  if (!ios) return null;
  const dateTime = ios[1].match(/^(.+?),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(AM|PM)?$/i);
  if (!dateTime) return null;
  const timestamp = parseWhatsAppDate(dateTime[1], dateTime[2], dateTime[3]);
  return timestamp ? { timestamp, author: ios[2].trim(), text: ios[3] } : null;
}

function chatTitle(filename: string): string {
  return filename.replace(/\.txt$/i, "").trim() || "WhatsApp chat";
}

export async function parseWhatsAppExport(input: WhatsAppExportInput): Promise<ChatArchive> {
  if (new TextEncoder().encode(input.text).byteLength > CHAT_ADAPTER_LIMITS.maxInputBytes) {
    return adapterError("archive_too_large", "WhatsApp text export exceeds the input size limit");
  }
  const parsed: ParsedLine[] = [];
  for (const line of input.text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const header = parseHeader(line);
    if (header) {
      parsed.push(header);
      continue;
    }
    if (parsed.length > 0) parsed[parsed.length - 1].text += `\n${line}`;
  }
  if (parsed.length === 0) return adapterError("unrecognized_format", "File does not contain recognizable WhatsApp chat messages");
  if (parsed.length > CHAT_ADAPTER_LIMITS.maxMessages) {
    return adapterError("message_limit_exceeded", "WhatsApp export exceeds the message count limit");
  }

  const archive = emptyArchive("whatsapp", "whatsapp-chat-txt", chatTitle(input.filename));
  const authors = new Map<string, string>();
  const attachmentByName = new Map<string, string>();
  const messages: ChatArchiveMessage[] = [];

  for (const [index, row] of parsed.entries()) {
    let body = row.text.replace(/(^|\n)([\p{L}\p{N}_ .()\-]+\.[A-Za-z0-9]{1,12})\s+\(file attached\)/giu, "$1<attached: $2>");
    const attachmentIds: string[] = [];
    const marker = /<attached:\s*([^>]+)>/gi;
    for (const match of [...body.matchAll(marker)]) {
      const filename = match[1].trim();
      const bytes = input.media.get(filename);
      let attachmentId = attachmentByName.get(filename);
      if (!attachmentId) {
        attachmentId = `whatsapp-attachment-${attachmentByName.size + 1}`;
        attachmentByName.set(filename, attachmentId);
        if (bytes) {
          archive.attachments.push(buildAttachment({ id: attachmentId, filename, bytes }));
        } else {
          archive.attachments.push(buildAttachment({ id: attachmentId, filename }));
          archive.warnings.push({ code: "attachment_bytes_missing", message: `WhatsApp media file ${filename} was not supplied` });
        }
      }
      attachmentIds.push(attachmentId);
    }
    body = body.replace(marker, "").trim();

    const authorKey = row.author;
    let authorId = authors.get(authorKey);
    if (!authorId) {
      authorId = `whatsapp-user-${authors.size + 1}`;
      authors.set(authorKey, authorId);
    }
    messages.push({
      sourceId: `whatsapp-message-${index + 1}`,
      authorId,
      timestamp: row.timestamp,
      kind: attachmentIds.length > 0 && body === "" ? "file" : "text",
      text: body,
      attachmentIds,
      metadata: {}
    });
  }
  archive.participants = [...authors].map(([displayName, sourceId]) => ({ sourceId, displayName }));
  archive.messages = messages;
  return validateArchive(archive);
}

export async function parseWhatsAppZip(bytes: Uint8Array): Promise<ChatArchive> {
  if (bytes.byteLength > CHAT_ADAPTER_LIMITS.maxInputBytes) {
    return adapterError("archive_too_large", "WhatsApp ZIP exceeds the compressed input size limit");
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false });
  } catch {
    return adapterError("invalid_archive", "WhatsApp export is not a readable ZIP archive");
  }
  const entries = Object.values(zip.files);
  if (entries.length > CHAT_ADAPTER_LIMITS.maxZipEntries) {
    return adapterError("too_many_archive_entries", "WhatsApp ZIP exceeds the entry count limit");
  }
  let expandedBytes = 0;
  const textEntries: JSZip.JSZipObject[] = [];
  for (const entry of entries) {
    if (entry.dir) continue;
    const originalName = entry.unsafeOriginalName ?? entry.name;
    if (originalName.startsWith("/") || originalName.includes("\\") || originalName.split("/").some((part) => part === ".." || part === ".")) {
      return adapterError("unsafe_archive_path", "WhatsApp ZIP contains an unsafe entry path");
    }
    const size = (entry as JSZip.JSZipObject & { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
    if (typeof size === "number") expandedBytes += size;
    if (expandedBytes > 200 * 1024 * 1024) {
      return adapterError("archive_too_large", "WhatsApp ZIP exceeds the expanded size limit");
    }
    if (!originalName.toLowerCase().endsWith(".txt") && typeof size === "number" && size > CHAT_ADAPTER_LIMITS.maxAttachmentBytes) {
      return adapterError("attachment_too_large", `WhatsApp media ${originalName} exceeds the per-file size limit`);
    }
    if (originalName.toLowerCase().endsWith(".txt")) textEntries.push(entry);
  }
  if (textEntries.length !== 1) {
    return adapterError(textEntries.length > 1 ? "multiple_conversations" : "unrecognized_format", "WhatsApp ZIP must contain exactly one chat TXT file");
  }

  let text: string;
  try {
    text = await textEntries[0].async("string");
  } catch {
    return adapterError("invalid_archive", "WhatsApp chat TXT could not be read");
  }
  const media = new Map<string, Uint8Array>();
  for (const entry of entries) {
    if (entry.dir || entry === textEntries[0]) continue;
    const filename = (entry.unsafeOriginalName ?? entry.name).split("/").pop() ?? "";
    if (!filename || media.has(filename)) return adapterError("invalid_archive", `WhatsApp ZIP contains an ambiguous media filename: ${filename}`);
    const content = await entry.async("uint8array");
    if (content.byteLength > CHAT_ADAPTER_LIMITS.maxAttachmentBytes) {
      return adapterError("attachment_too_large", `WhatsApp media ${filename} exceeds the per-file size limit`);
    }
    media.set(filename, content);
  }
  return parseWhatsAppExport({ filename: textEntries[0].name.split("/").pop() ?? "chat.txt", text, media });
}
