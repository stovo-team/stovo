import { describe, expect, it } from "vitest";
import { readTextFile } from "../../../testUtils/readTextFile";

const styles = readTextFile("src/styles.css");

function mediaRuleContaining(selector: string, maxWidth: number) {
  const mediaQuery = `@media (max-width: ${maxWidth}px)`;
  let mediaStart = 0;

  while ((mediaStart = styles.indexOf(mediaQuery, mediaStart)) >= 0) {
    let depth = 0;
    for (let index = styles.indexOf("{", mediaStart); index < styles.length; index += 1) {
      if (styles[index] === "{") depth += 1;
      if (styles[index] === "}") {
        depth -= 1;
        if (depth === 0) {
          const mediaRules = styles.slice(mediaStart, index + 1);
          if (mediaRules.includes(selector)) return mediaRules;
          mediaStart = index + 1;
          break;
        }
      }
    }
  }

  return "";
}

describe("chat details popup sizing", () => {
  it("uses the compact popup and backdrop at every screen size", () => {
    const popupRule = styles.match(/\.chat-info-screen\.chat-details-panel\s*\{[^}]*position:\s*fixed;[^}]*\}/)?.[0] ?? "";
    const layoutRule = styles.match(/(?:^|\n)\.chat-layout\s*\{(?=[^}]*display:\s*grid;)[^}]*\}/)?.[0] ?? "";

    expect(popupRule).toContain("position: fixed;");
    expect(popupRule).toContain("right: 12px;");
    expect(popupRule).toContain("top: 12px;");
    expect(popupRule).toContain("bottom: 12px;");
    expect(popupRule).toContain("width: min(400px, calc(100vw - 32px));");
    expect(popupRule).toContain("border-radius: var(--radius-panel);");
    expect(popupRule).toContain("box-shadow: var(--popup-dialog-shadow);");
    expect(styles).toContain(".chat-layout.details-open::before");
    expect(styles).toContain("background: var(--popup-backdrop-color);");
    expect(layoutRule).toContain("position: relative;");
    expect(mediaRuleContaining(".chat-info-screen.chat-details-panel", 1200)).toBe("");
    expect(mediaRuleContaining(".chat-layout.details-open::before", 768)).toBe("");
  });

  it("keeps compact controls, scrollable content, and call visibility", () => {
    expect(styles).toMatch(/\.chat-info-screen \.chat-info-avatar-wrap\s*\{[^}]*height:\s*72px;/);
    expect(styles).toMatch(/\.chat-info-screen \.chat-info-action\s*\{[^}]*border-radius:\s*var\(--radius-surface\);/);
    expect(styles).toMatch(/\.chat-info-body\s*\{[^}]*overflow:\s*auto;/);
    expect(styles).toContain(".voice-call-expanded .chat-details-panel {\n  display: none;");
  });

  it("keeps chat details from creating a desktop side column", () => {
    const desktopDetailsColumn = styles.match(/\.chat-layout\.details-open\s*\{\s*grid-template-columns:\s*minmax\(280px, 320px\)\s+minmax\(0, 1fr\)\s+minmax\(240px, 280px\);/);
    expect(desktopDetailsColumn).toBeNull();
    expect(styles).not.toContain("@media (min-width: 769px) and (max-width: 1200px) {\n  .chat-layout.details-open {");
  });

  it("keeps tablet navigation and chat layout below the popup breakpoint", () => {
    expect(styles.includes("@media (max-width: 768px) {\n  .app-frame {\n    display: block;")).toBe(true);
  });

  it("uses a compact font size for the Add people action", () => {
    expect(styles.includes(".chat-info-member-invite {\n  align-items: center;")).toBe(true);
    expect(/\.chat-info-member-invite \{[^}]*font-size: var\(--font-size-small\);/.test(styles)).toBe(true);
  });

  it("reserves space in Details content while a minimized call is present", () => {
    expect(styles).toMatch(/\.chat-info-body\.has-minimized-call\s*\{[^}]*padding-top:\s*var\(--minimized-call-slot-height/);
  });
});
