import type { FamilyFile } from "./api/files";

export function isMediaAttachment(file: { mimeType: string }) {
  return file.mimeType.startsWith("image/") || file.mimeType.startsWith("video/");
}

export function partitionMessageAttachments(files: FamilyFile[]) {
  const media: FamilyFile[] = [];
  const other: FamilyFile[] = [];
  for (const file of files) {
    if (isMediaAttachment(file)) {
      media.push(file);
    } else {
      other.push(file);
    }
  }
  return { media, other };
}

/** Telegram-style layout key for CSS grid templates. Caps named layouts at 6+. */
export function mediaAlbumLayoutCount(count: number) {
  if (count <= 1) return 1;
  if (count >= 6) return 6;
  return count;
}
