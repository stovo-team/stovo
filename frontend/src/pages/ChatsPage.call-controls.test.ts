import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const desktopCallControlsSource = readFileSync(
  resolve(process.cwd(), "src/features/chats/calling/DesktopCallControls.tsx"),
  "utf8",
);
const minimizedSource = readFileSync(resolve(process.cwd(), "src/features/chats/calling/MinimizedCallBar.tsx"), "utf8");
const chatsPageSource = readFileSync(resolve(process.cwd(), "src/pages/ChatsPage.tsx"), "utf8");
const voiceLayoutSnapshotSource = readFileSync(resolve(process.cwd(), "src/pages/voiceCallLayoutSnapshot.ts"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8").replace(/\r\n/g, "\n");

describe("Voice Channel call layout restoration", () => {
  it("captures the expanded state for the active voice chat and restores it after call end", () => {
    expect(chatsPageSource).toContain("advanceVoiceCallLayoutSnapshot(voiceCallLayoutSnapshotRef.current");
    expect(chatsPageSource).toContain("setIsVoiceCallExpanded(transition.restoreExpanded)");
    expect(voiceLayoutSnapshotSource).toContain('input.callPhase === "idle"');
  });
});

describe("minimized desktop call controls", () => {
  it("keeps one shared restore action with microphone, speaker and end controls", () => {
    expect(desktopCallControlsSource).not.toContain("call-status-chip-controls");
    expect(minimizedSource.match(/aria-label=\{copy.restoreCall\}/g)).toHaveLength(1);
    expect(minimizedSource).toContain('action="microphone"');
    expect(minimizedSource).toContain('action="audio-output"');
    expect(minimizedSource).toContain('action="end-call"');
  });

  it("keeps minimized controls square so their circular shape cannot be flex-compressed", () => {
    expect(styles).toContain(".call-chip-btn {\n  aspect-ratio: 1 / 1;");
    expect(styles).toContain("min-width: 30px;");
    expect(styles).toContain(".mobile-call-strip-btn {\n  aspect-ratio: 1 / 1;");
    expect(styles).toContain("min-width: 36px;");
    expect(styles).toContain("flex: 0 0 34px;");
    expect(styles).toContain("min-width: 34px;");
    expect(styles).toContain("min-height: 34px;");
  });
});
