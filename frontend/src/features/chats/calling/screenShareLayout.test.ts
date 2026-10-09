import { describe, expect, it } from "vitest";
import { getScreenShareLayout, getScreenSharePresenterSize } from "./screenShareLayout";

describe("screen share layout", () => {
  it("uses the side rail when the 16:9 presenter and participant cards fit", () => {
    expect(getScreenShareLayout(1200, 720, 2)).toBe("side");
  });

  it("moves participants below the presenter when width or height is constrained", () => {
    expect(getScreenShareLayout(450, 720, 2)).toBe("bottom");
    expect(getScreenShareLayout(1200, 150, 2)).toBe("bottom");
  });

  it("uses the bottom row when the side rail would clip the participant list", () => {
    expect(getScreenShareLayout(1200, 720, 8)).toBe("bottom");
  });

  it("sizes the presenter to fit its area while preserving 16:9 in both layouts", () => {
    const side = getScreenSharePresenterSize(1200, 720, "side");
    expect(side.width).toBeLessThanOrEqual(1200 - 168 - 12);
    expect(side.height).toBeLessThanOrEqual(720);
    expect(side.width / side.height).toBeCloseTo(16 / 9);

    const bottom = getScreenSharePresenterSize(1200, 150, "bottom");
    expect(bottom.height).toBeLessThanOrEqual(150 - 72 - 12);
    expect(bottom.width / bottom.height).toBeCloseTo(16 / 9);
  });
});
