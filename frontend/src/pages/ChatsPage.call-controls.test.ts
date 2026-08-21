import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const desktopCallControlsSource = readFileSync(
  resolve(process.cwd(), "src/features/chats/calling/DesktopCallControls.tsx"),
  "utf8",
);

describe("minimized desktop call controls", () => {
  it("keeps one restore action and exposes a video toggle", () => {
    const minimizedBlock = desktopCallControlsSource.match(
      /\{isCallMinimized && !isMobileViewport && callPhase !== "idle" && \([\s\S]*?\n      \)\}/,
    )?.[0] ?? "";

    expect(minimizedBlock).toContain('Restore call window');
    expect(minimizedBlock).toContain("call-chip-restore");
    expect(minimizedBlock).toContain("call-chip-video");
  });
});
