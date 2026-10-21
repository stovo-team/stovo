import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const styles = readFileSync("src/styles.css", "utf8");
it("uses the popup surface for the forwarding modal", () => {
  expect(/\.forward-dialog\s*\{[^}]*background:\s*var\(--chat-popup-surface\)/.test(styles)).toBe(true);
});
it("leaves a visible gap below chat search", () => {
  expect(/\.forward-dialog \.popup-field\s*\{[^}]*margin-bottom:\s*8px;/.test(styles)).toBe(true);
});
