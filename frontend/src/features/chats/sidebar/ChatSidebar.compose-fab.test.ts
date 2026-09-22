import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const chatSidebar = readFileSync(
  resolve(process.cwd(), "src/features/chats/sidebar/ChatSidebar.tsx"),
  "utf8"
);

describe("ChatSidebar compose action", () => {
  it("uses a bundled accessible pencil icon instead of a Material Symbols ligature", () => {
    expect(chatSidebar).toContain('import { ChevronDown, Paperclip, Pencil, Plus, Server, Trash2, UserPlus } from "lucide-react";');

    const composeFab = chatSidebar.slice(chatSidebar.indexOf('className="compose-fab"'));
    expect(composeFab).toContain('aria-label="Start a chat"');
    expect(composeFab).toContain("onClick={openNewChatScreen}");
    expect(composeFab).toContain('<Pencil aria-hidden={true} size={24} />');
    expect(composeFab).not.toContain("edit_square");
    expect(composeFab).not.toContain("ms-icon");
  });
});
