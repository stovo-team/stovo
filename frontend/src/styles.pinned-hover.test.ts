import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("lets the pinned-message action cover the full banner for hover and click", () => {
  const css = readFileSync("src/styles.css", "utf8");
  const banner = css.match(/^\.pinned-banner\s*\{([^}]*)\}/m)?.[1] ?? "";
  const action = css.match(/\.pinned-banner-click-area\s*\{([^}]*)\}/)?.[1] ?? "";
  expect(banner).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
  expect(banner).toMatch(/padding:\s*0;/);
  expect(action).toMatch(/min-height:\s*48px/);
  expect(action).toMatch(/border-radius:\s*inherit/);
});
