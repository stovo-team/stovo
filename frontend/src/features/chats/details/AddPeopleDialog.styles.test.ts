import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const addPeopleDialog = readFileSync("src/features/chats/details/AddPeopleDialog.tsx", "utf8");
const styles = readFileSync("src/styles.css", "utf8");

function ruleFor(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "s"));
  return match?.[1] ?? "";
}

describe("Add People dialog appearance", () => {
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

  it("gives the close control a circular background and visible border", () => {
    const close = ruleFor(".add-people-dialog .new-chat-screen-close");
    expect(close).toMatch(/background:\s*(?!transparent)[^;]+;/);
    expect(close).toMatch(/border:\s*1px\s+solid\s+[^;]+;/);
    expect(close).toMatch(/border-radius:\s*(?:50%|999px)/);
  });
});
