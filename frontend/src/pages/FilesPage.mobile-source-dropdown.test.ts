import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/FilesPage.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("Storage mobile source dropdown", () => {
  it("renders a mobile-only source selector with grouped source choices and opens closed by default", () => {
    expect(page).toContain('className="storage-mobile-source-picker"');
    expect(page).toContain('aria-haspopup="listbox"');
    expect(page).toContain('className="storage-mobile-source-menu"');
    expect(page).toContain('useState(false)');
    expect(page).toContain('setIsSourceMenuOpen(false)');
    expect(styles).toMatch(/@media \(max-width:\s*1024px\)[\s\S]*\.storage-mobile-source-picker/);
  });

  it("hides the desktop chat source list on mobile so only the dropdown remains", () => {
    expect(styles).toMatch(
      /@media \(max-width:\s*1024px\)[\s\S]*\.storage-page \.storage-source-scroll > \.storage-source[\s\S]*display:\s*none/
    );
    expect(styles).toMatch(
      /@media \(max-width:\s*1024px\)[\s\S]*\.storage-page \.storage-source-scroll > \.storage-source-group[\s\S]*display:\s*none/
    );
  });

  it("keeps file-details close in the header, not over the preview image", () => {
    expect(page).toContain("closeLabel={strings.files.closeDetails}");
    expect(page).not.toContain('className="storage-preview-close"');
    expect(page).not.toContain('aria-label="Close file preview"');
    expect(styles).toMatch(
      /@media \(max-width:\s*1024px\)[\s\S]*\.storage-mobile-detail-header \.mobile-back-button[\s\S]*border-radius:\s*var\(--radius-pill\)/
    );
    expect(styles).toMatch(
      /@media \(max-width:\s*1024px\)[\s\S]*\.storage-page\.has-storage-selection \.storage-details-panel[\s\S]*width:\s*90%/
    );
  });

  it("keeps an AMOLED black storage canvas and a pill source trigger after selection", () => {
    expect(styles).toMatch(/\.storage-page\s*\{[^}]*background:\s*var\(--canvas-amoled/);
    expect(styles).toMatch(
      /@media \(max-width:\s*1024px\)[\s\S]*\.storage-mobile-source-trigger[\s\S]*border-radius:\s*var\(--radius-pill\)/
    );
  });

  it("removes browser-row press motion and matches selected item radius to the menu", () => {
    expect(styles).toMatch(
      /\.storage-mobile-source-trigger:active:not\(:disabled\)[\s\S]*?transform:\s*none/
    );
    expect(styles).toMatch(
      /\.storage-mobile-source-menu button \{[\s\S]*?border-radius:\s*var\(--radius-panel\)/
    );
  });
});
