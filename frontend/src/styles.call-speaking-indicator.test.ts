import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8").replace(/\r\n/g, "\n");
const callSurfaceSources = [
  readFileSync(resolve(process.cwd(), "src/features/chats/calling/DesktopCallControls.tsx"), "utf8"),
  readFileSync(resolve(process.cwd(), "src/features/chats/calling/MobileActiveScreen.tsx"), "utf8"),
  readFileSync(resolve(process.cwd(), "src/features/chats/calling/VoiceChannelStage.tsx"), "utf8"),
  readFileSync(resolve(process.cwd(), "src/pages/GuestMeetingPage.tsx"), "utf8"),
];

describe("call speaking-indicator CSS contract", () => {
  it("applies the shared stage and control styles across DM/group, voice, and guest surfaces", () => {
    expect(callSurfaceSources[0]).toContain("shared-call-controls");
    expect(callSurfaceSources[0]).toContain("shared-call-stage");
    expect(callSurfaceSources[1]).toContain("shared-call-controls");
    expect(callSurfaceSources[2]).toContain("shared-call-controls");
    expect(callSurfaceSources[2]).toContain("shared-call-stage");
    expect(callSurfaceSources[3]).toContain("shared-call-controls");
    expect(callSurfaceSources[3]).toContain("shared-call-stage");

    const sharedRules = rule(".shared-call-controls");
    expect(sharedRules).toContain("justify-content: center");
    expect(sharedRules).toContain("gap: 12px");
  });

  it("declares the same green color for voice-channel and call-grid speaking rings", () => {
    const voiceRing = rule(".voice-speaking-ring");
    const callTile = rule(".call-grid__tile.is-speaking");

    expect(voiceRing).toContain("#22c55e");
    expect(callTile).toContain("#22c55e");
  });

  it("declares the guest meeting ring color to match the other call surfaces", () => {
    const guestRing = styles.match(/\.guest-preview-avatar-halo\.is-speaking::before[^{}]*\{([^{}]*)\}/)?.[1] ?? "";

    expect(guestRing.includes("#22c55e")).toBe(true);
  });
});

function rule(selector: string) {
  const start = styles.indexOf(`${selector} {`);
  if (start < 0) return "";
  const opening = styles.indexOf("{", start);
  const closing = styles.indexOf("}", opening);
  return closing < 0 ? "" : styles.slice(opening + 1, closing);
}
