import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8");
const ruleFor = (selector: string) => {
  const matches = [...css.matchAll(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, "g"))];
  return matches.at(-1)?.[1] ?? "";
};
const lastBlockStartingWith = (selector: string) => {
  const start = css.lastIndexOf(selector);
  const open = css.indexOf("{", start);
  return start < 0 || open < 0 ? "" : css.slice(open + 1, css.indexOf("}", open));
};

it("keeps device chevrons plain in idle, expanded and pointer interaction states", () => {
  const rule = lastBlockStartingWith(".guest-device-menu-trigger,\n.guest-device-menu-trigger:hover,");
  expect(rule).toMatch(/background:\s*transparent\s*!important/);
  expect(rule).toMatch(/border:\s*0\s*!important/);
  expect(rule).toMatch(/box-shadow:\s*none\s*!important/);
  expect(rule).not.toMatch(/outline:\s*none\s*!important/);
});

it("matches shared device dropdowns to the device button surface", () => {
  const rule = lastBlockStartingWith(".shared-call-controls .guest-device-menu-trigger,");
  expect(rule).toMatch(/background:\s*var\(--surface-raised\)\s*!important/);
  expect(rule).toMatch(/border:\s*0\s*!important/);
});

it("removes the divider beside plain device-menu chevrons", () => {
  const rule = ruleFor(String.raw`\.guest-device-select:has\(> \.guest-device-menu-trigger\)`);
  expect(rule).toMatch(/border-left:\s*0/);
});

it("removes the right edge beside guest device selectors", () => {
  const rule = ruleFor(String.raw`\.guest-call-controls \.guest-device-control`);
  expect(rule).toMatch(/border-right:\s*0/);
});

it("keeps keyboard focus visible on device-menu chevrons", () => {
  const rule = ruleFor(String.raw`\.guest-device-menu-trigger:focus-visible`);
  expect(rule).toMatch(/outline:\s*2px solid var\(--focus-ring\)/);
});
