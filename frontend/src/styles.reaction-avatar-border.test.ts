import { readCssSource } from "./test/cssSource";
import { expect, it } from "vitest";

it("renders reaction profile pictures without a border", () => {
  const css = readCssSource("src/styles.css");
  const avatar = css.match(/\.reaction-avatar\s*\{([^}]*)\}/)?.[1] ?? "";
  expect(avatar).toMatch(/border:\s*0/);
  expect(avatar).toMatch(/border-radius:\s*var\(--radius-circle\)/);
  const overflowCount = css.match(/\.reaction-avatar-more\s*\{([^}]*)\}/)?.[1] ?? "";
  expect(overflowCount).toContain("font-size: var(--font-size-micro);");
  expect(overflowCount).not.toMatch(/font-size:\s*9px;/);
});
