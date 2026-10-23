import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

function rule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...styles.matchAll(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, "g"))];
  return matches.map((match) => match[1]).join("\n");
}

describe("Storage collapse and Plans resize layout styles", () => {
  it("allows Storage's source picker to collapse while keeping the content column flexible", () => {
    expect(styles).toMatch(/\.storage-page \.storage-layout:not\(\.storage-layout--source-collapsed\)\s*\{[^}]*grid-template-columns:\s*var\(--storage-source-width, 300px\) 12px minmax\(0,\s*1fr\);/);
    expect(styles).toMatch(/\.storage-page \.storage-layout\.storage-layout--source-collapsed\s*\{[^}]*grid-template-columns:\s*24px 12px minmax\(0,\s*1fr\);/);
    expect(styles).toMatch(/\.storage-page:has\(\.storage-tile\.selected\) \.storage-layout\.storage-layout--source-collapsed\s*\{[^}]*grid-template-columns:\s*24px 12px minmax\(0,\s*1fr\);/);
    expect(styles).toMatch(/\.storage-source-resizer\s*\{[^}]*cursor:\s*col-resize/);
    expect(rule(".storage-source-sidebar")).toMatch(/min-width:\s*0/);
  });

  it("sets a resizable Plans event list and a 12px divider", () => {
    expect(styles).toMatch(/\.plans-layout\s*\{[^}]*grid-template-columns:\s*minmax\(220px, var\(--plans-sidebar-width, 300px\)\) 12px minmax\(0, 1fr\)/);
    expect(styles.includes(".plans-layout .plans-header { min-height: 48px; }")).toBe(true);
  });

  it("keeps the Plans resize handle invisible and styles its collapsed expand button brightly", () => {
    const plansSource = readFileSync(resolve(process.cwd(), "src/pages/PlansPage.tsx"), "utf8");
    const button = rule(".sidebar-collapse-button");
    expect(button).toContain("left: 100%;");
    expect(button).toContain("top: 50%;");
    expect(button).toContain("transform: translateY(-50%);");
    expect(styles).toMatch(/\.storage-page \.storage-layout\.storage-layout--source-collapsed \.storage-source-collapse\s*\{[^}]*left:\s*50%;[^}]*top:\s*50%;[^}]*transform:\s*translate\(-50%,\s*-50%\);/);
    expect(styles).toMatch(/\.plans-sidebar-resizer\s*\{[^}]*cursor:\s*col-resize;[^}]*touch-action:\s*none/);
    expect(plansSource).toContain('role="separator"');
    expect(plansSource).toContain("SidebarCollapseButton");
    expect(styles).toMatch(/\.plans-layout\.plans-layout--sidebar-collapsed\s*\{[^}]*grid-template-columns:\s*36px 12px minmax\(0,\s*1fr\)/);
    expect(styles).toMatch(/\.plans-layout--sidebar-collapsed \.plans-sidebar-collapse\s*\{[^}]*background:\s*var\(--accent-primary\);[^}]*opacity:\s*1;/);
    expect(styles).toContain(".plans-layout--sidebar-collapsed > .plans-sidebar-resizer { cursor: default; pointer-events: none; }");
  });

  it("keeps the collapsed Storage page full width and its toggle clear of section headings", () => {
    expect(styles).toMatch(/\.storage-page \.storage-layout\.storage-layout--source-collapsed\s*\{[^}]*max-width:\s*none/);
    expect(rule(".storage-page .sidebar-collapse-button")).toContain("opacity: 1;");
    expect(styles).toContain(".storage-page .sidebar-collapse-button:hover { opacity: 1; }");
  });

  it("keeps the Storage arrow centered, bright, and desktop-only", () => {
    const button = rule(".storage-page .storage-layout.storage-layout--source-collapsed .storage-source-collapse");
    expect(button).toContain("height: 24px;");
    expect(button).toContain("min-height: 24px;");
    expect(button).toContain("width: 24px;");
    expect(button).toContain("background: var(--accent-primary);");
    expect(styles).toMatch(/@media \(max-width:\s*1024px\)[\s\S]*?\.storage-page \.storage-source-collapse\s*\{[^}]*display:\s*none/);
    expect(styles).toContain(".sidebar-collapse-button[hidden] { display: none !important; }");
  });

  it("keeps Storage cards fixed-size and the page full-width", () => {
    expect(styles).toMatch(/\.storage-page \.storage-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*180px\)/);
    expect(styles).toMatch(/\.storage-page \.storage-layout:not\(\.storage-layout--source-collapsed\)\s*\{[^}]*max-width:\s*none/);
  });

  it("lets the Storage search fill its toolbar and carries the page to the viewport bottom", () => {
    expect(rule(".storage-page .storage-search-tools")).toContain("max-width: none;");
    expect(rule(".storage-page .storage-search")).toContain("max-width: none;");
    expect(styles).toContain(".storage-page.app-frame { padding-bottom: 0; }");
    expect(styles).toContain(".storage-page .storage-layout {\n    height: calc(100dvh - var(--float-outer-gap));");
  });
});
