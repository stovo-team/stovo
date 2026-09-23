export const PDF_MIN_ZOOM = 0.5;
export const PDF_MAX_ZOOM = 4;

export function getPdfRenderLimits(pageCount: number, devicePixelRatio: number, isConstrainedDevice: boolean) {
  return {
    maxPages: Math.min(pageCount, isConstrainedDevice ? 12 : 40),
    dpr: Math.min(devicePixelRatio || 1, isConstrainedDevice ? 1.5 : 2),
  };
}

export function clampPdfZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(PDF_MAX_ZOOM, Math.max(PDF_MIN_ZOOM, zoom));
}

export function touchDistance(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function nextPinchZoom(
  startZoom: number,
  startDistance: number,
  currentDistance: number,
): number {
  if (!(startDistance > 0) || !(currentDistance > 0)) {
    return clampPdfZoom(startZoom);
  }
  return clampPdfZoom(startZoom * (currentDistance / startDistance));
}

export function nextWheelZoom(currentZoom: number, deltaY: number): number {
  // ctrl/meta+wheel: exponential scale feels natural across trackpads/mice
  const factor = Math.exp(-deltaY * 0.01);
  return clampPdfZoom(currentZoom * factor);
}

export function applyPdfPageZoom(host: HTMLElement, zoom: number): void {
  const z = clampPdfZoom(zoom);
  host.querySelectorAll<HTMLCanvasElement>("canvas.document-viewer-pdf-page").forEach((canvas) => {
    const baseWidth = Number(canvas.dataset.baseWidth);
    const baseHeight = Number(canvas.dataset.baseHeight);
    if (!(baseWidth > 0) || !(baseHeight > 0)) return;
    canvas.style.width = `${baseWidth * z}px`;
    canvas.style.height = `${baseHeight * z}px`;
  });
}
