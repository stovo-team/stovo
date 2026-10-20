import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps photo folder remove controls above the caption overlay", () => {
  const styles = readFileSync("src/styles.css", "utf8");
  const photoButton = styles.match(/\.storage-collection-file-grid \.collection-file-tile:has\(> img\) > button\s*\{([^}]+)\}/)?.[1];
  expect(photoButton).toContain("z-index: 3;");
});

it("keeps the close control visible and operable without hover", () => {
  const styles = readFileSync("src/styles.css", "utf8");
  const rule = styles.match(/\.storage-collection-file-grid \.collection-file-tile > button\s*\{([^}]+)\}/g)?.at(-1) ?? "";
  expect(rule).toContain("opacity: 1;");
  expect(rule).toContain("pointer-events: auto;");
});
