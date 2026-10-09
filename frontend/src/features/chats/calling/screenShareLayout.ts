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

/** Use a side rail only when both its participant cards and the 16:9 screen fit. */
export function getScreenShareLayout(width: number, height: number, participantCount: number): ScreenShareLayout {
  if (width <= 0 || height <= 0) return "bottom";

  const railWidth = Math.min(168, Math.max(112, width * 0.16));
  const gap = 12;
  const presenterWidth = width - railWidth - gap;
  const presenterHeight = presenterWidth * (9 / 16);
  const cardHeight = Math.max(80, railWidth * (9 / 16));
  const visibleCardCount = Math.max(1, participantCount);
  const requiredRailHeight = visibleCardCount * cardHeight + Math.max(0, visibleCardCount - 1) * 8;
  const minimumPresenterWidth = 360;
  const minimumPresenterHeight = 200;

  return width >= minimumPresenterWidth + railWidth + gap
    && height >= Math.max(minimumPresenterHeight, presenterHeight, requiredRailHeight)
    ? "side"
    : "bottom";
}
