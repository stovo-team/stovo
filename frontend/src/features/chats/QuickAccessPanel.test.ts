import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const panel = readFileSync(resolve(process.cwd(), "src/features/chats/QuickAccessPanel.tsx"), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/pages/ChatsPage.tsx"), "utf8");

describe("message archive grouped view", () => {
  it("lists archive-origin groups rather than unrelated recently active chats", () => {
    expect(panel).toContain("getMessageArchiveGroups(accessToken)");
    expect(panel).toContain("My Notes");
    expect(panel).not.toContain("chat.lastMessageContent");
    expect(panel).toContain('onOpenGroup("notes")');
    expect(panel).toContain('<button type="button" className="chat-list-item"');
    expect(page).toContain("archiveGroup=${encodeURIComponent(group)}");
    expect(page).toContain('messageArchiveView === "grouped" && !archiveGroup');
  });
});
