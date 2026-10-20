import type { CSSProperties } from "react";

export function storagePreviewVideoStyle(
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  expanded: boolean,
): CSSProperties {
  const largeScreen = viewportWidth >= 1600;
  const widthLimit = largeScreen ? (expanded ? 1920 : 1200) : (expanded ? 1200 : 760);
  const maxWidth = Math.max(1, Math.min(widthLimit, viewportWidth - (expanded ? 82 : 112)));
  const maxHeight = Math.max(1, expanded ? viewportHeight - 112 : Math.min(largeScreen ? 1080 : 720, viewportHeight * (largeScreen ? 0.78 : 0.64)));
  const videoWidth = width > 0 ? width : 16;
  const videoHeight = height > 0 ? height : 9;
  const scale = Math.min(maxWidth / videoWidth, maxHeight / videoHeight);
  return {
    aspectRatio: `${videoWidth} / ${videoHeight}`,
    width: `${Math.round(videoWidth * scale)}px`,
    height: `${Math.round(videoHeight * scale)}px`,
    maxWidth: "100%",
    maxHeight: "100%",
  };
}
