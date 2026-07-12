import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");
const chatsPage = readFileSync("src/pages/ChatsPage.tsx", "utf8");
const rule = (selector: string) => {
  const start = styles.indexOf(`${selector} {`);
  return styles.slice(start, styles.indexOf("}", start));
};

describe("docked emoji picker styles", () => {
  it("preserves category icon sprites and lets the category strip scroll", () => {
    expect(rule(".emoji-picker .epr-cat-btn")).toContain("background-color: transparent;");
    expect(rule(".emoji-picker .epr-cat-btn")).not.toContain("background: transparent;");
    expect(rule(".emoji-picker .epr-cat-btn")).toContain("min-height: var(--epr-category-navigation-button-size);");
    expect(rule(".emoji-picker .epr-cat-btn.epr-active")).toContain("background-color:");
    expect(rule(".emoji-picker .epr-cat-btn.epr-active")).not.toContain("background:");
    expect(rule(".emoji-picker .epr-category-nav")).toContain("overflow-x: auto;");
  });

  it("uses the picker's own dark sprite theme", () => {
    expect(chatsPage).toContain('theme={resolvedThemeMode === "light" ? Theme.LIGHT : Theme.DARK}');
    expect(styles).not.toContain(':root[data-theme-mode="dark"] .emoji-picker .epr-cat-btn');
  });
});
