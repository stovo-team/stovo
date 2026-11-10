import { readCssSource } from "../test/cssSource";
import { describe, expect, it } from "vitest";

const styles = readCssSource("src/styles.css").replace(/\r\n/g, "\n");

describe("mobile app navigation feedback", () => {
  it("shows the selected destination in native layouts at any WebView width", () => {
    expect(styles).toContain(
      ':root[data-platform="native"] .app-frame:not(.has-active-chat) > .app-nav.app-nav--active-variant-a a.active::before'
    );
    expect(styles).toContain(
      ':root[data-platform="native"] .app-frame:not(.has-active-chat) > .app-nav.app-nav--active-variant-a a.active'
    );
  });

  it("clears touch hover and tap flashes while keeping keyboard focus visible", () => {
    expect(styles).toContain(".app-frame > .app-nav a");
    expect(styles).toMatch(/\.app-frame[^{}]*\.app-nav a[^{}]*\{[^}]*-webkit-tap-highlight-color:\s*transparent;/);
    expect(styles).toMatch(/@media\s*\(hover:\s*none\)[\s\S]*?\.app-frame[^{}]*\.app-nav a:not\(\.active\):is\(:hover,\s*:active\)\s*\{[^}]*background:\s*transparent;/);
    expect(styles).toMatch(/\.app-frame[^{}]*\.app-nav a:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent-primary\);/);
  });
});
