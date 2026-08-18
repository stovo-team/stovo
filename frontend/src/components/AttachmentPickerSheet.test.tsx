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

  it("shows the full message composer element with smile, file attachment, enlarge, and send buttons", () => {
    expect(attachmentSheetSource).toContain("attachment-picker-message-box");
    expect(attachmentSheetSource).toContain("message-composer-row");
    expect(attachmentSheetSource).toContain("file-picker");
    expect(attachmentSheetSource).toContain("emoji-picker-shell");
    expect(attachmentSheetSource).toContain("EmojiPicker");
    expect(attachmentSheetSource).toContain("MessageEnlargeButton");
    expect(attachmentSheetSource).toContain("attachment-picker-message-send");
    expect(attachmentSheetSource).toContain('placeholder="Message"');
    expect(attachmentSheetSource).toContain("handleSendSelected");
  });

  it("synchronizes message draft with parent composer and preserves draft state across openings", () => {
    expect(attachmentSheetSource).toContain("composer !== undefined ? composer : localDraft");
    expect(attachmentSheetSource).toContain("onComposerChange");
    expect(attachmentSheetSource).toContain("resetSheetState");
    // resetSheetState should not wipe the message text
    const resetFnBody = attachmentSheetSource.match(/const resetSheetState = \(\) => \{([\s\S]*?)\};/)?.[1] ?? "";
    expect(resetFnBody).not.toContain('setMessage("")');
    expect(resetFnBody).not.toContain('setComposer("")');
    expect(resetFnBody).not.toContain('setLocalDraft("")');
  });

  it("supports multiline text and auto-growing height in the gallery message box", () => {
    expect(attachmentSheetSource).toContain("adjustTextareaHeight");
    expect(attachmentSheetSource).toContain("isMultiline");
    expect(attachmentSheetSource).toContain("message-composer-row--multiline");
  });

  it("sends selected files and message or text-only messages from the picker", () => {
    expect(attachmentSheetSource).toContain("onSendSelectedFiles?.(files, messageText)");
    expect(attachmentSheetSource).toContain("onSendSelectedFiles?.([], messageText)");
  });

  it("uses cached media immediately and refreshes the device library for new captures", () => {
    expect(attachmentSheetSource).toContain("getCachedNativeMedia");
    expect(attachmentSheetSource).toContain("const cached = getCachedNativeMedia");
    expect(attachmentSheetSource).toContain("listNativeMedia(mediaCategory(tab))");
  });

  it("allows selecting multiple recent audio and document items", () => {
    expect(attachmentSheetSource).toContain("selectedItemIds={selectedItemIds}");
    expect(attachmentSheetSource).toContain("onToggle={toggleGridItemSelection}");
  });

  it("does not reset the selected tab while loading its media", () => {
    expect(attachmentSheetSource).toMatch(/useEffect\(\(\) => \{[\s\S]*?resetSheetState\(\);[\s\S]*?\}, \[open\]\);/);
    expect(attachmentSheetSource).toMatch(/useEffect\(\(\) => \{[\s\S]*?loadRecentItems\(activeTab\)[\s\S]*?\}, \[open, activeTab\]\);/);
  });

  it("falls back to Android's picker when the in-app media query is empty or fails", () => {
    expect(attachmentSheetSource).toContain("No photos or videos found in the in-app gallery.");
    expect(attachmentSheetSource).toContain("Unable to load the in-app gallery.");
    expect(attachmentSheetSource).toMatch(/galleryState === "empty"[\s\S]*?onPick\("gallery"\)/);
    expect(attachmentSheetSource).toMatch(/galleryState === "error"[\s\S]*?onPick\("gallery"\)/);
  });

  it("defines CSS rules for TG-style attachment sheet, grid layout, inline message box, and bottom nav", () => {
    expect(styles).toContain(".attachment-picker-sheet.tg-style");
    expect(styles).toContain(".attachment-picker-grid");
    expect(styles).toContain(".media-tile-checkbox");
    expect(styles).toContain(".attachment-picker-message-box");
    expect(styles).toContain(".attachment-picker-bottom-nav");
    expect(styles).toContain(".attachment-nav-item.active");
  });

  it("keeps the close control circular despite the global button minimum size", () => {
    const rule = styles.match(/\.attachment-picker-close-btn \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(rule).toContain("flex: 0 0 36px;");
    expect(rule).toContain("min-width: 36px;");
    expect(rule).toContain("min-height: 36px;");
    expect(rule).toContain("border-radius: 999px;");
  });
});
