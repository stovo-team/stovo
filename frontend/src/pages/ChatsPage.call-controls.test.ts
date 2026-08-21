import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const desktopCallControlsSource = readFileSync(
  resolve(process.cwd(), "src/features/chats/calling/DesktopCallControls.tsx"),
  "utf8",
);
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8").replace(/\r\n/g, "\n");

describe("minimized desktop call controls", () => {
  it("keeps one restore action and exposes a video toggle", () => {
    const minimizedBlock = desktopCallControlsSource.match(
      /\{isCallMinimized && !isMobileViewport && callPhase !== "idle" && \([\s\S]*?\n      \)\}/,
    )?.[0] ?? "";

    expect(minimizedBlock).toContain('Restore call window');
    expect(minimizedBlock).toContain("call-chip-restore");
    expect(minimizedBlock).toContain("call-chip-video");
  });

  it("keeps minimized controls square so their circular shape cannot be flex-compressed", () => {
    expect(styles).toContain(".call-chip-btn {\n  aspect-ratio: 1 / 1;");
    expect(styles).toContain("min-width: 30px;");
    expect(styles).toContain(".mobile-call-strip-btn {\n  aspect-ratio: 1 / 1;");
    expect(styles).toContain("min-width: 36px;");
  });
});
