import { readCssSource } from "./test/cssSource";
import { parse } from "postcss";
import { expect, it } from "vitest";

it("keeps the root canvas, body and .app-shell pure black so overscroll never reveals a gray band", () => {
  const root = parse(readCssSource("src/styles.css"));
  const lastBackground = (selector: string) => {
    let value: string | undefined;
    root.walkRules((rule) => {
      if (rule.selector.trim() !== selector) return;
      rule.walkDecls(/^background(-color)?$/, (decl) => {
        value = decl.value.trim();
      });
    });
    return value;
  };

  const black = "var(--color-palette-7b2817bf9b80)";
  // :root outranks html, so the last :root background is what paints the overscroll canvas.
  expect(lastBackground(":root")).toBe(black);
  expect(lastBackground("body")).toBe(black);
  expect(lastBackground(".app-shell")).toBe(black);
});
