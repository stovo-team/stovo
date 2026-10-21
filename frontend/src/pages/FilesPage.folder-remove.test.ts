import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps photo folder remove controls above the caption overlay", () => {
  const styles = readFileSync("src/styles.css", "utf8");
  const photoButton = styles.match(/\.storage-collection-file-grid \.collection-file-tile:has\(> img\) > button:not\(\.collection-file-open\)\s*\{([^}]+)\}/)?.[1];
  expect(photoButton).toContain("z-index: 6;");
});

it("keeps the close control visible and operable without hover", () => {
  const styles = readFileSync("src/styles.css", "utf8");
  const rule = [...styles.matchAll(/\.storage-collection-file-grid \.collection-file-tile > button:not\(\.collection-file-open\)\s*\{([^}]+)\}/g)]
    .map((match) => match[1])
    .find((declarations) => declarations.includes("opacity:")) ?? "";
  expect(rule).toContain("opacity: 1;");
  expect(rule).toContain("pointer-events: auto;");
});
