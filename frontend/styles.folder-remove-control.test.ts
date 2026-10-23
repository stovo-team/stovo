import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8");
const rule = css.match(/\.storage-collection-file-grid \.collection-file-tile:has\(>\s*img\) > button:not\(\.collection-file-open\)\s*\{([^}]*)\}/)?.[1] ?? "";

it("keeps photo removal controls above the preview overlay and caption", () => {
  expect(rule).toContain("z-index: 6");
});
