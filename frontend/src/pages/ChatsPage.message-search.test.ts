import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const conversationPanelSource = readFileSync(
  resolve(process.cwd(), "src/features/chats/conversation/ConversationPanel.tsx"),
  "utf8"
);
const chatHeaderSource = readFileSync(
  resolve(process.cwd(), "src/features/chats/conversation/ChatHeader.tsx"),
  "utf8"
);
const useMessageThreadSource = readFileSync(
  resolve(process.cwd(), "src/features/chats/conversation/useMessageThread.ts"),
  "utf8"
);
const stylesSource = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("ChatsPage message search controls", () => {
  it("uses a direct header search button instead of the overflow menu", () => {
    expect(chatHeaderSource).toContain('aria-label="Search messages"');
  });

  it("keeps the header search control plain and omits the encryption label", () => {
    expect(chatHeaderSource).toContain('className="chat-header-search-button"');
    expect(chatHeaderSource).not.toContain("chat-header-encryption-pill");
    expect(chatHeaderSource).toContain("onClick={onToggleMessageSearch}");
    expect(conversationPanelSource).toContain("onToggleMessageSearch={toggleMessageSearch}");
    expect(stylesSource).toMatch(/\.chat-header-search-button:focus-visible\s*\{\s*outline:\s*none;/);
  });

  it("exposes independent whole-word and case-sensitive search options", () => {
    expect(conversationPanelSource).toContain('aria-label="Match whole words"');
    expect(conversationPanelSource).toContain('aria-label="Match case"');
    expect(useMessageThreadSource).toContain("messageMatchesSearch");
    expect(conversationPanelSource).toMatch(/>\s*W\s*<\/button>/);
    expect(stylesSource).toMatch(/\.message-search-option\s*\{[\s\S]*?flex:\s*0 0 auto;/);
  });

  it("keeps the search bar above the overlapping message panel", () => {
    expect(stylesSource).toMatch(/\.message-search-field\s*\{[\s\S]*?position:\s*relative;[\s\S]*?z-index:\s*11;/);
  });

  it("places the search bar under the floating header without a focus ring", () => {
    expect(stylesSource).toContain(
      ".messenger-shell.has-active-chat .message-search-field"
    );
    expect(stylesSource).toContain("margin-top: calc(var(--chat-floating-header-overlap) + 6px);");
    expect(stylesSource).toContain(".search-field.message-search-field:focus-within");
    expect(stylesSource).toMatch(
      /\.search-field\.message-search-field:focus-within\s*\{[\s\S]*?box-shadow:\s*none;/
    );
  });

  it("keeps the header search control plain without a filled circle", () => {
    expect(stylesSource).toMatch(/\.chat-header-search-button\s*\{[\s\S]*?background:\s*transparent;/);
    expect(stylesSource).toMatch(/\.chat-header-search-button\s*\{[\s\S]*?height:\s*34px;/);
  });
});
