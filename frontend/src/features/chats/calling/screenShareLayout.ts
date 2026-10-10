export type ScreenShareLayout = "side" | "bottom";

export type ScreenSharePresenterSize = { width: number; height: number };

export function getScreenShareBottomRailHeight(viewportHeight: number): number {
  return Math.min(90, Math.max(80, viewportHeight * 0.11));
}

export function getScreenSharePresenterSize(
  width: number,
  height: number,
  layout: ScreenShareLayout,
  bottomRailHeight = getScreenShareBottomRailHeight(height),
): ScreenSharePresenterSize {
  const railWidth = Math.min(168, Math.max(112, width * 0.16));
  const gap = 12;
  const availableWidth = layout === "side" ? width - railWidth - gap : width;
  const availableHeight = layout === "side" ? height : Math.max(0, height - bottomRailHeight - gap);
  const presenterWidth = Math.max(0, Math.min(availableWidth, availableHeight * (16 / 9)));

  return { width: presenterWidth, height: presenterWidth * (9 / 16) };
}

function hasSideRailSpace(
  width: number,
  height: number,
  participantCount: number,
  minimumPresenterHeight: number,
): boolean {
  if (width <= 0 || height <= 0) return false;

  const railWidth = Math.min(168, Math.max(112, width * 0.16));
  const gap = 12;
  const cardHeight = Math.max(80, railWidth * (9 / 16));
  const visibleCardCount = Math.max(1, participantCount);
  const requiredRailHeight = visibleCardCount * cardHeight + Math.max(0, visibleCardCount - 1) * 8;
  const minimumPresenterWidth = 360;

  return width >= minimumPresenterWidth + railWidth + gap
    && height >= Math.max(minimumPresenterHeight, requiredRailHeight);
}

/** Keep real screen sharing on the original full-size 16:9 layout policy. */
export function getScreenShareLayout(width: number, height: number, participantCount: number): ScreenShareLayout {
  const railWidth = Math.min(168, Math.max(112, width * 0.16));
  const presenterHeight = (width - railWidth - 12) * (9 / 16);
  return hasSideRailSpace(width, height, participantCount, Math.max(200, presenterHeight)) ? "side" : "bottom";
}

/** Mock fixtures can shrink vertically to fit beside the participant rail. */
export function getMockScreenShareLayout(width: number, height: number, participantCount: number): ScreenShareLayout {
  return hasSideRailSpace(width, height, participantCount, 200) ? "side" : "bottom";
}
