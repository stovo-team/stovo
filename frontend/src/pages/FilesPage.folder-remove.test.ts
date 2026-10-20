import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps photo folder remove controls above the caption overlay", () => {
  const styles = readFileSync("src/styles.css", "utf8");
  const photoButton = styles.match(/\.storage-collection-file-grid \.collection-file-tile:has\(> img\) > button\s*\{([^}]+)\}/)?.[1];
  expect(photoButton).toContain("z-index: 3;");
});
