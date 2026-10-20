import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("rounds the pinned banner completely at all heights", () => {
  const styles = readFileSync("src/styles.css", "utf8");
  expect(styles.match(/\n\.pinned-banner\s*\{([^}]+)\}/)?.[1]).toContain("border-radius: 999px;");
});
it("places the full pinned pill below the floating chat header", () => {
  const styles = readFileSync("src/styles.css", "utf8");
  expect(/\.pinned-banner\s*\{[^}]*margin-top: calc\(var\(--chat-floating-header-overlap\) \+ 8px\);/.test(styles)).toBe(true);
});
