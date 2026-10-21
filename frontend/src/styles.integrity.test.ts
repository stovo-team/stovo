import { readFileSync } from "node:fs";
import { parse } from "postcss";
import { expect, it } from "vitest";

it("parses global styles and keeps independent call, settings and storage rules at the root", () => {
  const css = readFileSync("src/styles.css", "utf8");
  const root = parse(css);
  for (const selector of [
    ".meeting-intel-toggle-btn > svg.lucide-circle",
    ':root:is([data-theme-mode="dark"], [data-theme-mode="amoled"]) .settings-page input[type="time"]::-webkit-calendar-picker-indicator',
    ".storage-page:has(.storage-collection-full-page) .storage-source-collapse",
    ".chat-info-member-row .avatar",
  ]) {
    expect(root.nodes.some(node => node.type === "rule" && node.selector === selector)).toBe(true);
  }
});
