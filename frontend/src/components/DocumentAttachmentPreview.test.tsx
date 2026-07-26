import { describe, expect, it } from "vitest";

import {
  applyPdfPageZoom,
  clampPdfZoom,
  nextPinchZoom,
  nextWheelZoom,
  PDF_MAX_ZOOM,
  PDF_MIN_ZOOM,
  touchDistance,
} from "./pdfViewerZoom";

describe("PDF viewer zoom helpers", () => {
  it("clamps zoom between min and max", () => {
    expect(clampPdfZoom(0.1)).toBe(PDF_MIN_ZOOM);
    expect(clampPdfZoom(99)).toBe(PDF_MAX_ZOOM);
    expect(clampPdfZoom(1.5)).toBe(1.5);
    expect(clampPdfZoom(Number.NaN)).toBe(1);
  });

  it("computes pinch distance between two touch points", () => {
    expect(touchDistance({ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 })).toBe(5);
  });

  it("scales zoom from a pinch distance ratio", () => {
    expect(nextPinchZoom(1, 100, 200)).toBe(2);
    expect(nextPinchZoom(2, 200, 100)).toBe(1);
    expect(nextPinchZoom(1, 100, 1000)).toBe(PDF_MAX_ZOOM);
    expect(nextPinchZoom(1, 0, 100)).toBe(1);
  });

  it("zooms with ctrl/meta wheel deltas", () => {
    expect(nextWheelZoom(1, -100)).toBeGreaterThan(1);
    expect(nextWheelZoom(1, 100)).toBeLessThan(1);
    expect(nextWheelZoom(1, -1000)).toBe(PDF_MAX_ZOOM);
    expect(nextWheelZoom(1, 1000)).toBe(PDF_MIN_ZOOM);
  });

  it("applies zoom by scaling canvas CSS size from base dimensions", () => {
    const host = document.createElement("div");
    const canvas = document.createElement("canvas");
    canvas.className = "document-viewer-pdf-page";
    canvas.dataset.baseWidth = "200";
    canvas.dataset.baseHeight = "300";
    host.appendChild(canvas);

    applyPdfPageZoom(host, 2);

    expect(canvas.style.width).toBe("400px");
    expect(canvas.style.height).toBe("600px");
  });
});
