import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const callFeature = readFileSync("src/features/chats/calling/CallFeature.tsx", "utf8");
const audioSettingsPopup = readFileSync("src/features/chats/calling/CallAudioSettingsPopup.tsx", "utf8");
const styles = readFileSync("src/styles.css", "utf8").replace(/\r\n/g, "\n");

function rule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(styles.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g")), (match) => match[1]).join("\n");
}

describe("group call presentation surface", () => {
  it("expands the desktop group call surface while local or remote sharing is active", () => {
    expect(callFeature).toContain("const isGroupCallSharing = isGroupCall && (");
    expect(callFeature).toContain("callAudioSettings.screenSharing || session.callRemoteMedia.some((media) => media.hasScreenShare)");
    expect(callFeature).toContain("isMobileViewport || (isGroupCallSharing && !effectiveIsCallMinimized)");
    expect(callFeature).toContain("shouldUseFullscreenSurface ? \"call-popup-fullscreen\" : \"\"");
    expect(callFeature).toContain("hidden={effectiveIsCallMinimized}");
    expect(callFeature).toContain("visible={effectiveIsCallMinimized}");
  });

  it("uses a smaller group popup and compact invite and call controls", () => {
    const groupPopupRule = rule(".call-popup.call-popup-group-call:not(.call-popup-minimized):not(.call-popup-fullscreen)");
    expect(groupPopupRule).toMatch(/width:\s*min\(960px,/);
    expect(groupPopupRule).toMatch(/height:\s*min\(640px,/);
    expect(rule(".call-popup-group-call .call-ctrl-btn")).toMatch(/width:\s*40px/);
    expect(rule(".call-popup-group-call .call-ctrl-btn")).toMatch(/height:\s*40px/);
    expect(rule(".call-popup-group-call .call-ctrl-btn--invite")).toMatch(/width:\s*40px/);
  });

  it("keeps participant tiles at 16:9 and controls from shrinking", () => {
    expect(rule(".call-popup-group-participant")).toMatch(/aspect-ratio:\s*16 \/ 9/);
    expect(rule(".call-popup-group-call .call-ctrl-btn")).toMatch(/flex-shrink:\s*0/);
    expect(rule(".call-popup-group-call .call-popup-header-invite")).toMatch(/grid-column:\s*3/);
  });

  it("keeps the desktop sharing stage and header visible", () => {
    expect(rule(".call-popup.call-popup-group-call.call-popup-fullscreen > .call-popup-video-area")).toMatch(/display:\s*flex/);
    expect(rule(".call-popup.call-popup-group-call.call-popup-fullscreen > .call-popup-header")).toMatch(/display:\s*grid/);
  });

  it("keeps audio settings above the expanded call and uses the audio-channel popup", () => {
    expect(rule(".call-audio-popup-backdrop")).toMatch(/z-index:\s*2600/);
    expect(audioSettingsPopup).toContain('className={embedded ? "call-audio-popup call-settings-embedded-panel" : "call-audio-popup"}');
    expect(styles).toContain(".call-popup-group-call.call-popup-fullscreen.call-popup-group-call--sharing .shared-call-stage .call-grid--screen-share");
  });
});
