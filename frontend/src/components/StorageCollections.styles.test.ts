import { readCssSource } from "../test/cssSource";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const stylesheet = readCssSource(resolve(process.cwd(), "src/styles.css"));
const storageGridRules = Array.from(stylesheet.matchAll(/\.storage-page \.storage-grid\s*\{[^}]+\}/g)).map((match) => match[0]);
const mobileStorageGridRules = Array.from(stylesheet.matchAll(/@media \(max-width: 767px\) \{[\s\S]*?\.storage-page \.storage-grid\s*\{([^}]+)\}/g)).map((match) => match[1]);
const removalButtonRule = Array.from(stylesheet.matchAll(/\.storage-collection-file-grid \.collection-file-tile > button:not\(\.collection-file-open\) \{[^}]+\}/g))
  .map((match) => match[0])
  .find((rule) => rule.includes("height: 28px !important"));
const emptyCollectionRules = Array.from(stylesheet.matchAll(/\.storage-collection-full-page:has\(\.storage-collection-empty\)\s*\{[^}]+\}|\.storage-collection-full-page > \.storage-collection-file-grid:has\(\.storage-collection-empty\)\s*\{[^}]+\}/g))
  .map((match) => match[0]);
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

describe("storage file tile sizing", () => {
  it("keeps fixed 180px file tiles in desktop and tablet layouts", () => {
    expect(storageGridRules.length).toBeGreaterThan(0);
    expect(storageGridRules.some((rule) => rule.includes("repeat(auto-fill, 180px)"))).toBe(true);
  });

  it("uses fixed 120px file tiles in a two-column mobile grid", () => {
    expect(mobileStorageGridRules.length).toBeGreaterThan(0);
    expect(mobileStorageGridRules.at(-1)).toContain("repeat(auto-fill, 120px)");
  });
});

describe("empty full-page collection state", () => {
  it("centers the empty message in the available page area", () => {
    const rules = emptyCollectionRules.join("\n");
    expect(rules).toContain("display: flex");
    expect(rules).toContain("flex-direction: column");
    expect(rules).toContain("flex: 1");
    expect(rules).toContain("align-items: center");
    expect(rules).toContain("justify-content: center");
  });
});

describe("open collection header layout", () => {
  const headerRule = stylesheet.match(/\.storage-collection-full-header\s*\{([^}]+)\}/)?.[1] ?? "";
  const customCoverRule = stylesheet.match(/\.storage-custom-cover\s*\{([^}]+)\}/)?.[1] ?? "";

  it("stretches across the content width so Back and actions sit at opposite edges", () => {
    expect(headerRule).toMatch(/width:\s*100%/);
    expect(headerRule).toMatch(/box-sizing:\s*border-box/);
  });

  it("keeps the custom folder SVG white on its colored cover", () => {
    expect(customCoverRule).toMatch(/color:\s*var\(--color-palette-f2074b6cef37\)/);
  });
});

describe("Storage collection creation dialog layout", () => {
  const createDialogRule = stylesheet.match(/\.storage-collection-create\s*\{([^}]+)\}/)?.[1] ?? "";
  const createActionsRule = stylesheet.match(/\.storage-collection-create-actions\s*\{([^}]+)\}/)?.[1] ?? "";

  it("leaves room for the type menu and aligns Create to the bottom", () => {
    expect(createDialogRule).toMatch(/min-height:\s*(4[1-9]\d|[5-9]\d\d)px/);
    expect(createDialogRule).toMatch(/grid-template-rows:\s*auto\s+auto\s+auto\s+auto\s+1fr\s+auto/);
    expect(createActionsRule).toMatch(/align-self:\s*end/);
    expect(createActionsRule).toMatch(/justify-self:\s*end/);
    expect(stylesheet).toMatch(/:root\[data-brand-gradient="custom"\][\s\S]*?\.chat-folder-actions \.popup-button--primary[\s\S]*?background:\s*var\(--color-brand-gradient\)/);
  });
});
