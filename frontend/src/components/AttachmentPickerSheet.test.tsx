import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");
const attachmentSheetSource = readFileSync("src/components/AttachmentPickerSheet.tsx", "utf8");

describe("AttachmentPickerSheet TG upgrades", () => {
  it("includes Telegram category tabs (Gallery, File, Audio, Location, Article)", () => {
    expect(attachmentSheetSource).toContain('setActiveTab("gallery")');
    expect(attachmentSheetSource).toContain('activeTab === "gallery"');
    expect(attachmentSheetSource).toContain('activeTab === "file"');
    expect(attachmentSheetSource).toContain('activeTab === "audio"');
    expect(attachmentSheetSource).toContain('activeTab === "location"');
    expect(attachmentSheetSource).toContain('activeTab === "article"');
  });

  it("includes camera tile and circular checkbox selection indicators for media grid", () => {
    expect(attachmentSheetSource).toContain("camera-tile");
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
