import { readCssSource } from "./src/test/cssSource";
import { expect, it } from "vitest";
const styles = readCssSource("src/styles.css");
it("uses the popup surface for the forwarding modal", () => {
  expect(/\.forward-dialog\s*\{[^}]*background:\s*var\(--chat-popup-surface\)/.test(styles)).toBe(true);
});
it("leaves a visible gap below chat search", () => {
  expect(/\.forward-dialog \.popup-field\s*\{[^}]*margin-bottom:\s*8px;/.test(styles)).toBe(true);
});
