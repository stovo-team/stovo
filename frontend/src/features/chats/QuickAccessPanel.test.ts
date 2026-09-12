import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const panel = readFileSync(resolve(process.cwd(), "src/features/chats/QuickAccessPanel.tsx"), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/pages/ChatsPage.tsx"), "utf8");

describe("message archive grouped view", () => {
  it("keeps archive view controls in the same visual position outside the grouped panel", () => {
    expect(panel).toContain("quick-access-panel-tabs--archive-controls");
  });

  it("lists archive-origin groups rather than unrelated recently active chats", () => {
    expect(panel).toContain("getMessageArchiveGroups(accessToken)");
    expect(panel).toContain("My Notes");
    expect(panel).not.toContain("chat.lastMessageContent");
    expect(panel).toContain('onOpenGroup("notes")');
    expect(panel).toContain('<button type="button" className="chat-list-item"');
    expect(panel).toContain('<FileText size={20} />');
    expect(panel).toContain('chatAvatarFile(sourceChat, currentUserId)');
    expect(page).toContain("archiveGroup=${encodeURIComponent(group)}");
    expect(page).toContain('messageArchiveView === "grouped" && !archiveGroup');
  });

  it("uses the archive fallback icon and standard chat title spacing in the grouped archive header", () => {
    expect(panel).toContain('<Archive aria-hidden className="avatar-fallback-svg" size={24} strokeWidth={1.75} />');
  });
});
