import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("hides the source sidebar toggle while a full-page folder is open", () => {
  const styles = readFileSync("src/styles.css", "utf8");
  const rule = styles.match(/\.storage-page:has\(\.storage-collection-full-page\) \.storage-source-collapse\s*\{([^}]+)\}/)?.[1];
  expect(rule).toContain("display: none;");
});
