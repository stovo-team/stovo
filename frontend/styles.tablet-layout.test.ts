import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { isMobileCallViewport } from "./src/features/chats/shared/callLifecycle";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

describe("tablet app layout", () => {
  it.each([768, 820, 960, 1024])("uses mobile interaction state at %ipx", (width) => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: width <= Number(query.match(/max-width: (\d+)px/)?.[1]) }));
    try { expect(isMobileCallViewport()).toBe(true); } finally { vi.unstubAllGlobals(); }
  });

  it("starts desktop layout after the tablet boundary with no overlapping range", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    expect(styles.includes("@media (max-width: 1024px)")).toBe(true);
    expect(styles.includes("@media (min-width: 1025px)")).toBe(true);
    expect(/(?:max-width:\s*960px|min-width:\s*961px)/.test(styles)).toBe(false);
  });
});
