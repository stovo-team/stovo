import { expect, it } from "vitest";
import { readCssSource } from "./src/test/cssSource";

it("caps the main chat and plans panes while letting Storage use wide screens", () => {
  const styles = readCssSource("src/styles.css");
  const wideScreenRule = styles.match(/@media \(min-width: 1600px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  expect(wideScreenRule).toContain(".messenger-shell .chat-layout:not(.voice-call-expanded) > .chat-detail");
  expect(wideScreenRule).toContain(".plans-page .plans-content");
  expect(wideScreenRule).toContain("max-width: 1200px;");
  expect(wideScreenRule).toContain("justify-self: center;");
  expect(wideScreenRule).toContain("width: 100%;");
  expect(wideScreenRule).not.toContain("storage-main");
  expect(styles).toMatch(/\.storage-page \.storage-main \{[^}]*max-width:\s*100%/);
  expect(styles.includes("grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);")).toBe(true);
  expect(styles).toMatch(/\.plans-layout\s*\{[^}]*grid-template-columns:\s*minmax\(220px, var\(--plans-sidebar-width, 300px\)\) 12px minmax\(0, 1fr\)/);
});
