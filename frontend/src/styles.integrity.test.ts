import { readFileSync } from "node:fs";
import { parse } from "postcss";
import { expect, it } from "vitest";

it("parses global styles and keeps the final voice-grid rule at the root", () => {
  const css = readFileSync("src/styles.css", "utf8");
  const root = parse(css);
  expect(root.nodes.some(node => node.type === "rule" && node.selector.includes(".voice-grid--9 > .voice-participant-card:last-child:nth-child(3n + 2)"))).toBe(true);
});
