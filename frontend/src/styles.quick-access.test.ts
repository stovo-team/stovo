import { readCssSource } from "./test/cssSource";
import { describe, expect, it } from "vitest";

const css = readCssSource("src/styles.css");

function lastStyleRule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rules = Array.from(css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g")));
  return rules.at(-1)?.[1] ?? "";
}

describe("quick access service row styles", () => {
  it("uses full chat-row icons by default and compact plain icons when minimized", () => {
    const row = lastStyleRule(".quick-access-item.chat-list-item");
    const icon = lastStyleRule(".quick-access-item .quick-access-icon");
    const iconSvg = lastStyleRule(".quick-access-item .quick-access-icon svg");
    const minimizedRow = lastStyleRule(".messenger-shell--minimized-chat-layout .quick-access-item--minimized");
    const minimizedIcon = lastStyleRule(".messenger-shell--minimized-chat-layout .quick-access-item--minimized .quick-access-icon");
    const minimizedIconSvg = lastStyleRule(".messenger-shell--minimized-chat-layout .quick-access-item--minimized .quick-access-icon svg");

    // Full layout (minimized chat layout off) must match normal chat rows.
    expect(row).toMatch(/grid-template-columns:\s*auto minmax\(0,\s*1fr\)(?:\s*auto)?/);
    expect(row).toMatch(/padding:\s*9px/);
    expect(icon).toMatch(/background:\s*var\(--color-brand-gradient\) !important/);
    expect(icon).toMatch(/border-radius:\s*var\(--radius-circle\)/);
    expect(icon).toMatch(/height:\s*44px/);
    expect(icon).toMatch(/width:\s*44px/);
    expect(iconSvg).toMatch(/height:\s*21px/);
    expect(iconSvg).toMatch(/width:\s*21px/);

    // Minimized layout keeps compact plain channel-sized markers.
    expect(minimizedRow).toMatch(/grid-template-columns:\s*16px minmax\(0,\s*1fr\)/);
    expect(minimizedRow).toMatch(/min-height:\s*42px/);
    expect(minimizedRow).toMatch(/padding:\s*5px 8px/);
    expect(minimizedIcon).toMatch(/background:\s*transparent !important/);
    expect(minimizedIcon).toMatch(/border-radius:\s*0/);
    expect(minimizedIcon).toMatch(/color:\s*var\(--text-muted\) !important/);
    expect(minimizedIcon).toMatch(/height:\s*16px/);
    expect(minimizedIcon).toMatch(/width:\s*16px/);
    expect(minimizedIconSvg).toMatch(/height:\s*16px/);
    expect(minimizedIconSvg).toMatch(/width:\s*16px/);
  });
});
