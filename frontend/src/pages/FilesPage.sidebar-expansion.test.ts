import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("expands the main grid while picking collection files after sources collapse", () => {
  const styles = readFileSync("src/styles.css", "utf8");
  const rule = styles.match(/\.storage-page\.is-collection-picking \.storage-layout\.storage-layout--source-collapsed\s*\{([^}]+)\}/)?.[1];
  expect(rule).toContain("grid-template-columns: 36px minmax(0, 1fr) !important;");
});

it("keeps the collapsed source toggle at its expanded desktop position", () => {
  const styles = readFileSync("src/styles.css", "utf8");
  const rules = [...styles.matchAll(/\.storage-page \.storage-layout\.storage-layout--source-collapsed \.sidebar-collapse-button\s*\{([^}]+)\}/g)];
  expect(rules.at(-1)?.[1]).toContain("left: 300px;");
});
