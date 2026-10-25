import { readCssSource } from "./test/cssSource";
import { describe, expect, it } from "vitest";

const styles = readCssSource("src/styles.css");
const tokens = readCssSource("src/design-system/tokens.css");

const rule = (selector: string, from = 0) => {
  const start = styles.indexOf(`${selector} {`, from);
  return styles.slice(start, styles.indexOf("}", start));
};

const lastRule = (selector: string) => rule(selector, styles.lastIndexOf(`${selector} {`));

describe("shared application scrollbars", () => {
  it("uses the chat scrollbar treatment for every default scroll container", () => {
    expect(rule(":where(*)")).toContain("scrollbar-color: var(--border-default) transparent;");
    expect(rule(":where(*)")).toContain("scrollbar-width: thin;");
    expect(rule(":where(*)")).toContain("scrollbar-width: 1px;");
    expect(rule(":where(*)::-webkit-scrollbar")).toContain("height: var(--scrollbar-size);");
    expect(rule(":where(*)::-webkit-scrollbar")).toContain("width: var(--scrollbar-size);");
    expect(rule(":where(*)::-webkit-scrollbar-thumb")).toContain("border-radius: var(--radius-pill);");
    expect(tokens).toContain("--scrollbar-size: 1px;");
  });

  it("retains explicit opt-outs for intentionally hidden scrollers", () => {
    expect(lastRule(".filter-chip-row")).toContain("scrollbar-width: none;");
    expect(lastRule(".filter-chip-row::-webkit-scrollbar")).toContain("display: none;");
  });

  it("hides scrollbars across the board in the mobile application", () => {
    expect(styles).toMatch(/:root\[data-platform="native"\][\s\S]*?scrollbar-width:\s*none\s*!important;/);
    expect(styles).toMatch(/:root\[data-platform="native"\][\s\S]*?display:\s*none\s*!important;/);
    expect(styles).toMatch(/@media \(hover: none\) and \(pointer: coarse\) \{[\s\S]*?scrollbar-width:\s*none;/);
  });
});

