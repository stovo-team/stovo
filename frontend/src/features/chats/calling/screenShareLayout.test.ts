import { describe, expect, it } from "vitest";
import { getMockScreenShareLayout, getScreenShareBottomRailHeight, getScreenShareLayout, getScreenSharePresenterSize } from "./screenShareLayout";

describe("screen share layout", () => {
  it("uses the side rail when the 16:9 presenter and participant cards fit", () => {
    expect(getScreenShareLayout(1200, 720, 2)).toBe("side");
  });

  it("moves participants below the presenter when width or height is constrained", () => {
    expect(getScreenShareLayout(450, 720, 2)).toBe("bottom");
    expect(getScreenShareLayout(1200, 150, 2)).toBe("bottom");
  });

  it("keeps the side rail when the 16:9 screen and 5:1 participant card fit vertically", () => {
    expect(getScreenShareLayout(1200, 400, 2)).toBe("side");
    expect(getMockScreenShareLayout(1200, 400, 2)).toBe("side");
    expect(getScreenShareLayout(800, 260, 2)).toBe("bottom");
  });

  it("keeps a right rail with vertical scrolling when many participants exceed its height", () => {
    expect(getScreenShareLayout(1200, 720, 8)).toBe("side");
  });

  it("sizes the presenter to fit its area while preserving 16:9 in both layouts", () => {
    const side = getScreenSharePresenterSize(1200, 720, "side");
    expect(side.width).toBeLessThanOrEqual(1200 - (1200 - 12) / 6 - 12);
    expect(side.width / ((1200 - 12) / 6)).toBeCloseTo(5);
    expect(side.height).toBeLessThanOrEqual(720);
    expect(side.width / side.height).toBeCloseTo(16 / 9);

    const bottom = getScreenSharePresenterSize(1200, 150, "bottom");
    expect(getScreenShareBottomRailHeight(150)).toBe(80);
    expect(bottom.height).toBeLessThanOrEqual(150 - 80 - 12);
    expect(bottom.width / bottom.height).toBeCloseTo(16 / 9);
  });

  it("preserves real screen-share aspect ratio and uses it when choosing a layout", () => {
    const side = getScreenSharePresenterSize(1200, 800, "side", undefined, 4 / 3);
    expect(side.width / side.height).toBeCloseTo(4 / 3);
    expect(getScreenShareLayout(1200, 400, 2, 4 / 3)).toBe("bottom");
    expect(getScreenShareLayout(1200, 800, 2, 4 / 3)).toBe("side");
  });
});
