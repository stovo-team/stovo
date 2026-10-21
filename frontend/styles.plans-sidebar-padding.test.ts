import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("aligns the plans sidebar with the content header without extra top inset", () => {
  const styles = readFileSync("src/styles.css", "utf8");
  const rule = styles.match(/\.plans-sidebar \{([^}]+)\}/)?.[1] ?? "";
  expect(rule).toContain("padding-top: 0;");
});
