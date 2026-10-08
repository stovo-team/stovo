import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const css = readFileSync("src/styles.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rules = (selector: string) => Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g)).filter((match) => match[1].trim() === selector).map((match) => match[2]).join("\n");

describe("guest call stage layout", () => {
  it("uses stage height up to the dock with the header overlaid", () => {
    expect(rules(".guest-call-room .voice-room-stage")).toMatch(/padding:\s*1rem/);
    expect(rules(".guest-call-spotlight")).toMatch(/width:\s*100%/);
    expect(rules(".guest-call-room .guest-call-spotlight")).toMatch(/flex:\s*1 1 0/);
    expect(rules(".guest-call-header")).toMatch(/position:\s*fixed/);
  });
  it("sizes camera avatars to their tile rather than scaling a 140px layout box", () => {
    const avatar = rules(".guest-call-camera-tile .voice-participant-avatar-wrapper");
    expect(avatar).not.toContain("transform: scale");
    expect(avatar).toMatch(/width:\s*clamp\(24px, 24cqw, 64px\)/);
    expect(rules(".guest-call-camera-tile")).toContain("min-height: 80px");
    expect(rules(".guest-call-camera-tile")).toContain("width: 100%");
    expect(rules(".guest-call-camera-tile")).toContain("container-type: inline-size");
    expect(rules(".guest-call-camera-tile .guest-call-avatar-halo")).toMatch(/height:\s*100%/);
  });
  it("omits the participant-count status dot", () => {
    const source = readFileSync("src/pages/GuestMeetingPage.tsx", "utf8");
    expect(source).not.toContain('<i aria-hidden="true" />');
  });
});
