import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const plansPage = readFileSync(resolve(process.cwd(), "src/pages/PlansPage.tsx"), "utf8");
const chatSidebar = readFileSync(resolve(process.cwd(), "src/features/chats/sidebar/ChatSidebar.tsx"), "utf8");

describe("floating action buttons", () => {
  it("uses matching compact dimensions, icons, and hover feedback on chats and plans", () => {
    expect(styles).toMatch(/\.compose-fab\s*\{[^}]*height:\s*40px;[^}]*width:\s*40px;/s);
    expect(styles).toMatch(/\.plans-create-fab\s*\{[^}]*height:\s*40px;[^}]*width:\s*40px;/s);
    expect(chatSidebar).toContain("<Plus aria-hidden={true} size={16} />");
    expect(plansPage).toContain('<Plus size={16} aria-hidden="true" />');
    expect(styles).toMatch(/\.compose-fab:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--accent-primary-hover, var\(--accent-primary\)\);[^}]*transform:\s*scale\(1\.08\);/s);
  });
});
