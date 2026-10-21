import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const styles = readFileSync("src/styles.css", "utf8");
const rule = (selector: string) => { const start = styles.indexOf(`${selector} {`); return styles.slice(start, styles.indexOf("}", start)); };
it("matches document message width and preview aspect ratio", () => {
  expect(rule(".message-bubble:has(.canvas-card-bubble)")).toContain("width: min(560px, calc(100vw - 48px));");
  expect(rule(".canvas-card-bubble")).toContain("max-width: 100%;");
  expect(rule(".canvas-card-bubble-preview")).toContain("aspect-ratio: 16 / 9;");
  expect(rule(".canvas-card-bubble-preview")).toContain("min-height: 0;");
});
