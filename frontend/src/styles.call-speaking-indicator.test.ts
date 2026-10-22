import { readCssSource } from "./test/cssSource";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readCssSource(resolve(process.cwd(), "src/styles.css")).replace(/\r\n/g, "\n");
const callSurfaceSources = [
  readFileSync(resolve(process.cwd(), "src/features/chats/calling/DesktopCallControls.tsx"), "utf8"),
  readFileSync(resolve(process.cwd(), "src/features/chats/calling/MobileActiveScreen.tsx"), "utf8"),
  readFileSync(resolve(process.cwd(), "src/features/chats/calling/VoiceChannelStage.tsx"), "utf8"),
  readFileSync(resolve(process.cwd(), "src/pages/GuestMeetingPage.tsx"), "utf8"),
];
const sharedStageSource = readFileSync(resolve(process.cwd(), "src/features/chats/calling/SharedCallStage.tsx"), "utf8");

describe("call speaking-indicator CSS contract", () => {
  it("applies the shared stage and control styles across DM/group, voice, and guest surfaces", () => {
    expect(callSurfaceSources[0]).toContain("shared-call-controls");
    expect(callSurfaceSources[0]).toContain("SharedCallStage");
    expect(callSurfaceSources[1]).toContain("shared-call-controls");
    expect(callSurfaceSources[1]).toContain("SharedCallStage");
    expect(callSurfaceSources[2]).toContain("shared-call-controls");
    expect(callSurfaceSources[2]).toContain("SharedCallStage");
    expect(callSurfaceSources[3]).toContain("shared-call-controls");
    expect(callSurfaceSources[3]).toContain("SharedCallStage");
    expect(sharedStageSource).toContain("shared-call-stage shared-call-stage-layout");

    const sharedRules = rule(".shared-call-controls");
    expect(sharedRules).toContain("justify-content: center");
    expect(sharedRules).toContain("gap: 12px");
  });

  it("keeps voice rows clean and restores the green outline and avatar halo on call tiles", () => {
    const voiceCard = rulesFor(".voice-participant-card.is-speaking");
    const voiceList = rulesFor(".voice-participant-list-row.is-speaking");
    const callTile = rulesFor(".call-grid__tile.is-speaking");
    const status = styles.match(/\.call-grid__tile\.is-speaking \.call-grid__participant-status,[^{]*\{([^{}]*)\}/)?.[1] ?? "";
    const voiceStatus = styles.match(/\.voice-participant-card\.is-speaking \.voice-participant-state,[^{]*\{([^{}]*)\}/)?.[1] ?? "";

    for (const activeTile of [voiceCard, voiceList]) {
      expect(activeTile).not.toMatch(/(?:border|outline|box-shadow|animation)\s*:/);
    }
    expect(callTile).toMatch(/outline:\s*1px solid var\(--color-palette-8b8f7c3d4541\)/);
    expect(rulesFor(".call-grid__tile.is-speaking .call-grid__avatar-circle")).toContain("box-shadow: 0 0 0 2px var(--color-palette-449c31647178)");
    expect(status).toContain("var(--color-palette-8b8f7c3d4541)");
    expect(voiceStatus).toContain("var(--color-palette-8b8f7c3d4541)");
  });

  it("does not draw an active halo around a guest meeting avatar", () => {
    const guestRing = styles.match(/\.guest-preview-avatar-halo\.is-speaking::before[^{}]*\{([^{}]*)\}/)?.[1] ?? "";

    expect(guestRing).toBe("");
  });
});

function rule(selector: string) {
  const start = styles.indexOf(`${selector} {`);
  if (start < 0) return "";
  const opening = styles.indexOf("{", start);
  const closing = styles.indexOf("}", opening);
  return closing < 0 ? "" : styles.slice(opening + 1, closing);
}

function rulesFor(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(styles.matchAll(new RegExp(`(?:^|,\\s*)${escaped}(?=\\s|[.#:[,{])[^{}]*\\{([^{}]*)\\}`, "gm")), (match) => match[1]).join("\n");
}
