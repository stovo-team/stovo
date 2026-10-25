import { readCssSource } from "./src/test/cssSource";
import { expect, it } from "vitest";

it("aligns the plans sidebar with the content header without extra top inset", () => {
  const styles = readCssSource("src/styles.css");
  const rule = styles.match(/\.plans-sidebar \{([^}]+)\}/)?.[1] ?? "";
  expect(rule).toContain("padding-top: 0;");
});
