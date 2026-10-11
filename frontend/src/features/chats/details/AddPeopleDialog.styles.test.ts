import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const addPeopleDialog = readFileSync("src/features/chats/details/AddPeopleDialog.tsx", "utf8");
const styles = readFileSync("src/styles.css", "utf8");

function ruleFor(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "s"));
  return match?.[1] ?? "";
}

describe("Shared dialog close button appearance", () => {
  it("uses dialog-specific styling so the shared new-chat modal remains unchanged", () => {
    expect(addPeopleDialog).toContain('className="new-chat-screen add-people-dialog"');
    const dialog = ruleFor(".add-people-dialog");
    expect(dialog).toMatch(/background:\s*color-mix\(/);
    expect(dialog).toMatch(/border:\s*0(?:px)?\s*;|border:\s*none\s*;/);
  });

  it("adds comfortable horizontal padding and rounds the search field", () => {
    const dialog = ruleFor(".add-people-dialog");
    expect(dialog).toMatch(/padding:\s*0\s+(?:2[0-9]|[3-9][0-9])px/);
    const search = ruleFor(".add-people-dialog .new-chat-screen-search");
    expect(search).toMatch(/border-radius:\s*(?:2[0-9]|[3-9][0-9])px/);
  });

  it("gives both dialogs the same circular gray close control", () => {
    const close = ruleFor(".new-chat-screen-close");
    const hover = ruleFor(".new-chat-screen-close:hover");
    expect(close).toMatch(/background:\s*var\(--surface-card\);/);
    expect(close).toMatch(/border:\s*1px\s+solid\s+var\(--border-default\);/);
    expect(close).toMatch(/border-radius:\s*50%/);
    expect(hover).toMatch(/background:\s*var\(--background-tertiary\);/);
  });
});
