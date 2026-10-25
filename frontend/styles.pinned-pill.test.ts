import { readCssSource } from "./src/test/cssSource";
import { expect, it } from "vitest";

it("rounds the pinned banner completely at all heights", () => {
  const styles = readCssSource("src/styles.css");
  expect(styles.match(/\n\.pinned-banner\s*\{([^}]+)\}/)?.[1]).toContain("border-radius: var(--radius-pill);");
});
it("places the full pinned pill below the floating chat header", () => {
  const styles = readCssSource("src/styles.css");
  expect(/\.pinned-banner\s*\{[^}]*margin-top: calc\(var\(--chat-floating-header-overlap\) \+ 8px\);/.test(styles)).toBe(true);
});
