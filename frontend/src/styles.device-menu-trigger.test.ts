import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps device chevrons plain in idle, expanded and focus states", () => {
  const css = readFileSync("src/styles.css", "utf8");
  const rule = css.match(/\.guest-device-menu-trigger:focus-visible,\s*\.guest-device-menu-trigger:active\s*\{([^}]*)\}/)?.[1] ?? "";
  expect(rule).toMatch(/border:\s*0\s*!important/);
  expect(rule).toMatch(/box-shadow:\s*none\s*!important/);
  expect(rule).toMatch(/outline:\s*none\s*!important/);
});
