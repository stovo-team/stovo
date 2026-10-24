import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8");

function lastStyleRule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rules = Array.from(css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g")));
  return rules.at(-1)?.[1] ?? "";
}

describe("quick access service row styles", () => {
  it("uses compact rows with plain channel-sized icons", () => {
    const row = lastStyleRule(".quick-access-item.chat-list-item");
    const icon = lastStyleRule(".quick-access-item .quick-access-icon");
    const iconSvg = lastStyleRule(".quick-access-item .quick-access-icon svg");
    const minimizedRow = lastStyleRule(".messenger-shell--minimized-chat-layout .quick-access-item--minimized");
    const minimizedIcon = lastStyleRule(".messenger-shell--minimized-chat-layout .quick-access-item--minimized .quick-access-icon");

    expect(row).toMatch(/grid-template-columns:\s*16px minmax\(0,\s*1fr\)/);
    expect(row).toMatch(/min-height:\s*42px/);
    expect(row).toMatch(/padding:\s*5px 8px/);
    expect(icon).toMatch(/background:\s*transparent !important/);
    expect(icon).toMatch(/border-radius:\s*0/);
    expect(icon).toMatch(/color:\s*var\(--text-muted\) !important/);
    expect(icon).toMatch(/height:\s*16px/);
    expect(icon).toMatch(/width:\s*16px/);
    expect(iconSvg).toMatch(/height:\s*16px/);
    expect(iconSvg).toMatch(/width:\s*16px/);
    expect(minimizedRow).toMatch(/grid-template-columns:\s*16px minmax\(0,\s*1fr\)/);
    expect(minimizedIcon).toMatch(/height:\s*16px/);
    expect(minimizedIcon).toMatch(/width:\s*16px/);
  });
});
