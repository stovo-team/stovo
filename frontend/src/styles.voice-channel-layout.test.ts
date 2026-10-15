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

  it("lays controls over the voice stage and bounds the presentation to the available stage", () => {
    expect(styleRules(".voice-room-stage")).toMatch(/position:\s*absolute/);
    expect(styleRules(".voice-room-stage")).toMatch(/inset:\s*0/);
    expect(styleRules(".voice-channel-room .voice-room-stage")).toMatch(/padding:\s*calc\([^;]*\)\s+16px\s+16px/);
    expect(styleRules(".voice-room-bottom-bar:has\(.shared-call-control-panel\)")).toMatch(/position:\s*absolute/);
    expect(styleRules(".voice-room-bottom-bar:has\(.shared-call-control-panel\)")).toMatch(/bottom:\s*0/);
    expect(styleRules(".voice-room-participant-content")).toMatch(/justify-content:\s*flex-start/);
    expect(styleRules(".call-grid--screen-share-bottom .call-grid__participant-rail")).toMatch(/grid-row:\s*1/);
    expect(styleRules(".shared-call-stage .call-grid--presenting.call-grid--screen-share")).toMatch(/max-width:\s*100%/);
    expect(styleRules(".shared-call-stage .call-grid--presenting.call-grid--screen-share")).toMatch(/max-height:\s*100%/);
    expect(styleRules(".call-popup.call-popup-group-call--sharing:not(.call-popup-minimized):not(.call-popup-fullscreen)")).toMatch(/height:\s*min\(760px,\s*calc\(100dvh - 40px\)\)/);
    expect(styleRules(".call-popup-group-call--sharing:not(.call-popup-minimized):not(.call-popup-fullscreen) .call-popup-video-area")).toMatch(/flex:\s*1 1 0/);
    expect(styleRules(".call-popup-group-call--sharing:not(.call-popup-minimized):not(.call-popup-fullscreen) .call-popup-video-area")).toMatch(/min-height:\s*0/);
    expect(styleRules(".call-popup-group-call--sharing:not(.call-popup-minimized):not(.call-popup-fullscreen) .call-popup-ctrl-row")).toMatch(/flex:\s*0 0 auto/);
  });

  it("keeps the pre-join button docked at the bottom of the voice room", () => {
    const prejoinDock = styleRules(".voice-channel-room:not(.is-connected):not(.guest-call-room) .voice-room-bottom-bar");
    expect(prejoinDock).toMatch(/position:\s*absolute/);
    expect(prejoinDock).toMatch(/bottom:\s*0/);
    expect(prejoinDock).toMatch(/inset-inline:\s*0/);
  });

  it("makes voice-channel status avatars larger with less space under the channel name", () => {
    expect(styleRules(".chat-list-voice-avatar")).toMatch(/height:\s*24px/);
    expect(styleRules(".chat-list-voice-avatar")).toMatch(/width:\s*24px/);
    expect(css).toMatch(/\.chat-list-copy:has\(\.chat-list-voice-participants\)\s*\{[^}]*gap:\s*1px/);
  });
});
