import { readCssSource } from "../test/cssSource";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));

function rule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...styles.matchAll(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, "g"))];
  return matches.map((match) => match[1]).join("\n");
}

describe("Storage and Plans collapsible layout styles", () => {
  it("allows Storage's source picker to collapse while keeping the content column flexible", () => {
    expect(styles.includes(".storage-page .storage-layout.storage-layout--source-collapsed")).toBe(true);
    expect(styles).toMatch(/\.storage-page \.storage-layout\.storage-layout--source-collapsed\s*\{[^}]*grid-template-columns:\s*36px\s+minmax\(0,\s*1fr\);/);
    expect(styles).toMatch(/\.storage-page:has\(\.storage-tile\.selected\) \.storage-layout\.storage-layout--source-collapsed\s*\{[^}]*grid-template-columns:\s*36px\s+minmax\(0,\s*1fr\);/);
    expect(styles).toContain(".storage-page .storage-layout.storage-layout--source-collapsed .sidebar-collapse-button { left: 0; }");
    expect(rule(".storage-source-sidebar")).toMatch(/min-width:\s*0/);
  });

  it("narrows the Plans event list and reduces the date header height", () => {
    expect(styles.includes(".plans-layout { grid-template-columns: 300px minmax(0, 1fr); }")).toBe(true);
    expect(styles).toContain(".plans-layout--sidebar-collapsed { column-gap: 16px; grid-template-columns: 36px minmax(0, 1fr); }");
    expect(styles.includes(".plans-layout .plans-header { min-height: 48px; }")).toBe(true);
  });

  it("shares one vertically centered divider control across both pages", () => {
    const button = rule(".sidebar-collapse-button");
    expect(button).toContain("left: 100%;");
    expect(button).toContain("top: 50%;");
    expect(button).toContain("transform: translateY(-50%);");
    expect(styles).toContain(".storage-page .storage-layout.storage-layout--source-collapsed .sidebar-collapse-button { left: 0; right: auto; }");
    expect(styles).toContain(".plans-layout--sidebar-collapsed .sidebar-collapse-button { left: 0; right: auto; }");
  });

  it("lets the Storage search fill its toolbar and carries the page to the viewport bottom", () => {
    expect(rule(".storage-page .storage-search-tools")).toContain("max-width: none;");
    expect(rule(".storage-page .storage-search")).toContain("max-width: none;");
    expect(styles).toContain(".storage-page.app-frame { padding-bottom: 0; }");
    expect(styles).toContain(".storage-page .storage-layout {\n    height: calc(100dvh - var(--float-outer-gap));");
  });
});
