import { readCssSource } from "../test/cssSource";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylesSource = readCssSource(resolve(process.cwd(), "src/styles.css"));

describe("native mobile chat styling", () => {
  it("shares the mobile-web floating chat chrome on Android", () => {
    expect(stylesSource).toMatch(
      /:root\[data-platform="native"\] \.messenger-shell\.chat-list-view \.chat-sidebar-header[\s\S]*?position:\s*absolute;/
    );
    expect(stylesSource).toMatch(
      /:root\[data-platform="native"\] \.messenger-shell\.chat-list-view \.chat-list[\s\S]*?padding-top:\s*calc\(var\(--web-chat-sidebar-header-height\)/
    );
    expect(stylesSource).toMatch(
      /:root\[data-platform="native"\] \.messenger-shell\.has-active-chat \.message-composer-row[\s\S]*?background:\s*var\(--background-secondary\);/
    );
    expect(stylesSource).toMatch(
      /:root\[data-platform="native"\] \.messenger-shell\.has-active-chat \.chat-detail-header--floating[\s\S]*?background:\s*color-mix\(in oklab, var\(--mobile-glass-surface-strong\) 72%, transparent\);/
    );
    expect(stylesSource).toMatch(
      /:root\[data-platform="native"\] \.pinned-banner[\s\S]*?background:\s*color-mix\(in oklab, var\(--mobile-glass-surface-strong\) 72%, transparent\);/
    );
  });

  it("hides chat rows behind the mobile filter chrome with an opaque black fade", () => {
    expect(stylesSource).toMatch(
      /\.messenger-shell\.chat-list-view \.chat-sidebar-header::after \{[\s\S]*?background:\s*linear-gradient\(to bottom, var\(--color-palette-7b2817bf9b80\) 0%, var\(--color-palette-7b2817bf9b80\) 90%, transparent 100%\);/
    );
    expect(stylesSource).toMatch(
      /\.messenger-shell\.chat-list-view \.chat-sidebar-header \{[\s\S]*?isolation:\s*isolate;/
    );
  });

  it("keeps mobile chat-list side inset tight without soft side shadows", () => {
    expect(stylesSource).toMatch(
      /\.messenger-shell\.chat-list-view \.chat-list \{[\s\S]*?padding:\s*var\(--chat-list-chrome-gap, 16px\) var\(--mobile-page-inset\) var\(--chat-list-bottom-inset\);/
    );
    expect(stylesSource).toMatch(
      /\.messenger-shell\.chat-list-view \.chat-list-filters \.filter-chip \{[\s\S]*?box-shadow:\s*none;/
    );
  });

  it("styles the mobile back button with neutral grey surface instead of accent color tint", () => {
    expect(stylesSource).toMatch(
      /\.messenger-shell\.has-active-chat \.mobile-back-button \{[^{}]*background:\s*var\(--background-tertiary\);/
    );
    expect(stylesSource).toMatch(
      /\.mobile-back-button:hover:not\(:disabled\) \{[^{}]*background:\s*var\(--surface-hover\);/
    );
    expect(stylesSource).not.toMatch(
      /\.mobile-back-button \{[^{}]*background:\s*color-mix\(in oklab, var\(--accent-soft\)/
    );
  });

  it("increases padding-top for quick-access panels and view switcher controls on native mobile", () => {
    expect(stylesSource).toMatch(
      /:root\[data-platform="native"\] \.quick-access-panel[\s\S]*?padding-top:\s*calc\(max\(4px,\s*env\(safe-area-inset-top\)\)\s*\+\s*var\(--chat-floating-header-overlap/
    );
    expect(stylesSource).toMatch(
      /:root\[data-platform="native"\] \.messenger-shell\.has-active-chat \.quick-access-panel-tabs--archive-controls[\s\S]*?margin-top:\s*calc\(max\(4px,\s*env\(safe-area-inset-top\)\)\s*\+\s*var\(--chat-floating-header-overlap/
    );
  });
});
