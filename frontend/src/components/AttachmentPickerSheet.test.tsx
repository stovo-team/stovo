import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");
const attachmentSheetSource = readFileSync("src/components/AttachmentPickerSheet.tsx", "utf8");
const mediaPickerSource = readFileSync("src/components/attachment-picker/useMediaPicker.ts", "utf8");
const mediaGridSource = readFileSync("src/components/attachment-picker/MediaGalleryGrid.tsx", "utf8");

describe("AttachmentPickerSheet Android gallery", () => {
  it("uses the translated attachment category catalog instead of hard-coded labels", () => {
    expect(attachmentSheetSource).toContain("strings.attachments.photoOrVideo");
    expect(attachmentSheetSource).toContain("strings.attachments.document");
    expect(attachmentSheetSource).toContain("strings.attachments.music");
    expect(attachmentSheetSource).toContain("strings.attachments.poll");
    expect(attachmentSheetSource).toContain("strings.attachments.checklist");
    expect(attachmentSheetSource).toContain("strings.attachments.canvas");
  });

  it("keeps isolated Gallery, File, Audio, and Poll tabs", () => {
    expect(attachmentSheetSource).toContain('setActiveTab("gallery")');
    expect(attachmentSheetSource).toContain('activeTab === "gallery"');
    expect(attachmentSheetSource).toContain('activeTab === "file"');
    expect(attachmentSheetSource).toContain('activeTab === "audio"');
    expect(attachmentSheetSource).toContain('activeTab === "poll"');
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
    expect(attachmentSheetSource).toContain("placeholder={strings.attachments.message}");
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
    expect(mediaPickerSource).toContain("const category = categoryFor(tab)");
    expect(mediaPickerSource).toContain("addNativeMediaLibraryListener");
    expect(mediaPickerSource).toContain('App.addListener("appStateChange"');
    expect(mediaPickerSource).toContain("category === categoryFor(activeTab)");
  });

  it("observes MediaStore changes so a new photo is loaded while the gallery stays open", () => {
    const nativePluginSource = readFileSync("android/app/src/main/java/com/stakhovivan/stovo/MediaLibraryPlugin.kt", "utf8");
    expect(nativePluginSource).toContain("ContentObserver");
    expect(nativePluginSource).toContain("registerContentObserver(MediaStore.Images.Media.EXTERNAL_CONTENT_URI");
    expect(nativePluginSource).toContain('notifyListeners("mediaLibraryChanged"');
  });

  it("uses the Android audio permission for recent audio and limits recent files to documents", () => {
    const nativePluginSource = readFileSync("android/app/src/main/java/com/stakhovivan/stovo/MediaLibraryPlugin.kt", "utf8");
    expect(nativePluginSource).toContain('hasMediaAccess(category)');
    expect(nativePluginSource).toContain("Manifest.permission.READ_MEDIA_AUDIO");
    expect(nativePluginSource).toContain("MediaStore.Files.FileColumns.MEDIA_TYPE_NONE");
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
    expect(mediaGridSource).toContain("copy.emptyGallery");
    expect(mediaGridSource).toContain("copy.galleryError");
    expect(attachmentSheetSource).toContain("onChooseGallery={() => { onPick(\"gallery\"); closeSheet(); }}");
  });

  it("opens the editor directly on photo thumbnail click and toggles selection on top-right checkbox click", () => {
    expect(attachmentSheetSource).toContain("ImageEditorModal");
    expect(attachmentSheetSource).toContain("onPreview={(item) => void openPhotoEditor(item)}");
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

  it("does not render a redundant close button in the poll and checklist sheet header", () => {
    expect(attachmentSheetSource).toContain('activeTab !== "poll" && activeTab !== "checklist"');
    expect(attachmentSheetSource).toContain("<PopupCloseButton ariaLabel={strings.attachments.closeMenu}");
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

  it("generates uncropped high-quality previews in native MediaLibraryPlugin", () => {
    const nativePluginSource = readFileSync("android/app/src/main/java/com/stakhovivan/stovo/MediaLibraryPlugin.kt", "utf8");
    // Does not perform square center cropping
    expect(nativePluginSource).not.toContain("Bitmap.createBitmap(bitmap, x, y, size, size)");
    expect(nativePluginSource).toContain("ImageDecoder");
    expect(nativePluginSource).toContain("maxDimension = 768");
  });

  it("fetches the full-resolution original before opening the photo editor", () => {
    expect(attachmentSheetSource).toContain("fetchNativeMediaFileUrl(item.id)");
    expect(attachmentSheetSource).toContain("new File([blob], item.name");
  });

  it("declares all hooks at top level before conditional return to prevent white screen crashes", () => {
    const [beforeEarlyReturn, afterEarlyReturn] = attachmentSheetSource.split("if (!open) return null;");
    expect(beforeEarlyReturn).toContain("useMediaPicker(open, activeTab, null)");
    expect(mediaPickerSource).toContain("fetchNativeMediaFileUrl");
    expect(afterEarlyReturn).toBeDefined();
    expect(afterEarlyReturn).not.toMatch(/\buse(Effect|LayoutEffect|State|Memo|Callback|Ref)\s*\(/);
  });

  it("renders an initial gallery batch before loading later batches in the background", () => {
    const nativePluginSource = readFileSync("android/app/src/main/java/com/stakhovivan/stovo/MediaLibraryPlugin.kt", "utf8");
    expect(mediaPickerSource).toContain("INITIAL_BATCH_SIZE = 12");
    expect(mediaPickerSource).toContain("BACKGROUND_BATCH_SIZE = 24");
    expect(mediaPickerSource).toContain("listNativeMedia(category, { limit: INITIAL_BATCH_SIZE })");
    expect(mediaPickerSource).toContain("offset += BACKGROUND_BATCH_SIZE");
    expect(nativePluginSource).not.toContain("OFFSET $offset");
  });
});
