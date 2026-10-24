import { CHAT_ARCHIVE_LIMITS, validateArchive, type ChatArchive } from "../archive";
import { adapterError, decodeJson, isRecord } from "./shared";

function decodeAttachmentBase64(value: string, filename: string): Uint8Array {
  if (value.length > Math.ceil(CHAT_ARCHIVE_LIMITS.maxAttachmentBytes * 4 / 3) + 8) {
    return adapterError("attachment_too_large", `Stovo attachment ${filename} exceeds the size limit`);
  }
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return adapterError("invalid_attachment", `Stovo attachment ${filename} has invalid base64 data`);
  }
}

export async function parseStovoArchive(bytes: Uint8Array): Promise<ChatArchive> {
  const input = decodeJson(bytes, "Stovo archive");
  if (!isRecord(input)) throw new Error("Stovo archive must be a JSON object");
  if (Array.isArray(input.attachments)) {
    input.attachments = input.attachments.map((entry) => {
      if (!isRecord(entry) || typeof entry.bytes !== "string") return entry;
      return { ...entry, bytes: decodeAttachmentBase64(entry.bytes, String(entry.filename ?? entry.id ?? "attachment")) };
    });
  }
  const archive = validateArchive(input);
  if (archive.source.providerId !== "stovo") {
    return adapterError("unrecognized_format", "File is not a Stovo chat archive");
  }
  return archive;
}
