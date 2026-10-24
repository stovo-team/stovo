import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("keeps both filled record dots at the same 12px size", () => {
  const styles = readFileSync("src/styles.css", "utf8");
  const rule = styles.match(/\.meeting-intel-toggle-btn > svg\.lucide-circle\s*\{([^}]+)\}/)?.[1];
  expect(rule).toContain("width: 12px;");
  expect(rule).toContain("height: 12px;");
  expect(rule).toContain("flex: 0 0 12px;");
});
