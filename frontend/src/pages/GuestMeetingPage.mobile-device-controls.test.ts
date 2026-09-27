import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const guestMeeting = readFileSync(resolve(process.cwd(), "src/pages/GuestMeetingPage.tsx"), "utf8");
const cameraReplacement = readFileSync(resolve(process.cwd(), "src/pages/guestMeetingCameraTrackReplacement.ts"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8").replace(/\r\n/g, "\n");

describe("guest meeting responsive device-control source contract", () => {
  it("uses the shared speaking-indicator contract rather than a guest-only threshold", () => {
    expect(/createCallSpeakingIndicator\s*\(/.test(guestMeeting)).toBe(true);
    expect(/callSpeakingIndicator/.test(guestMeeting)).toBe(true);
  });

  it("declares mobile audio-output switching and camera-rotation controls", () => {
    expect(/aria-label="Audio output"/.test(guestMeeting)).toBe(true);
    expect(/aria-label="Flip camera"/.test(guestMeeting)).toBe(true);
  });

  it("tracks speaking state for remote guest participants", () => {
    expect(guestMeeting).toContain("ActiveSpeakersChanged");
    expect(guestMeeting).toContain("indicator.update({ microphoneEnabled: true, level: active.has(id) ? CALL_SPEAKING_THRESHOLD : 0 })");
    expect(guestMeeting).toMatch(/remoteStreams\.map\([\s\S]*?speaking:\s*remoteSpeakingUserIds\.includes\(remote\.id\)/);
  });

  it("keeps a disabled camera track published through fallback so re-enabling can resume video", () => {
    const flipCamera = guestMeeting.slice(guestMeeting.indexOf("async function flipCamera()"), guestMeeting.indexOf("function setMicVolume"));

    expect(flipCamera).toContain("replacePublishedCameraTrackSafely(");
    expect(cameraReplacement).toContain("unpublishTrack(oldTrack, false)");
    expect(cameraReplacement).toContain("publishTrack(replacementTrack, publishOptions)");
    expect(cameraReplacement).toContain("publishTrack(oldTrack, publishOptions)");
  });

  it("declares mobile rules hiding guest device menus and keeps desktop menus available", () => {
    const mobileRules = mediaBlocks("(max-width: 720px)");

    expect(/\.guest-preview-controls \.guest-device-select\s*\{[^}]*display:\s*none/s.test(mobileRules)).toBe(true);
    expect(/\.guest-call-controls \.guest-device-select\s*\{[^}]*display:\s*none/s.test(mobileRules)).toBe(true);
    expect(/\.guest-device-select\s*\{[^}]*display:\s*inline-flex/s.test(styles)).toBe(true);
    expect(/\.guest-call-controls \.guest-device-menu-trigger\s*\{[^}]*display:\s*inline-flex/s.test(styles)).toBe(true);
  });

  it("keeps live camera errors outside the horizontally scrolling controls row", () => {
    const liveError = guestMeeting.indexOf('className="guest-device-issue guest-device-issue--visible" role="status"', guestMeeting.indexOf("async function flipCamera()"));
    const bottomBar = guestMeeting.indexOf('<div className="voice-room-bottom-bar">');
    const toolbar = guestMeeting.indexOf('className="voice-room-in-call-controls guest-call-controls shared-call-controls"');

    expect(liveError).toBeGreaterThan(-1);
    expect(liveError).toBeLessThan(bottomBar);
    expect(liveError).toBeLessThan(toolbar);
    expect(/\.guest-call-room\s+\.voice-room-stage\s*>\s*\.guest-device-issue--visible\s*\{[^}]*position:\s*absolute/s.test(styles)).toBe(true);
  });
});

function mediaBlocks(query: string) {
  const blocks: string[] = [];
  const marker = `@media ${query}`;
  let from = 0;
  while ((from = styles.indexOf(marker, from)) >= 0) {
    const opening = styles.indexOf("{", from);
    if (opening < 0) break;
    let depth = 0;
    let end = opening;
    for (; end < styles.length; end += 1) {
      if (styles[end] === "{") depth += 1;
      if (styles[end] === "}" && --depth === 0) {
        end += 1;
        break;
      }
    }
    blocks.push(styles.slice(from, end));
    from = end;
  }
  return blocks.join("\n");
}
