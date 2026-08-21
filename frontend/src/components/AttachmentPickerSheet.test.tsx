import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");
const attachmentSheetSource = readFileSync("src/components/AttachmentPickerSheet.tsx", "utf8");
const mediaPickerSource = readFileSync("src/components/attachment-picker/useMediaPicker.ts", "utf8");
const mediaGridSource = readFileSync("src/components/attachment-picker/MediaGalleryGrid.tsx", "utf8");

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
    expect(mediaPickerSource).toContain("getCachedNativeMedia");
    expect(mediaPickerSource).toContain("const cached = getCachedNativeMedia");
    expect(mediaPickerSource).toContain("listNativeMedia(categoryFor(tab))");
  });

  it("allows selecting multiple recent audio and document items", () => {
    expect(attachmentSheetSource).toContain("selectedItemIds={selectedItemIds}");
    expect(attachmentSheetSource).toContain("onToggle={toggleSelection}");
    expect(mediaPickerSource).toContain("const toggleSelection");
  });

  it("does not reset the selected tab while loading its media", () => {
    expect(attachmentSheetSource).toMatch(/useEffect\(\(\) => \{[\s\S]*?resetSheetState\(\);[\s\S]*?\}, \[open\]\);/);
    expect(mediaPickerSource).toMatch(/useEffect\(\(\) => \{[\s\S]*?loadRecentItems\(activeTab\)[\s\S]*?\}, \[activeTab, loadRecentItems, open\]\);/);
  });

  it("falls back to Android's picker when the in-app media query is empty or fails", () => {
    expect(mediaGridSource).toContain("No photos or videos found in the in-app gallery.");
    expect(mediaGridSource).toContain("Unable to load the in-app gallery.");
    expect(attachmentSheetSource).toContain("onChooseGallery={() => { onPick(\"gallery\"); closeSheet(); }}");
  });

  it("opens ImageLightbox preview on photo thumbnail click and toggles selection on top-right checkbox click", () => {
    expect(attachmentSheetSource).toContain("ImageLightbox");
    expect(attachmentSheetSource).toContain("previewMediaItem");
    expect(attachmentSheetSource).toContain("onPreview={setPreviewMediaItem}");
    expect(mediaGridSource).toContain("media-tile-thumb-btn");
    expect(mediaGridSource).toContain("media-tile-checkbox");
    expect(mediaGridSource).toContain("onToggle(item.id)");
  });

  it("defines CSS rules for TG-style attachment sheet, grid layout, inline message box, and bottom nav", () => {
    expect(styles).toContain(".attachment-picker-sheet.tg-style");
    expect(styles).toContain(".attachment-picker-grid");
    expect(styles).toContain(".media-tile-thumb-btn");
    expect(styles).toContain(".media-tile-checkbox");
    expect(styles).toContain("object-fit: cover");
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

  it("supports sliding up from top to open full screen, sliding down to restore default state, and sliding down more to close", () => {
    expect(attachmentSheetSource).toContain("isFullScreen");
    expect(attachmentSheetSource).toContain("setIsFullScreen(true)");
    expect(attachmentSheetSource).toContain("setIsFullScreen(false)");
    expect(attachmentSheetSource).toContain("attachment-picker-sheet-handle-zone");
    expect(attachmentSheetSource).toContain("handleZonePointerDown");
    expect(attachmentSheetSource).toContain("handleZonePointerMove");
    expect(attachmentSheetSource).toContain("handleZonePointerUp");
    expect(attachmentSheetSource).toContain("handleBodyTouchStart");
    expect(attachmentSheetSource).toContain("handleBodyTouchEnd");
    expect(styles).toContain(".attachment-picker-sheet.tg-style.is-fullscreen");
    expect(styles).toContain(".attachment-picker-sheet-handle-zone");
  });

  it("closes only the preview when returning or clicking back from ImageLightbox, keeping the gallery open", () => {
    // Closing ImageLightbox in AttachmentPickerSheet clears previewMediaItem without closing the sheet
    expect(attachmentSheetSource).toContain("onClose={() => setPreviewMediaItem(null)}");
    // Back button listener clears previewMediaItem when preview is open
    expect(attachmentSheetSource).toMatch(/if\s*\(previewMediaItem\)\s*\{\s*setPreviewMediaItem\(null\);\s*return;\s*\}/);
    expect(attachmentSheetSource).toContain("App.addListener(\"backButton\"");
  });

  it("integrates gallery preview and attachment sheet dismissal with useChatSurfaceDismissal", () => {
    const dismissalSource = readFileSync("src/features/chats/useChatSurfaceDismissal.ts", "utf8");
    expect(dismissalSource).toContain("hasGalleryPreview");
    expect(dismissalSource).toContain("closeGalleryPreview");
    expect(dismissalSource).toContain("isAttachmentSheetOpen");
    expect(dismissalSource).toContain("closeAttachmentSheet");
    // When gallery preview is open, back button / Escape dismisses only the preview
    expect(dismissalSource).toMatch(/if\s*\(hasGalleryPreview\s*&&\s*closeGalleryPreview\)\s*\{\s*closeGalleryPreview\(\);\s*return;\s*\}/);
  });

  it("generates uncropped high-quality previews in native MediaLibraryPlugin", () => {
    const nativePluginSource = readFileSync("android/app/src/main/java/com/stakhovivan/stovo/MediaLibraryPlugin.kt", "utf8");
    // Does not perform square center cropping
    expect(nativePluginSource).not.toContain("Bitmap.createBitmap(bitmap, x, y, size, size)");
    expect(nativePluginSource).toContain("ImageDecoder");
    expect(nativePluginSource).toContain("maxDimension = 2048");
  });

  it("fetches full resolution original media for ImageLightbox preview", () => {
    expect(mediaPickerSource).toContain("fetchNativeMediaFileUrl");
    expect(mediaPickerSource).toContain("fullPreviewUrl");
    expect(attachmentSheetSource).toMatch(/imageUrl=\{fullPreviewUrl\s*\|\|\s*nativeMediaPreviewUrl\(previewMediaItem\)\}/);
  });

  it("declares all hooks at top level before conditional return to prevent white screen crashes", () => {
    const [beforeEarlyReturn, afterEarlyReturn] = attachmentSheetSource.split("if (!open) return null;");
    expect(beforeEarlyReturn).toContain("useMediaPicker(open, activeTab, previewMediaItem)");
    expect(mediaPickerSource).toContain("fetchNativeMediaFileUrl");
    expect(afterEarlyReturn).toBeDefined();
    expect(afterEarlyReturn).not.toMatch(/\buse(Effect|LayoutEffect|State|Memo|Callback|Ref)\s*\(/);
  });
});
