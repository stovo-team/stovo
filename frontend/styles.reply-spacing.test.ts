import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("separates the reply preview from the composer input", () => {
  const styles = readFileSync("src/styles.css", "utf8");
  expect(styles).toMatch(/\.reply-composer-preview\s*\{[^}]*margin-bottom:\s*10px;/);
});
