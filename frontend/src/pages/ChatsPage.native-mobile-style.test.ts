import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylesSource = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

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
});
