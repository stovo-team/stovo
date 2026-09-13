import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/features/chats/sidebar/ChatList.tsx"), "utf8");

describe("ChatList quick access selection", () => {
  it("does not highlight a regular chat while Drafts & scheduled is active", () => {
    expect(source).toContain("isActive={!isDraftsAndScheduledActive && chat.id === activeChatId}");
  });
});
