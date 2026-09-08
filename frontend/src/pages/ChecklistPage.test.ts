import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/ChecklistPage.tsx", "utf8");
const styles = readFileSync("src/styles.css", "utf8");

describe("ChecklistPage surface layout", () => {
  it("uses the page-surface checklist-page-surface classes", () => {
    expect(source).toContain('className="page-surface checklist-page-surface"');
  });

  it("limits width and centers checklist-page-surface for large screens", () => {
    expect(styles).toMatch(/\.checklist-page-surface\s*\{[^}]*max-width:\s*860px;/);
    expect(styles).toMatch(/\.checklist-page-surface\s*\{[^}]*margin:\s*0 auto;/);
    expect(styles).not.toMatch(/\.checklist-page-surface\s*\{[^}]*max-width:\s*100%\s*!important;/);
  });

  it("removes the hover effect on the add item button", () => {
    expect(styles).not.toMatch(/\.checklist-add-item-btn:hover\s*\{[^}]*background:\s*color-mix/);
    expect(styles).toMatch(/\.checklist-add-item-btn:hover\s*\{[^}]*background:\s*transparent\s*!important;/);
    expect(styles).toMatch(/\.checklist-add-item-btn:hover\s*\{[^}]*color:\s*var\(--text-secondary\)\s*!important;/);
  });

  it("does not prefix section title with #", () => {
    expect(source).toContain('<span className="checklist-section-title">{sectionName}</span>');
    expect(source).not.toContain('<span className="checklist-section-title">#{sectionName}</span>');
  });
});

