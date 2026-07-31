import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const chatsPage = readFileSync(resolve(process.cwd(), "src/pages/ChatsPage.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("chat details controls", () => {
  it("edits a chat name inline in its title row", () => {
    expect(chatsPage).toContain('className="chat-info-title-inline-editor"');
    expect(chatsPage).not.toContain('id="chat-info-name-editor"');
  });

  it("shows pin permissions in a popup anchored to the settings button", () => {
    expect(chatsPage).toContain('className="chat-info-permissions-popup"');
    expect(chatsPage).toContain('role="dialog"');
    expect(styles).toContain(".chat-info-permissions-popup {");
  });

  it("keeps the back, settings, and edit controls neutral until interaction", () => {
    expect(styles).toContain(".chat-info-back:hover,");
    expect(styles).toContain(".chat-info-topbar-action:hover,");
    expect(styles).toContain(".chat-info-title-edit:hover {");
  });
});
