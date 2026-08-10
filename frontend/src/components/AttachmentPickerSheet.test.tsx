import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");
const attachmentSheetSource = readFileSync("src/components/AttachmentPickerSheet.tsx", "utf8");

describe("AttachmentPickerSheet Android gallery", () => {
  it("keeps only isolated Gallery, File, and Audio tabs", () => {
    expect(attachmentSheetSource).toContain('setActiveTab("gallery")');
    expect(attachmentSheetSource).toContain('activeTab === "gallery"');
    expect(attachmentSheetSource).toContain('activeTab === "file"');
    expect(attachmentSheetSource).toContain('activeTab === "audio"');
    expect(attachmentSheetSource).not.toContain('activeTab === "location"');
    expect(attachmentSheetSource).not.toContain('activeTab === "article"');
    expect(attachmentSheetSource).not.toContain("SAMPLE_GALLERY_ITEMS");
  });

  it("resets gallery selection and keeps the send CTA in Gallery", () => {
    expect(attachmentSheetSource).toContain("resetSheetState");
    expect(attachmentSheetSource).toContain('activeTab === "gallery" && selectedCount > 0');
    expect(attachmentSheetSource).toContain("media-tile-checkbox");
    expect(attachmentSheetSource).toContain("attachment-picker-send-btn");
  });

  it("defines CSS rules for TG-style attachment sheet, grid layout, floating send button, and bottom nav", () => {
    expect(styles).toContain(".attachment-picker-sheet.tg-style");
    expect(styles).toContain(".attachment-picker-grid");
    expect(styles).toContain(".media-tile-checkbox");
    expect(styles).toContain(".attachment-picker-send-btn");
    expect(styles).toContain(".attachment-picker-bottom-nav");
    expect(styles).toContain(".attachment-nav-item.active");
  });
});
