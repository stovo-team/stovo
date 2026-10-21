import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("renders reaction profile pictures without a border", () => {
  const css = readFileSync("src/styles.css", "utf8");
  const avatar = css.match(/\.reaction-avatar\s*\{([^}]*)\}/)?.[1] ?? "";
  expect(avatar).toMatch(/border:\s*0/);
  expect(avatar).toMatch(/border-radius:\s*var\(--radius-circle\)/);
  const overflowCount = css.match(/\.reaction-avatar-more\s*\{([^}]*)\}/)?.[1] ?? "";
  expect(overflowCount).toContain("font-size: var(--font-size-micro);");
});
