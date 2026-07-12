import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");
const rule = (selector: string) => {
  const start = styles.indexOf(`${selector} {`);
  return styles.slice(start, styles.indexOf("}", start));
};

describe("docked emoji picker styles", () => {
  it("preserves category icon sprites and lets the category strip scroll", () => {
    expect(rule(".emoji-picker .epr-cat-btn")).toContain("background-color: transparent;");
    expect(rule(".emoji-picker .epr-cat-btn")).not.toContain("background: transparent;");
    expect(rule(".emoji-picker .epr-category-nav")).toContain("overflow-x: auto;");
  });
});
