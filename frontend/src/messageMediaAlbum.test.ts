import { describe, expect, it } from "vitest";

import type { FamilyFile } from "./api/files";
import {
  isMediaAttachment,
  mediaAlbumLayoutCount,
  partitionMessageAttachments
} from "./messageMediaAlbum";

function file(partial: Partial<FamilyFile> & Pick<FamilyFile, "id" | "mimeType">): FamilyFile {
  return {
    familyId: "fam",
    uploadedBy: "u1",
    chatId: null,
    chatTitle: null,
    chatType: null,
    accessScope: "chat",
    storageProvider: "local",
    originalName: "file",
    sizeBytes: 1,
    checksum: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    isFavorite: false,
    ...partial
  };
}

describe("isMediaAttachment", () => {
  it("treats images and videos as media", () => {
    expect(isMediaAttachment({ mimeType: "image/jpeg" })).toBe(true);
    expect(isMediaAttachment({ mimeType: "video/mp4" })).toBe(true);
    expect(isMediaAttachment({ mimeType: "audio/mpeg" })).toBe(false);
    expect(isMediaAttachment({ mimeType: "application/pdf" })).toBe(false);
  });
});

describe("partitionMessageAttachments", () => {
  it("splits media from files and audio", () => {
    const files = [
      file({ id: "1", mimeType: "image/png" }),
      file({ id: "2", mimeType: "application/pdf", originalName: "doc.pdf" }),
      file({ id: "3", mimeType: "video/mp4" }),
      file({ id: "4", mimeType: "audio/mpeg", originalName: "clip.mp3" })
    ];
    const { media, other } = partitionMessageAttachments(files);
    expect(media.map((item) => item.id)).toEqual(["1", "3"]);
    expect(other.map((item) => item.id)).toEqual(["2", "4"]);
  });
});

describe("mediaAlbumLayoutCount", () => {
  it("caps layout variants at 6", () => {
    expect(mediaAlbumLayoutCount(1)).toBe(1);
    expect(mediaAlbumLayoutCount(4)).toBe(4);
    expect(mediaAlbumLayoutCount(6)).toBe(6);
    expect(mediaAlbumLayoutCount(12)).toBe(6);
  });
});
