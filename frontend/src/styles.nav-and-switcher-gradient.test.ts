import { readCssSource } from "./test/cssSource";
import { describe, expect, it } from "vitest";

const css = readCssSource("src/styles.css");

describe("brand gradient active states", () => {
  it("applies brand gradient to active space switcher item", () => {
    expect(css).toMatch(/\.server-switcher-item\.is-active[^{]*\{[^}]*background:\s*var\(--color-brand-gradient\) !important/);
    expect(css).toMatch(/\.server-switcher-item\.is-active[^{]*\{[^}]*color:\s*var\(--color-palette-f2074b6cef37\) !important/);
  });

  it("applies brand gradient to active left navigation pill", () => {
    expect(css).toMatch(/\.app-frame > \.app-nav.*a\.active::before\s*\{[^}]*background:\s*var\(--color-brand-gradient\) !important/);
  });

  it("constrains space switcher menu width to fit within chat list", () => {
    expect(css).toMatch(/\.server-switcher-menu\s*\{[^}]*max-width:\s*min\(240px,\s*calc\(100vw - 32px\)\)/);
  });
});
