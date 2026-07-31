import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const chatsPageSource = readFileSync(resolve(process.cwd(), "src/pages/ChatsPage.tsx"), "utf8");
const stylesSource = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("ChatsPage message search controls", () => {
  it("uses a direct header search button instead of the overflow menu", () => {
    expect(chatsPageSource).toContain('aria-label="Search messages"');
  });

  it("keeps the header search control plain and omits the encryption label", () => {
    expect(chatsPageSource).toContain('className="chat-header-search-button"');
    expect(chatsPageSource).not.toContain("chat-header-encryption-pill");
    expect(chatsPageSource).toContain("onClick={toggleMessageSearch}");
    expect(stylesSource).toMatch(/\.chat-header-search-button:focus-visible\s*\{\s*outline:\s*none;/);
  });

  it("exposes independent whole-word and case-sensitive search options", () => {
    expect(chatsPageSource).toContain('aria-label="Match whole words"');
    expect(chatsPageSource).toContain('aria-label="Match case"');
    expect(chatsPageSource).toContain("messageMatchesSearch");
    expect(chatsPageSource).toMatch(/>\s*W\s*<\/button>/);
    expect(stylesSource).toMatch(/\.message-search-option\s*\{[\s\S]*?flex:\s*0 0 auto;/);
  });

  it("keeps the search bar above the overlapping message panel", () => {
    expect(stylesSource).toMatch(/\.message-search-field\s*\{[\s\S]*?position:\s*relative;[\s\S]*?z-index:\s*11;/);
  });
});
