import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Crop as CropIcon, Pencil, RotateCcw, Sliders, Undo2, X } from "lucide-react";
import type { PendingLocalAttachment } from "../features/chats/shared/types";
import { buildPhotoFilter, PHOTO_EDITOR_FEATURES } from "./PhotoEditor";

interface Stroke {
  color: string;
  width: number;
  points: { x: number; y: number }[]; // normalized [0..1]
}

interface CropRect {
  x: number; // 0..100 percentage
  y: number; // 0..100 percentage
  width: number; // 0..100 percentage
  height: number; // 0..100 percentage
}

interface ImageEditorModalProps {
  pending: PendingLocalAttachment;
  onSave: (updatedFile: File) => void;
  onClose: () => void;
}

const COLOR_PRESETS = [
  "#ffffff",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#000000"
];
const PEN_SIZES = [
  { label: "Fine", width: 2 },
  { label: "Medium", width: 4 },
  { label: "Bold", width: 8 }
];

export function ImageEditorModal({ pending, onSave, onClose }: ImageEditorModalProps) {
  const editorFeatures = PHOTO_EDITOR_FEATURES.media;
  const [activeTab, setActiveTab] = useState<"adjust" | "crop" | "draw" | null>(null);

  // Adjustments
  const [brightness, setBrightness] = useState<number>(100); // 50 - 150
  const [contrast, setContrast] = useState<number>(100); // 50 - 150
  const [gamma, setGamma] = useState<number>(1.0); // 0.2 - 2.2

  // Crop
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 100, height: 100 });
  const [selectedRatio, setSelectedRatio] = useState<string>("free");

  // Drawing
  const [drawColor, setDrawColor] = useState<string>("#ef4444");
  const [drawWidth, setDrawWidth] = useState<number>(4);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const currentStrokeRef = useRef<{ color: string; width: number; points: { x: number; y: number }[] } | null>(null);

  // Image reference & state
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load image element
  useEffect(() => {
    if (!pending.previewUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setImgElement(img);
    img.src = pending.previewUrl;
  }, [pending.previewUrl]);

  // Reset function
  const handleReset = () => {
    setBrightness(100);
    setContrast(100);
    setGamma(1.0);
    setCrop({ x: 0, y: 0, width: 100, height: 100 });
    setSelectedRatio("free");
    setStrokes([]);
  };

  // Aspect ratio handlers
  const applyAspectRatio = (ratio: string) => {
    setSelectedRatio(ratio);
    if (ratio === "free") {
      setCrop({ x: 0, y: 0, width: 100, height: 100 });
      return;
    }

    if (!imgElement) return;
    const imgAspect = imgElement.width / imgElement.height;
    let targetAspect = 1.0;
    if (ratio === "1:1") targetAspect = 1.0;
    else if (ratio === "4:3") targetAspect = 4 / 3;
    else if (ratio === "16:9") targetAspect = 16 / 9;

    let newWidth = 100;
    let newHeight = 100;

    if (imgAspect > targetAspect) {
      // Image is wider than target ratio
      newWidth = (targetAspect / imgAspect) * 100;
    } else {
      // Image is taller than target ratio
      newHeight = (imgAspect / targetAspect) * 100;
    }

    const x = (100 - newWidth) / 2;
    const y = (100 - newHeight) / 2;
    setCrop({ x, y, width: newWidth, height: newHeight });
  };

  // Drawing mouse/touch handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTab !== "draw" || !drawCanvasRef.current) return;
    e.preventDefault();
    const rect = drawCanvasRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));

    setIsDrawing(true);
    const newStroke = { color: drawColor, width: drawWidth, points: [{ x, y }] };
    currentStrokeRef.current = newStroke;
    setStrokes((prev) => [...prev, newStroke]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || activeTab !== "draw" || !drawCanvasRef.current || !currentStrokeRef.current) return;
    e.preventDefault();
    const rect = drawCanvasRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));

    currentStrokeRef.current.points.push({ x, y });
    // Trigger re-render of canvas
    setStrokes((prev) => [...prev.slice(0, -1), { ...currentStrokeRef.current! }]);
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    currentStrokeRef.current = null;
  };

  // Render drawing canvas overlay
  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    strokes.forEach((stroke) => {
      if (stroke.points.length < 1) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = (stroke.width / 100) * canvas.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const p0 = stroke.points[0];
      ctx.moveTo(p0.x * canvas.width, p0.y * canvas.height);

      for (let i = 1; i < stroke.points.length; i++) {
        const p = stroke.points[i];
        ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
      }
      ctx.stroke();
    });
  }, [strokes, imgElement]);

  // Save changes & process canvas export
  const handleSave = useCallback(async () => {
    if (!imgElement) return;
    setIsProcessing(true);

    try {
      // Source image dimensions
      const origW = imgElement.naturalWidth || imgElement.width;
      const origH = imgElement.naturalHeight || imgElement.height;

      // Calculate crop rect in pixels
      const cropX = Math.round((crop.x / 100) * origW);
      const cropY = Math.round((crop.y / 100) * origH);
      const cropW = Math.max(1, Math.round((crop.width / 100) * origW));
      const cropH = Math.max(1, Math.round((crop.height / 100) * origH));

      // Offscreen canvas for processing
      const canvas = document.createElement("canvas");
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Could not get 2d context");
      }

      // Step 1: Draw base image (cropped area) with Brightness and Contrast
      ctx.filter = buildPhotoFilter({ brightness, contrast, gamma });
      ctx.drawImage(imgElement, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      ctx.filter = "none";

      // Step 2: Apply Gamma Correction if gamma !== 1.0
      if (Math.abs(gamma - 1.0) > 0.01) {
        const imgData = ctx.getImageData(0, 0, cropW, cropH);
        const data = imgData.data;
        const gammaCorrection = 1 / gamma;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, Math.max(0, Math.round(Math.pow(data[i] / 255, gammaCorrection) * 255)));
          data[i + 1] = Math.min(255, Math.max(0, Math.round(Math.pow(data[i + 1] / 255, gammaCorrection) * 255)));
          data[i + 2] = Math.min(255, Math.max(0, Math.round(Math.pow(data[i + 2] / 255, gammaCorrection) * 255)));
        }
        ctx.putImageData(imgData, 0, 0);
      }

      // Step 3: Draw annotation strokes mapped to cropped space
      strokes.forEach((stroke) => {
        if (stroke.points.length < 1) return;
        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        // Stroke width relative to uncropped canvas width
        ctx.lineWidth = (stroke.width / 100) * origW;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        const mapPoint = (pt: { x: number; y: number }) => {
          const px = pt.x * origW;
          const py = pt.y * origH;
          return {
            x: px - cropX,
            y: py - cropY
          };
        };

        const p0 = mapPoint(stroke.points[0]);
        ctx.moveTo(p0.x, p0.y);

        for (let i = 1; i < stroke.points.length; i++) {
          const p = mapPoint(stroke.points[i]);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      });

      // Step 4: Export blob & create File
      const mimeType = pending.file.type || "image/png";
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), mimeType, 0.92)
      );

      if (blob) {
        const editedFile = new File([blob], pending.file.name, {
          type: mimeType,
          lastModified: Date.now()
        });
        onSave(editedFile);
      }
    } catch (err) {
      console.error("Failed to edit image", err);
    } finally {
      setIsProcessing(false);
    }
  }, [brightness, contrast, crop, gamma, imgElement, onSave, pending.file, strokes]);

  return createPortal(
    <div className="image-editor-backdrop" role="dialog" aria-modal="true" aria-label="Edit image">
      <div className="image-editor-modal">
        {/* Header */}
        <header className="image-editor-header">
          <div className="image-editor-title">
            <span className="ms-icon" aria-hidden="true">edit</span>
            <h3>Edit Image</h3>
          </div>
          <div className="image-editor-header-actions">
            <button
              type="button"
              className="image-editor-btn-secondary"
              onClick={handleReset}
              title="Reset all edits"
            >
              <RotateCcw size={16} />
              <span>Reset</span>
            </button>
            <button
              type="button"
              className="image-editor-close-btn"
              onClick={onClose}
              aria-label="Close image editor"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* Stage / Preview */}
        <div className="image-editor-stage" ref={previewContainerRef}>
          {pending.previewUrl ? (
            <div className="image-editor-preview-wrapper">
              <img
                src={pending.previewUrl}
                alt="Preview"
                className="image-editor-base-img"
                style={{
                  filter: buildPhotoFilter({ brightness, contrast, gamma }),
                  clipPath: `inset(${crop.y}% ${100 - (crop.x + crop.width)}% ${100 - (crop.y + crop.height)}% ${crop.x}%)`
                }}
              />
              {/* Drawing canvas overlay */}
              <canvas
                ref={drawCanvasRef}
                width={imgElement?.naturalWidth || 800}
                height={imgElement?.naturalHeight || 600}
                className={`image-editor-draw-canvas${activeTab === "draw" ? " is-active" : ""}`}
                style={{
                  clipPath: `inset(${crop.y}% ${100 - (crop.x + crop.width)}% ${100 - (crop.y + crop.height)}% ${crop.x}%)`
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              />
              {/* Crop guide overlay when crop tab is active */}
              {activeTab === "crop" && (
                <div
                  className="image-editor-crop-overlay"
                  style={{
                    left: `${crop.x}%`,
                    top: `${crop.y}%`,
                    width: `${crop.width}%`,
                    height: `${crop.height}%`
                  }}
                >
                  <div className="crop-corner crop-corner--tl" />
                  <div className="crop-corner crop-corner--tr" />
                  <div className="crop-corner crop-corner--bl" />
                  <div className="crop-corner crop-corner--br" />
                </div>
              )}
            </div>
          ) : (
            <div className="image-editor-empty">No image preview available</div>
          )}
        </div>

        {/* Navigation Tabs */}
        <nav className="image-editor-tabs">
          <button
            type="button"
            className={`image-editor-tab${activeTab === "adjust" ? " is-active" : ""}`}
            aria-label="Adjust image"
            onClick={() => setActiveTab((tab) => tab === "adjust" ? null : "adjust")}
          >
            <Sliders size={18} />
          </button>
          <button
            type="button"
            className={`image-editor-tab${activeTab === "crop" ? " is-active" : ""}`}
            aria-label="Crop image"
            onClick={() => setActiveTab((tab) => tab === "crop" ? null : "crop")}
          >
            <CropIcon size={18} />
          </button>
          {editorFeatures.drawing && <button
            type="button"
            className={`image-editor-tab${activeTab === "draw" ? " is-active" : ""}`}
            aria-label="Draw on image"
            onClick={() => setActiveTab((tab) => tab === "draw" ? null : "draw")}
          >
            <Pencil size={18} />
          </button>}
        </nav>

        {/* Tab Controls Panel */}
        {activeTab && <div className="image-editor-controls">
          {activeTab === "adjust" && (
            <div className="image-editor-controls-grid">
              <div className="image-editor-control-item">
                <div className="control-label">
                  <span>Brightness</span>
                  <strong>{brightness}%</strong>
                </div>
                <input
                  type="range"
                  min="50"
                  max="150"
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                />
              </div>

              <div className="image-editor-control-item">
                <div className="control-label">
                  <span>Contrast</span>
                  <strong>{contrast}%</strong>
                </div>
                <input
                  type="range"
                  min="50"
                  max="150"
                  value={contrast}
                  onChange={(e) => setContrast(Number(e.target.value))}
                />
              </div>

              <div className="image-editor-control-item">
                <div className="control-label">
                  <span>Gamma</span>
                  <strong>{gamma.toFixed(2)}</strong>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="2.2"
                  step="0.05"
                  value={gamma}
                  onChange={(e) => setGamma(Number(e.target.value))}
                />
              </div>
            </div>
          )}

          {activeTab === "crop" && (
            <div className="image-editor-crop-controls">
              <div className="crop-ratios">
                <span className="control-section-label">Aspect Ratio:</span>
                {["free", "1:1", "4:3", "16:9"].map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`crop-ratio-btn${selectedRatio === r ? " is-active" : ""}`}
                    onClick={() => applyAspectRatio(r)}
                  >
                    {r.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="crop-sliders">
                <div className="image-editor-control-item">
                  <div className="control-label">
                    <span>X Offset</span>
                    <strong>{Math.round(crop.x)}%</strong>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={100 - crop.width}
                    value={crop.x}
                    onChange={(e) => setCrop({ ...crop, x: Number(e.target.value) })}
                  />
                </div>

                <div className="image-editor-control-item">
                  <div className="control-label">
                    <span>Y Offset</span>
                    <strong>{Math.round(crop.y)}%</strong>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={100 - crop.height}
                    value={crop.y}
                    onChange={(e) => setCrop({ ...crop, y: Number(e.target.value) })}
                  />
                </div>

                <div className="image-editor-control-item">
                  <div className="control-label">
                    <span>Width</span>
                    <strong>{Math.round(crop.width)}%</strong>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max={100 - crop.x}
                    value={crop.width}
                    onChange={(e) => setCrop({ ...crop, width: Number(e.target.value) })}
                  />
                </div>

                <div className="image-editor-control-item">
                  <div className="control-label">
                    <span>Height</span>
                    <strong>{Math.round(crop.height)}%</strong>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max={100 - crop.y}
                    value={crop.height}
                    onChange={(e) => setCrop({ ...crop, height: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          )}

          {editorFeatures.drawing && activeTab === "draw" && (
            <div className="image-editor-draw-controls">
              <div className="draw-colors">
                <span className="control-section-label">Color:</span>
                <div className="color-palette">
                  {COLOR_PRESETS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      className={`color-swatch${drawColor === hex ? " is-active" : ""}`}
                      style={{ backgroundColor: hex }}
                      onClick={() => setDrawColor(hex)}
                      aria-label={`Select color ${hex}`}
                    />
                  ))}
                </div>
              </div>

              <div className="draw-settings">
                <div className="draw-pen-selector" role="group" aria-label="Pen size">
                  <span className="control-section-label">Pen:</span>
                  {PEN_SIZES.map((pen) => (
                    <button
                      key={pen.label}
                      type="button"
                      className={`draw-pen-option${drawWidth === pen.width ? " is-active" : ""}`}
                      onClick={() => setDrawWidth(pen.width)}
                      aria-pressed={drawWidth === pen.width}
                    >
                      <span className="draw-pen-sample" style={{ height: pen.width }} aria-hidden="true" />
                      {pen.label}
                    </button>
                  ))}
                </div>
                <div className="image-editor-control-item">
                  <div className="control-label">
                    <span>Brush Size</span>
                    <strong>{drawWidth}px</strong>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={drawWidth}
                    onChange={(e) => setDrawWidth(Number(e.target.value))}
                  />
                </div>

                <button
                  type="button"
                  className="image-editor-btn-secondary draw-undo-btn"
                  disabled={strokes.length === 0}
                  onClick={() => setStrokes((prev) => prev.slice(0, -1))}
                >
                  <Undo2 size={16} />
                  <span>Undo Stroke</span>
                </button>
              </div>
            </div>
          )}
        </div>}

        {/* Footer Actions */}
        <footer className="image-editor-footer">
          <button type="button" className="image-editor-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="image-editor-btn-save"
            disabled={isProcessing}
            onClick={() => void handleSave()}
          >
            <Check size={18} />
            <span>{isProcessing ? "Saving..." : "Done & Apply"}</span>
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
