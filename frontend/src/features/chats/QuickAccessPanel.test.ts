import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const panel = readFileSync(resolve(process.cwd(), "src/features/chats/QuickAccessPanel.tsx"), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/pages/ChatsPage.tsx"), "utf8");

describe("message archive grouped view", () => {
  it("opens a source chat when an archived-chat row is activated", () => {
    expect(panel).toContain('onOpenChat: (chat: Chat) => void');
    expect(panel).toContain('onClick={() => onOpenChat(chat)}');
    expect(panel).toContain('<button type="button" className="chat-list-item"');
    expect(page).toContain('setIsMessageArchiveOpen(false); openChat(chat);');
  });
});
