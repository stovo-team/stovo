import { readCssSource } from "../test/cssSource";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/ServerSetupPage.tsx"), "utf8");
const styles = readCssSource(resolve(process.cwd(), "src/styles.css"))
  .replace(/^\uFEFF/, "")
  .replace(/\r\n/g, "\n");

describe("space setup responsive heading", () => {
  it("keeps the address title with the Stovo logo and adjusts only mobile layout", () => {
    expect(page).toContain("className=\"server-setup-eyebrow eyebrow\"");
    expect(page).toMatch(/className="server-setup-heading"[\s\S]*?<StovoLogo[\s\S]*?<h1>\{copy\.title\}<\/h1>/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*680px\)[\s\S]*?\.server-setup-eyebrow\s*\{[^}]*display:\s*none/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*680px\)[\s\S]*?\.server-setup-heading\s*\{[^}]*display:\s*flex/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*680px\)[\s\S]*?\.server-setup-heading\s*\{[^}]*justify-content:\s*flex-start/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*680px\)[\s\S]*?\.server-setup-form\s+label\s*\{[^}]*padding-top:\s*12px/);
    expect(styles).toMatch(/\.auth-panel\s+\.server-setup-form\s*>\s*button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus-ring\)/);
    expect(styles).toMatch(/:root\[data-brand-gradient="custom"\][\s\S]*?\.server-setup-form\s*>\s*button[\s\S]*?background:\s*var\(--color-brand-gradient\)/);
  });
});
