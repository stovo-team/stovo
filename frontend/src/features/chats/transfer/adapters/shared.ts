import { validateArchive, type ChatArchive, type ChatArchiveAttachment, type ChatArchiveMessage, type ChatProviderId } from "../archive";
import { ChatTransferAdapterError, CHAT_ADAPTER_LIMITS } from "./types";

export function adapterError(code: ChatTransferAdapterError["code"], message: string): never {
  throw new ChatTransferAdapterError(code, message);
}

export function decodeJson(bytes: Uint8Array, format: string): unknown {
  if (bytes.byteLength > CHAT_ADAPTER_LIMITS.maxInputBytes) {
    return adapterError("archive_too_large", `${format} file exceeds the input size limit`);
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return adapterError("invalid_archive", `${format} file is not valid UTF-8 JSON`);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function textValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

export function parseTimestamp(value: unknown, format: string): string {
  if (typeof value !== "string" && typeof value !== "number") {
    return adapterError("invalid_source_timestamp", `${format} message has no usable timestamp`);
  }
  let candidate: string;
  if (typeof value === "number") {
    const time = value * 1000;
    if (!Number.isFinite(time)) return adapterError("invalid_source_timestamp", `${format} message has an invalid timestamp`);
    const parsed = new Date(time);
    if (!Number.isFinite(parsed.getTime())) return adapterError("invalid_source_timestamp", `${format} message has an invalid timestamp`);
    return parsed.toISOString();
  } else {
    const trimmed = value.trim();
    candidate = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/.test(trimmed)
      ? `${trimmed.replace(" ", "T")}Z`
      : trimmed;
    const time = Date.parse(candidate);
    if (!Number.isFinite(time)) return adapterError("invalid_source_timestamp", `${format} message has an invalid timestamp`);
    return new Date(time).toISOString();
  }
  const time = Date.parse(candidate);
  if (!Number.isFinite(time)) return adapterError("invalid_source_timestamp", `${format} message has an invalid timestamp`);
  return new Date(time).toISOString();
}

export function ensureMessageLimit(messages: readonly unknown[], format: string): void {
  if (messages.length > CHAT_ADAPTER_LIMITS.maxMessages) {
    adapterError("message_limit_exceeded", `${format} file exceeds the message count limit`);
  }
}

export function safeFilename(value: string, fallback = "attachment"): string {
  const leaf = value.replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
  const safe = leaf.replace(/[\u0000-\u001f<>:"|?*]/g, "_").replace(/\.{2,}/g, ".").trim();
  return safe && safe !== "." ? safe.slice(0, 180) : fallback;
}

export function buildAttachment(input: {
  id: string;
  filename: string;
  mimeType?: string;
  bytes?: Uint8Array;
  size?: number;
  externalUrl?: string;
}): ChatArchiveAttachment {
  const filename = safeFilename(input.filename);
  const size = input.bytes?.byteLength ?? input.size ?? 0;
  if (size > CHAT_ADAPTER_LIMITS.maxAttachmentBytes) {
    return adapterError("archive_too_large", `Attachment ${filename} exceeds the per-file size limit`);
  }
  return {
    id: input.id,
    path: `attachments/${input.id}_${filename}`,
    filename,
    mimeType: input.mimeType || "application/octet-stream",
    size,
    ...(input.bytes ? { bytes: input.bytes } : {}),
    ...(input.externalUrl ? { externalUrl: input.externalUrl } : {})
  };
}

export function emptyArchive(
  providerId: ChatProviderId,
  profileId: string,
  title: string,
  sourceId?: string
): ChatArchive {
  const normalizedTitle = title.trim() || "Imported chat";
  return {
    schemaVersion: 1,
    source: { providerId, profileId },
    exportedAt: new Date().toISOString(),
    conversation: { sourceId: sourceId?.trim() || `${providerId}:${normalizedTitle}`, title: normalizedTitle },
    participants: [],
    messages: [],
    attachments: [],
    warnings: []
  };
}

export function message(
  values: Omit<ChatArchiveMessage, "attachmentIds" | "metadata"> & Partial<Pick<ChatArchiveMessage, "attachmentIds" | "metadata">>
): ChatArchiveMessage {
  return { attachmentIds: [], metadata: {}, ...values };
}

export function utf8(bytes: Uint8Array, format: string): string {
  if (bytes.byteLength > CHAT_ADAPTER_LIMITS.maxInputBytes) {
    return adapterError("archive_too_large", `${format} file exceeds the input size limit`);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return adapterError("invalid_archive", `${format} file is not valid UTF-8`);
  }
}

export function flattenRichText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((part) => {
      if (typeof part === "string") return part;
      if (isRecord(part)) return textValue(part.text) ?? "";
      return "";
    }).join("");
  }
  return "";
}

export function validateParsedArchive(archive: ChatArchive): ChatArchive {
  return validateArchive(archive);
}
