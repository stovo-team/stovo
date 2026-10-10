export type ScreenShareLayout = "side" | "bottom";

export type ScreenSharePresenterSize = { width: number; height: number };

export function getScreenStreamAspectRatio(stream: MediaStream | null | undefined): number {
  const track = stream?.getVideoTracks().find((item) => item.readyState !== "ended");
  const settings = typeof track?.getSettings === "function" ? track.getSettings() : undefined;
  return settings?.width && settings.height ? settings.width / settings.height : 16 / 9;
}

export function getScreenShareBottomRailHeight(viewportHeight: number): number {
  return Math.min(90, Math.max(80, viewportHeight * 0.11));
}

function getSideRailWidth(width: number): number {
  return Math.max(112, (width - 12) / 6);
}

export function getScreenSharePresenterSize(
  width: number,
  height: number,
  layout: ScreenShareLayout,
  bottomRailHeight = getScreenShareBottomRailHeight(height),
  aspectRatio = 16 / 9,
): ScreenSharePresenterSize {
  const gap = 12;
  const railWidth = getSideRailWidth(width);
  const availableWidth = layout === "side" ? width - railWidth - gap : width;
  const availableHeight = layout === "side" ? height : Math.max(0, height - bottomRailHeight - gap);
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 16 / 9;
  const presenterWidth = Math.max(0, Math.min(availableWidth, availableHeight * ratio));

  return { width: presenterWidth, height: presenterWidth / ratio };
}

function hasSideRailSpace(
  width: number,
  height: number,
  _participantCount: number,
  minimumPresenterHeight: number,
  aspectRatio = 16 / 9,
): boolean {
  if (width <= 0 || height <= 0) return false;

  const gap = 12;
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 16 / 9;
  const minimumPresenterWidth = 560;
  const minimumParticipantWidth = minimumPresenterWidth / 5;
  const requiredHeight = minimumPresenterWidth / ratio;

  return width >= minimumPresenterWidth + minimumParticipantWidth + gap
    && height >= Math.max(minimumPresenterHeight, requiredHeight);
}

/** Keep real screen sharing on the original full-size 16:9 layout policy. */
export function getScreenShareLayout(width: number, height: number, participantCount: number, aspectRatio = 16 / 9): ScreenShareLayout {
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 16 / 9;
  const minimumPresenterHeight = 560 / ratio;
  return hasSideRailSpace(width, height, participantCount, minimumPresenterHeight, ratio) ? "side" : "bottom";
}

/** Mock fixtures can shrink vertically to fit beside the participant rail. */
export function getMockScreenShareLayout(width: number, height: number, participantCount: number, aspectRatio = 16 / 9): ScreenShareLayout {
  return hasSideRailSpace(width, height, participantCount, 560 / aspectRatio, aspectRatio) ? "side" : "bottom";
}
