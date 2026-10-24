import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");
const popupStyles = readFileSync("src/components/ui/Popup.css", "utf8");

describe("chat folder dialog styles", () => {
  it("uses solid card background rather than transparent background", () => {
    expect(styles).toContain(".popup-dialog.chat-folder-layout {");
    expect(popupStyles).toContain("background: var(--surface-card);");
  });

  it("provides fallback definitions for --background-panel and --background-page in :root", () => {
    expect(styles).toContain("--background-panel: var(--surface-card);");
    expect(styles).toContain("--background-page: var(--background-secondary);");
  });

  it("uses solid background for inputs and checkboxes rather than undefined variables", () => {
    expect(styles).toMatch(/\.chat-folder-rules input\[type="checkbox"\]\s*\{[^}]*background:\s*var\(--background-secondary/);
  });

  it("enforces safe-area inset and a generous top margin on mobile screens so it is not out of bounds", () => {
    expect(styles).toMatch(/@media \(max-width:\s*768px\)[\s\S]*?\.popup-backdrop\.chat-folder-backdrop\s*\{[\s\S]*?padding-top:\s*max\(calc\(env\(safe-area-inset-top,\s*0px\)\s*\+\s*40px\),\s*64px\);/);
    expect(styles).toMatch(/@media \(max-width:\s*768px\)[\s\S]*?\.popup-backdrop\.chat-folder-backdrop\s*\{[\s\S]*?align-items:\s*flex-start;/);
  });

  it("contains scrollbar within chat-folder-body so it does not poke outside dialog rounded corners", () => {
    expect(popupStyles).toMatch(/\.popup-dialog\s*\{[^}]*overflow:\s*auto/);
    expect(styles).toMatch(/\.chat-folder-body\s*\{[^}]*overflow-y:\s*auto/);
    expect(styles).toMatch(/\.popup-backdrop\.chat-folder-backdrop\s*\{[^}]*scrollbar-width:\s*none/);
  });
});
