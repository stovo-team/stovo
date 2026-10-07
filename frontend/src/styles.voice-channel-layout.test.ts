import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8");

function styleRules(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g")), (match) => match[1]).join("\n");
}

describe("voice channel layout styles", () => {
  it("hides the chat list and expands the call pane when the voice channel is expanded", () => {
    expect(css).toMatch(/\.chat-layout\.voice-call-expanded,[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(css).toMatch(/\.voice-call-expanded \.chat-sidebar,[\s\S]*?display:\s*none/);
  });

  it("keeps the voice stage fixed and places the expand control at its upper left", () => {
    expect(styleRules(".voice-room-stage")).toMatch(/overflow:\s*hidden/);
    expect(styleRules(".voice-room-expand-button")).toMatch(/left:\s*16px/);
  });

  it("makes voice-channel status avatars larger with less space under the channel name", () => {
    expect(styleRules(".chat-list-voice-avatar")).toMatch(/height:\s*24px/);
    expect(styleRules(".chat-list-voice-avatar")).toMatch(/width:\s*24px/);
    expect(css).toMatch(/\.chat-list-copy:has\(\.chat-list-voice-participants\)\s*\{[^}]*gap:\s*1px/);
  });
});
