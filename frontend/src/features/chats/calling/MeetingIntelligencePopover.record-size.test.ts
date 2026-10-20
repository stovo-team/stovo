import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("keeps the filled record dot small inside its circular action", () => {
  const styles = readFileSync("src/styles.css", "utf8");
  const rule = styles.match(/\.meeting-intel-toggle-btn > svg\.lucide-circle\s*\{([^}]+)\}/)?.[1];
  expect(rule).toContain("width: 10px;");
  expect(rule).toContain("height: 10px;");
  expect(rule).toContain("flex: 0 0 10px;");
});
