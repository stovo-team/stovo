import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const styles = readFileSync("src/styles.css", "utf8");
it("centers the last card of an incomplete two-column participant row", () => {
  const start = styles.indexOf('.voice-grid--4 > .voice-participant-card:last-child:nth-child(odd),');
  expect(start).toBeGreaterThan(-1);
  const rule = styles.slice(start, styles.indexOf("}", start));
  expect(rule).toContain("grid-column: 1 / -1;");
  expect(rule).toContain("justify-self: center;");
  expect(rule).toContain("width: calc((100% - 12px) / 2);");
});
it("centers one or two cards in the last three-column row", () => {
  expect(styles).toContain('.voice-grid--9 > .voice-participant-card:last-child:nth-child(3n + 1)');
  expect(styles).toContain('grid-column: 2;');
  expect(styles).toContain('transform: translateX(calc(50% + 6px));');
});
