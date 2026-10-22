import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const removalButtonRule = Array.from(stylesheet.matchAll(/\.storage-collection-file-grid \.collection-file-tile > button:not\(\.collection-file-open\) \{[^}]+\}/g))
  .map((match) => match[0])
  .find((rule) => rule.includes("height: 28px !important"));
const rules = [
  stylesheet.match(/(?:^|\n)button \{[^}]+\}/)?.[0],
  removalButtonRule,
];
let styleElement: HTMLStyleElement | null = null;

afterEach(() => {
  styleElement?.remove();
  styleElement = null;
  document.body.innerHTML = "";
});

describe("folder file removal control", () => {
  it("keeps the remove button round despite the global button minimum height", () => {
    expect(rules.every(Boolean)).toBe(true);
    styleElement = document.createElement("style");
    styleElement.textContent = rules.join("\n");
    document.head.appendChild(styleElement);

    const grid = document.createElement("div");
    grid.className = "storage-collection-file-grid";
    const card = document.createElement("article");
    card.className = "collection-file-tile";
    const removeButton = document.createElement("button");
    card.appendChild(removeButton);
    grid.appendChild(card);
    document.body.appendChild(grid);

    const style = getComputedStyle(removeButton);
    expect(style.height).toBe("28px");
    expect(style.width).toBe("28px");
    expect(style.minHeight).toBe("28px");
  });
});
