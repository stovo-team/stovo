import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps shared speaking borders and avatar rings sharp without a blurred glow", () => {
  const css = readFileSync("src/styles.css", "utf8");
  const speakingRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.includes(".shared-call-stage") && selectors.includes(".is-speaking"));
  expect(speakingRules.length).toBeGreaterThan(0);
  for (const [, , declarations] of speakingRules) {
    const shadow = declarations.match(/box-shadow:\s*([^;]+)/)?.[1];
    if (shadow) expect(shadow).not.toMatch(/0\s+0\s+(?:18|20)px/);
  }
});
