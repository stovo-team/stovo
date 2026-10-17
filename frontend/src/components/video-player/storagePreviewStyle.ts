import type { CSSProperties } from "react";

export function storagePreviewVideoStyle(
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  expanded: boolean,
): CSSProperties {
  const maxWidth = Math.max(1, Math.min(expanded ? 1200 : 760, viewportWidth - (expanded ? 82 : 112)));
  const maxHeight = Math.max(1, expanded ? viewportHeight - 112 : Math.min(720, viewportHeight * 0.64));
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
