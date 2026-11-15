import { resolve } from "node:path";
import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { readCssSource } from "../test/cssSource";

const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));

// Selectors that match the root <main class="app-shell app-frame ..."> of each page.
const PAGE_ROOTS = [
  ".storage-page",
  ".storage-page.app-frame",
  ".plans-page",
  ".plans-page.app-frame",
  ".settings-page",
  ".settings-page.app-frame",
  ".admin-page",
  ".admin-page.app-frame",
];

function rootBackgroundOverrides() {
  const found: string[] = [];
  postcss.parse(styles).walkRules((rule) => {
    const selectors = rule.selectors.map((selector) => selector.trim());
    if (!selectors.some((selector) => PAGE_ROOTS.includes(selector))) return;
    rule.walkDecls(/^background(-color|-image)?$/, (decl) => {
      if (decl.value.replace(/\s*!important/, "") === "var(--messages-panel-background)") return;
      found.push(`${rule.selector} { ${decl.prop}: ${decl.value} }`);
    });
  });
  return found;
}

describe("Page wallpapers", () => {
  it("lets the wallpaper from .app-frame show on Storage, Plans, Settings and Admin pages", () => {
    expect(rootBackgroundOverrides()).toEqual([]);
  });
});
