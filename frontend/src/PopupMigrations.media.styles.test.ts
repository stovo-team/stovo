import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("media and storage popup shared composition", () => {
  it.each([
    "src/components/AttachmentPickerSheet.tsx",
    "src/components/AvatarEditorModal.tsx",
    "src/components/ChatWallpaperEditorModal.tsx",
    "src/components/ImageEditorModal.tsx",
    "src/components/ImageLightbox.tsx",
    "src/components/MessageEnlargeModal.tsx",
    "src/components/DocumentAttachmentPreview.tsx",
  ])("uses the shared backdrop contract in %s", (path) => {
    expect(source(path)).toMatch(/PopupBackdrop|PopupDialog/);
  });

  it.each([
    "src/components/AttachmentPickerSheet.tsx",
    "src/components/AvatarEditorModal.tsx",
    "src/components/ChatWallpaperEditorModal.tsx",
    "src/components/ImageEditorModal.tsx",
    "src/components/ImageLightbox.tsx",
    "src/components/MessageEnlargeModal.tsx",
    "src/components/DocumentAttachmentPreview.tsx",
  ])("uses the shared close control in %s", (path) => {
    expect(source(path)).toContain("PopupCloseButton");
  });

  it("uses shared controls and shell for storage flows", () => {
    const storage = source("src/components/StorageCollections.tsx");
    expect(storage).toContain("PopupDialog");
    expect(storage).toContain("PopupButton");
    expect(storage).toContain("PopupField");
    expect(storage).toContain("PopupSelect");
    expect(storage).not.toContain("function Modal(");
  });

  it("keeps the attachment picker mobile sheet and fullscreen state", () => {
    const picker = source("src/components/AttachmentPickerSheet.tsx");
    const styles = source("src/styles.css");

    expect(picker).toContain("attachment-picker-sheet tg-style");
    expect(picker).toContain("is-fullscreen");
    expect(styles).toMatch(/\.attachment-picker-sheet\.tg-style\.is-fullscreen\s*\{/);
    expect(styles).toMatch(/\.attachment-picker-sheet\.tg-style\s*\{/);
  });

  it("keeps the message composer and image editor fullscreen geometry", () => {
    const composer = source("src/components/MessageEnlargeModal.tsx");
    const imageEditor = source("src/components/ImageEditorModal.tsx");
    const styles = source("src/styles.css");

    expect(composer).toContain("message-enlarge-modal--fullscreen");
    expect(imageEditor).toContain("image-editor-modal");
    expect(styles).toMatch(/\.message-enlarge-modal\s*\{[^}]*height:\s*100vh/s);
    expect(styles).toMatch(/\.image-editor-modal\s*\{/);
  });
});
