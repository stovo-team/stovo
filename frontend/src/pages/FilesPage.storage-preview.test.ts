import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");

function rule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...styles.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "g"))];
  return matches.map((match) => match[1]).join("\n");
}

describe("storage video preview sizing", () => {
  it("opens the selected file against the right edge with media-sized bounds", () => {
    expect(rule(".storage-page .storage-preview-backdrop")).toContain("place-items: center end;");
    expect(styles).not.toMatch(/\.storage-page:has\(\.storage-tile\.selected\) \.storage-layout\s*\{[^}]*grid-template-columns:[^}]*minmax\(380px/);
    expect(rule(".storage-page .storage-preview-dialog")).toContain("width: fit-content;");
    expect(rule(".storage-page .storage-preview-dialog")).toContain("max-width: calc(100vw - 64px);");
    expect(rule(".storage-page .storage-preview-dialog")).toContain("max-height: calc(100dvh - 64px);");
    expect(rule(".storage-page .storage-preview-frame")).toContain("width: fit-content;");
    expect(rule(".storage-page .storage-preview-media")).toContain("width: fit-content;");
    expect(rule(".storage-page .storage-preview-media")).toContain("max-width: calc(100vw - 112px);");
    expect(rule(".storage-page .storage-mobile-detail-header")).toContain("border-bottom: 0;");
    expect(rule(".storage-page .storage-preview-actions")).toContain("position: absolute;");
    expect(rule(".storage-page .storage-preview-actions .storage-metadata-action")).toContain("width: 100%;");
    expect(rule(".storage-page .storage-preview-actions .storage-metadata-action")).toContain("white-space: nowrap;");
    expect(rule(".storage-page .storage-preview-dialog.is-expanded")).toContain("width: fit-content;");
    expect(rule(".storage-page .storage-preview-dialog.is-expanded")).toContain("height: auto;");
  });

  it("reserves a readable document viewport instead of shrink-wrapping percentage-sized PDF content", () => {
    const documentRule = rule(".storage-page .storage-preview-media:has(.document-preview-card--inline)");
    expect(documentRule).toContain("width: var(--storage-document-width);");
    expect(documentRule).toContain("height: var(--storage-preview-height);");
    expect(rule(".storage-page .storage-preview-frame:has(.document-preview-card--inline)")).toContain("padding: 68px 16px 16px;");
  });

  it("reserves room for controls on audio and unsupported file previews", () => {
    expect(rule(".storage-page .storage-preview-media:not(:has(> img, > .video-player, .document-preview-card--inline))")).toContain("width: var(--storage-document-width);");
  });

  it("fits video and image previews inside a shared bounded media area", () => {
    expect(rule(".storage-page .storage-preview-media:has(> .video-player)")).toContain("width: fit-content;");
    expect(rule(".storage-page .storage-preview-media > .video-player")).toContain("max-width: 100%;");
    expect(rule(".storage-page .storage-preview-media > .video-player")).toContain("height: auto;");
    expect(rule(".storage-page .storage-preview-media > img")).toContain("object-fit: contain;");
    expect(rule(".storage-page .storage-preview-media > img")).toContain("max-height: min(64dvh, 720px);");
    expect(rule(".storage-page .storage-preview-media > img")).toContain("width: auto;");
    expect(rule(".video-player-controls")).toContain("grid-template-columns: 44px minmax(72px, 1fr) auto 44px 44px;");
  });

  it("places the source collapse arrow as a translucent fixed overlay", () => {
    expect(rule(".sidebar-collapse-button")).toContain("opacity: .35;");
    expect(rule(".sidebar-collapse-button")).toContain("position: absolute;");
    expect(rule(".sidebar-collapse-button")).toContain("top: 50%;");
    expect(rule(".sidebar-collapse-button")).toContain("transform: translateY(-50%);");
  });

  it("shows premium grouping controls as unavailable", () => {
    expect(rule(".storage-page .storage-setting-option:disabled")).toContain("opacity: 0.5;");
    expect(rule(".storage-page .storage-setting-option:disabled")).toContain("cursor: not-allowed;");
    expect(rule(".storage-page .storage-setting-option:disabled .premium-badge")).toContain("color: var(--text-secondary);");
  });

  it("constrains the search field beside the settings action", () => {
    expect(rule(".storage-page .storage-search")).toContain("max-width: 520px;");
    expect(rule(".storage-page .storage-search-settings")).toContain("flex: 0 0 auto;");
  });

  it("renders Markdown documents on a plain surface", () => {
    expect(rule(".storage-page .storage-preview .canvas-preview-fade")).toContain("display: none;");
    expect(rule(".storage-page .storage-preview .document-preview-card--inline")).toContain("background: transparent;");
    expect(rule(".storage-page .storage-preview .document-preview-card--inline .document-preview-header")).toContain("display: none;");
    expect(rule(".storage-page .storage-preview-media:has(.document-preview-card--inline[data-preview-kind=\"text\"])")).toContain("background: transparent;");
  });
});
