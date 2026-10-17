import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/FilesPage.tsx"), "utf8");

describe("Storage audio preview", () => {
  it("uses the app audio player instead of browser-native controls", () => {
    expect(page).toContain("<AudioPlayer");
    expect(page).not.toMatch(/<audio controls src=\{selectedMediaUrl\}/);
  });

  it("uses the app video player for storage video details", () => {
    expect(page).toContain("<VideoPlayer");
    expect(page).toContain('className="storage-preview-media"');
    expect(page).not.toMatch(/<video controls src=\{selectedMediaUrl\}/);
  });

  it("uses the document attachment preview for storage documents", () => {
    expect(page).toContain("detectDocumentPreviewKind");
    expect(page).toMatch(/<DocumentAttachmentPreview\s+accessToken=\{accessToken\}\s+file=\{selectedFile\}\s+inlinePreview\s+hideActions\s*\/>/);
    expect(page).toContain('selectedDocumentKind !== "unsupported"');
  });
});
