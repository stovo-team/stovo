import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const conversationPanelSource = readFileSync(
  "src/features/chats/conversation/ConversationPanel.tsx",
  "utf8"
);

describe("ConversationPanel archive canvas and checklist support", () => {
  it("passes onCreateCanvas and onCreateChecklist without archive restriction", () => {
    expect(conversationPanelSource).not.toContain(
      'onCreateCanvas={selectedChat?.type === "archive" ? undefined : onCreateCanvas}'
    );
    expect(conversationPanelSource).not.toContain(
      'onCreateChecklist={selectedChat?.type === "archive" ? undefined : onCreateChecklist}'
    );
    expect(conversationPanelSource).toContain("onCreateCanvas={onCreateCanvas}");
    expect(conversationPanelSource).toContain("onCreateChecklist={onCreateChecklist}");
  });
});
