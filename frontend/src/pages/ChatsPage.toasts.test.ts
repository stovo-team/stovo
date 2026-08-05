import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const chatsPageSource = readFileSync(
  resolve(process.cwd(), "src/pages/ChatsPage.tsx"),
  "utf8",
);
const conversationPanelSource = readFileSync(
  resolve(process.cwd(), "src/features/chats/conversation/ConversationPanel.tsx"),
  "utf8",
);
const overlaysSource = readFileSync(
  resolve(process.cwd(), "src/features/chats/ChatOverlays.tsx"),
  "utf8",
);

describe("ChatsPage transient notifications", () => {
  it("does not render in-app toast or floating alert UI", () => {
    for (const source of [chatsPageSource, conversationPanelSource, overlaysSource]) {
      expect(source).not.toContain("toast-stack");
      expect(source).not.toContain("toast-card");
      expect(source).not.toContain("floating-alert");
    }
  });
});
