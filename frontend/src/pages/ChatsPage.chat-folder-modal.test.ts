import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");

describe("chat folder dialog styles", () => {
  it("uses solid card background rather than transparent background", () => {
    expect(styles).toContain(".chat-folder-dialog {");
    expect(styles).toMatch(/\.chat-folder-dialog\s*\{[^}]*background:\s*var\(--surface-card/);
    expect(styles).toMatch(/\.chat-folder-dialog\s*\{[^}]*background-color:\s*var\(--surface-card/);
  });

  it("provides fallback definitions for --background-panel and --background-page in :root", () => {
    expect(styles).toContain("--background-panel: var(--surface-card);");
    expect(styles).toContain("--background-page: var(--background-secondary);");
  });

  it("uses solid background for inputs and checkboxes rather than undefined variables", () => {
    expect(styles).toMatch(/\.chat-folder-field input\s*\{[^}]*background:\s*var\(--background-secondary/);
    expect(styles).toMatch(/\.chat-folder-rules input\[type="checkbox"\]\s*\{[^}]*background:\s*var\(--background-secondary/);
  });

  it("enforces safe-area inset and a generous top margin on mobile screens so it is not out of bounds", () => {
    expect(styles).toMatch(/@media \(max-width:\s*768px\)[\s\S]*?\.modal-backdrop\.chat-folder-backdrop\s*\{[\s\S]*?padding-top:\s*max\(calc\(env\(safe-area-inset-top,\s*0px\)\s*\+\s*40px\),\s*64px\);/);
    expect(styles).toMatch(/@media \(max-width:\s*768px\)[\s\S]*?\.modal-backdrop\.chat-folder-backdrop\s*\{[\s\S]*?align-items:\s*flex-start;/);
  });
});
