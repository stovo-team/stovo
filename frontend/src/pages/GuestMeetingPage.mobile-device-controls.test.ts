import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const guestMeeting = readFileSync(resolve(process.cwd(), "src/pages/GuestMeetingPage.tsx"), "utf8");
const cameraReplacement = readFileSync(resolve(process.cwd(), "src/pages/guestMeetingCameraTrackReplacement.ts"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8").replace(/\r\n/g, "\n");

describe("guest meeting responsive device-control source contract", () => {
  it("keeps the guest prejoin preview at 16:9 with fully fitted video and opaque controls", () => {
    const lastRule = (selector: string) => Array.from(styles.matchAll(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, "gs"))).at(-1)?.[1] ?? "";
    const previewRule = lastRule("\\.guest-prejoin-preview");
    const videoRule = lastRule("\\.guest-prejoin-preview video");
    const controlsRule = lastRule("\\.guest-prejoin-preview \\.guest-call-controls \\.guest-device-control > button");

    expect(previewRule).toMatch(/aspect-ratio:\s*16\s*\/\s*9/);
    expect(previewRule).not.toMatch(/min-height:\s*[1-9]/);
    expect(videoRule).toMatch(/object-fit:\s*contain/);
    expect(controlsRule).toMatch(/background:\s*(?!transparent|rgba?\()/);
  });

  it("uses an SVG arrow in the Run Stovo link", () => {
    expect(guestMeeting).toContain("Run Stovo <ArrowUpRight size={16} aria-hidden=\"true\" />");
    expect(guestMeeting).not.toContain("Run Stovo <span aria-hidden=\"true\">↗</span>");
  });

  it("uses the shared speaking-indicator contract rather than a guest-only threshold", () => {
    expect(/createCallSpeakingIndicator\s*\(/.test(guestMeeting)).toBe(true);
    expect(/callSpeakingIndicator/.test(guestMeeting)).toBe(true);
    expect(guestMeeting).toContain("const isSpeaking = isCallSpeakingActive(speakingIndicatorState)");
    expect(guestMeeting).toContain("if (!isCallSpeakingActive(nextState)) next.delete(id)");
  });

  it("declares mobile audio-output switching and camera-rotation controls", () => {
    expect(/aria-label="Audio output"/.test(guestMeeting)).toBe(true);
    expect(/aria-label="Flip camera"/.test(guestMeeting)).toBe(true);
  });

  it("tracks speaking state for remote guest participants", () => {
    expect(guestMeeting).toContain("ActiveSpeakersChanged");
    expect(guestMeeting).toContain("indicator.update({ microphoneEnabled: true, level: active.has(id) ? CALL_SPEAKING_THRESHOLD : 0 })");
    expect(guestMeeting).toMatch(/remoteStreams\.map\([\s\S]*?speaking:\s*!remoteMutedUserIds\.includes\(remote\.id\)\s*&&\s*remoteSpeakingUserIds\.includes\(remote\.id\)/);
  });

  it("propagates remote microphone mute state into guest participant tiles", () => {
    expect(guestMeeting).toContain("setRemoteMicrophoneMuted(participant.identity, true)");
    expect(guestMeeting).toContain("setRemoteMicrophoneMuted(participant.identity, false)");
    expect(guestMeeting).toContain('muted={remoteMutedUserIds.includes(remote.id)}');
  });

  it("initializes a guest tile from the participant mute state when a track subscribes", () => {
    expect(guestMeeting).toContain("setRemoteMicrophoneMuted(participant.identity, !participant.isMicrophoneEnabled)");
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
