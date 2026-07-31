import { describe, expect, it } from "vitest";

import { messageMatchesSearch } from "./messageSearch";

describe("messageMatchesSearch", () => {
  it("matches substrings without regard to case by default", () => {
    expect(messageMatchesSearch("Meet me at the Market", "mark", {})).toBe(true);
  });

  it("requires exact capitalization when requested", () => {
    expect(messageMatchesSearch("Meet me at the Market", "market", { caseSensitive: true })).toBe(false);
    expect(messageMatchesSearch("Meet me at the Market", "Market", { caseSensitive: true })).toBe(true);
  });

  it("requires word boundaries when requested", () => {
    expect(messageMatchesSearch("Bookmark the market", "mark", { wholeWord: true })).toBe(false);
    expect(messageMatchesSearch("Mark this finished", "mark", { wholeWord: true })).toBe(true);
  });

  it("combines whole-word and case-sensitive matching", () => {
    expect(messageMatchesSearch("MARK the note", "Mark", { wholeWord: true, caseSensitive: true })).toBe(false);
  });

  it("treats special characters in the query as literal text", () => {
    expect(messageMatchesSearch("Need (draft) today", "(draft)", { wholeWord: true })).toBe(true);
  });
});
