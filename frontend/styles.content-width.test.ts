import { expect, it } from "vitest";
import { readCssSource } from "./src/test/cssSource";

it("keeps the wide chat list compact, centers the active chat and lets Plans use the full pane", () => {
  const styles = readCssSource("src/styles.css");
  expect(styles).toMatch(/\.messenger-shell \.chat-layout:not\(\.voice-call-expanded\)\s*\{[^}]*grid-template-columns:\s*322px\s*minmax\(0, 1fr\)/);
  expect(styles).toMatch(/\.messenger-shell \.chat-layout:not\(\.voice-call-expanded\)\s*>\s*\.chat-detail\s*\{[^}]*max-width:\s*1400px/);
  expect(styles).toMatch(/\.messenger-shell \.chat-layout:not\(\.voice-call-expanded\)\s*>\s*\.chat-detail\s*\{[^}]*justify-self:\s*center/);
  expect(styles).toMatch(/\.plans-page \.plans-content\s*\{[^}]*max-width:\s*none/);
  expect(styles).toMatch(/\.storage-page \.storage-main \{[^}]*max-width:\s*100%/);
  expect(styles.includes("grid-template-columns: minmax(240px, 280px) minmax(0, 1fr);")).toBe(true);
  expect(styles).toMatch(/\.plans-layout\s*\{[^}]*grid-template-columns:\s*minmax\(220px, var\(--plans-sidebar-width, 300px\)\) 12px minmax\(0, 1fr\)/);
});
