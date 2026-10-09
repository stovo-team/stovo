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

  it("reserves the call dock and gives the screen-share stage the remaining height", () => {
    expect(styleRules(".voice-room-stage")).toMatch(/flex:\s*1 1 0/);
    expect(styleRules(".voice-room-stage")).toMatch(/height:\s*auto/);
    expect(styleRules(".voice-room-bottom-bar")).toMatch(/flex:\s*0 0 auto/);
    expect(styleRules(".call-popup.call-popup-group-call--sharing:not(.call-popup-minimized):not(.call-popup-fullscreen)")).toMatch(/height:\s*min\(760px,\s*calc\(100dvh - 40px\)\)/);
    expect(styleRules(".call-popup-group-call--sharing:not(.call-popup-minimized):not(.call-popup-fullscreen) .call-popup-video-area")).toMatch(/flex:\s*1 1 0/);
    expect(styleRules(".call-popup-group-call--sharing:not(.call-popup-minimized):not(.call-popup-fullscreen) .call-popup-video-area")).toMatch(/min-height:\s*0/);
    expect(styleRules(".call-popup-group-call--sharing:not(.call-popup-minimized):not(.call-popup-fullscreen) .call-popup-ctrl-row")).toMatch(/flex:\s*0 0 auto/);
  });

  it("makes voice-channel status avatars larger with less space under the channel name", () => {
    expect(styleRules(".chat-list-voice-avatar")).toMatch(/height:\s*24px/);
    expect(styleRules(".chat-list-voice-avatar")).toMatch(/width:\s*24px/);
    expect(css).toMatch(/\.chat-list-copy:has\(\.chat-list-voice-participants\)\s*\{[^}]*gap:\s*1px/);
  });
});
