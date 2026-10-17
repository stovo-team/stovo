import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

function rule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? "";
}

describe("Storage and Plans collapsible layout styles", () => {
  it("allows Storage's source picker to collapse while keeping the content column flexible", () => {
    expect(styles.includes(".storage-page .storage-layout.storage-layout--source-collapsed")).toBe(true);
    expect(styles).toMatch(/\.storage-page \.storage-layout\.storage-layout--source-collapsed\s*\{\s*grid-template-columns:\s*52px\s+minmax\(0,\s*1fr\);/);
    expect(styles).toMatch(/\.storage-page:has\(\.storage-tile\.selected\) \.storage-layout\.storage-layout--source-collapsed\s*\{\s*grid-template-columns:\s*52px\s+minmax\(0,\s*1fr\)\s+minmax\(440px,\s*500px\);/);
    expect(rule(".storage-source-sidebar")).toMatch(/min-width:\s*0/);
  });

  it("narrows the Plans event list and reduces the date header height", () => {
    expect(styles.includes(".plans-layout { grid-template-columns: 300px minmax(0, 1fr); }")).toBe(true);
    expect(styles.includes(".plans-layout .plans-header { min-height: 48px; }")).toBe(true);
  });
});
