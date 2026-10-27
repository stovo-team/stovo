import { expect, it } from "vitest";
import { readCssSource } from "./src/test/cssSource";

it("prioritizes the active chat width and lets Plans use the full pane", () => {
  const styles = readCssSource("src/styles.css");
  expect(styles).toMatch(/\.messenger-shell \.chat-layout:not\(\.voice-call-expanded\)\s*\{[^}]*grid-template-columns:\s*minmax\(320px, 1fr\)\s*minmax\(0, min\(1400px, calc\(100% - 320px - var\(--float-panel-gap\)\)\)\)/);
  expect(styles).toMatch(/\.messenger-shell \.chat-layout:not\(\.voice-call-expanded\)\s*>\s*\.chat-detail\s*\{[^}]*max-width:\s*1400px/);
  expect(styles).toMatch(/\.plans-page \.plans-content\s*\{[^}]*max-width:\s*none/);
  expect(styles).toMatch(/\.storage-page \.storage-main \{[^}]*max-width:\s*100%/);
  expect(styles.includes("grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);")).toBe(true);
  expect(styles).toMatch(/\.plans-layout\s*\{[^}]*grid-template-columns:\s*minmax\(220px, var\(--plans-sidebar-width, 300px\)\) 12px minmax\(0, 1fr\)/);
});
