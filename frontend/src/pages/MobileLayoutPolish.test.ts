import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");

describe("mobile settings and admin layout", () => {
  it("hides keyboard shortcuts from the mobile settings dashboard", () => {
    expect(styles).toMatch(/@media\s*\(max-width:\s*\d+px\)[\s\S]*?\.settings-tile--shortcuts\s*\{[^}]*display:\s*none/);
  });

  it("uses one compact header title size and back button treatment for detail pages", () => {
    expect(styles).toContain(".settings-page .section-title-row .mobile-back-button");
    expect(styles).toContain(".settings-page .appearance-editor-header .mobile-back-button");
    expect(styles).toContain(".stats-page .stats-header .mobile-back-button");
    expect(styles).toMatch(/\.settings-page \.section-title-row h2[\s\S]*?\.stats-page \.stats-header h1[^\{]*\{[^}]*font-size:\s*var\(--font-size-body-large\)/);
  });

  it("keeps mobile section navigation fixed and prevents viewport width overflow", () => {
    expect(styles).toMatch(/\.app-frame:not\(\.has-active-chat\)\s*>\s*\.app-nav\s*\{[^}]*position:\s*fixed/);
    expect(styles).toContain(".app-frame:not(.has-active-chat) > .app-nav");
    expect(styles).toMatch(/\.app-frame:not\(\.has-active-chat\)\s*\{[^}]*overflow-x:\s*clip/);
    expect(styles).toMatch(/\.admin-page \.admin-surface > \*[^\{]*\{[^}]*min-width:\s*0/);
  });

  it("reflows statistics and admin content inside narrow mobile viewports", () => {
    expect(styles).toMatch(/@media\s*\(max-width:\s*\d+px\)[\s\S]*?\.stats-content-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(styles).toContain(".admin-page .admin-surface");
    expect(styles).toContain(".admin-page.admin-detail-page .admin-detail-header,");
    expect(styles).toContain("min-width: 0;");
  });
});
