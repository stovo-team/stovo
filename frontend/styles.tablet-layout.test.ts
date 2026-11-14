import { readCssSource } from "./src/test/cssSource";
import { describe, expect, it, vi } from "vitest";
import { isMobileCallViewport } from "./src/features/chats/shared/callLifecycle";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

describe("tablet app layout", () => {
  it.each([768, 820, 960, 1024, 1165, 1199])("uses mobile interaction state at %ipx", (width) => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: width <= Number(query.match(/max-width: (\d+)px/)?.[1]) }));
    try { expect(isMobileCallViewport()).toBe(true); } finally { vi.unstubAllGlobals(); }
  });

  it.each([1200, 1201])("uses desktop interaction state at %ipx", (width) => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: width <= Number(query.match(/max-width: (\d+)px/)?.[1]) }));
    try { expect(isMobileCallViewport()).toBe(false); } finally { vi.unstubAllGlobals(); }
  });

  it("starts desktop layout after the tablet boundary with no overlapping range", () => {
    const styles = readCssSource("src/styles.css");
    expect(styles.includes("@media (max-width: 1199px)")).toBe(true);
    expect(styles.includes("@media (min-width: 1200px)")).toBe(true);
    expect(styles.includes("@media (max-width: 1200px)")).toBe(false);
    expect(styles.includes("@media (min-width: 1199px)")).toBe(false);
  });
});
