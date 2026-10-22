import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("caps only the main chat, storage, and plans panes on large screens", () => {
  const styles = readFileSync("src/styles.css", "utf8");
  const selector = ".messenger-shell .chat-layout:not(.voice-call-expanded) > .chat-detail,\n  .storage-page .storage-main,\n  .plans-page .plans-content";
  const start = styles.indexOf(selector);
  const rule = start < 0 ? "" : styles.slice(start, styles.indexOf("}", start));
  expect(rule).toContain("max-width: 1200px;");
  expect(rule).toContain("justify-self: center;");
  expect(rule).toContain("width: 100%;");
  expect(rule).not.toContain("sidebar");
  expect(styles.includes("grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);")).toBe(true);
  expect(styles).toMatch(/\.plans-layout\s*\{[^}]*grid-template-columns:\s*minmax\(220px, var\(--plans-sidebar-width, 300px\)\) 12px minmax\(0, 1fr\)/);
});
