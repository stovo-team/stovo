import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("does not inset document media inside its preview frame", () => {
  const styles = readFileSync("src/styles.css", "utf8");
  const rule = styles.match(/\.storage-page \.storage-preview-media:has\(\.document-preview-card--inline\)\s*\{([^}]+)\}/)?.[1];
  expect(rule).toContain("padding: 0;");
});
