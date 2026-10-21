import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parse } from "postcss";
const styles = readFileSync("src/styles.css", "utf8");
const rule = (selector: string) => {
  const start = styles.indexOf(`${selector} {`);
  return start < 0 ? "" : styles.slice(start, styles.indexOf("}", start));
};
it("parses the complete stylesheet after the logout hover rules", () => {
  expect(() => parse(styles)).not.toThrow();
});

it("keeps logout hover and keyboard focus on the destructive red palette", () => {
  const row = rule(".app-frame .logout-row:is(:hover, :focus-visible)");
  expect(row).toContain("var(--danger)");
  expect(rule(".app-frame > .app-nav .app-nav-logout:is(:hover, :focus-visible)::before")).toContain("var(--danger)");
});
