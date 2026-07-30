import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const chatsPageSource = readFileSync(
  resolve(process.cwd(), "src/pages/ChatsPage.tsx"),
  "utf8",
);

describe("minimized desktop call controls", () => {
  it("keeps one restore action and exposes a video toggle", () => {
    const minimizedBlock = chatsPageSource.match(
      /\{isCallMinimized && !isMobileViewport && \([\s\S]*?\n            \)\}/,
    )?.[0] ?? "";

    expect(minimizedBlock.match(/aria-label="Restore call window"/g)).toHaveLength(1);
    expect(minimizedBlock).toContain("call-chip-video");
  });
});
