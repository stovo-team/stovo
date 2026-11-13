import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { Check, Crop as CropIcon, Pencil, RotateCw, RotateCcw, Sliders, Undo2 } from "lucide-react";
import type { PendingLocalAttachment } from "../features/chats/shared/types";
import { DESIGN_COLOR_VALUES } from "../design-system/palette";
import { buildPhotoFilter, fitPhotoDimensions, PHOTO_EDITOR_FEATURES, rotateNormalizedPoint, unrotateNormalizedPoint } from "./PhotoEditor";
import { useStrings } from "../i18n/LanguageContext";
import { PopupBackdrop, PopupCloseButton } from "./ui/Popup";

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

const COLOR_PRESETS = DESIGN_COLOR_VALUES.imageEditor.presetColors;
export function ImageEditorModal({ pending, onSave, onClose }: ImageEditorModalProps) {
  const copy = useStrings().imageEditor;
  const isNativeEditor = Capacitor.isNativePlatform();
  const penSizes = [
    { label: copy.fine, width: 2 },
    { label: copy.medium, width: 4 },
    { label: copy.bold, width: 8 }
  ];
  const editorFeatures = PHOTO_EDITOR_FEATURES.media;
  const [activeTab, setActiveTab] = useState<"adjust" | "crop" | "draw" | null>(null);

  // Adjustments
  const [brightness, setBrightness] = useState<number>(100); // 50 - 150
  const [contrast, setContrast] = useState<number>(100); // 50 - 150
  const [gamma, setGamma] = useState<number>(1.0); // 0.2 - 2.2

  // Crop
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 100, height: 100 });
  const [selectedRatio, setSelectedRatio] = useState<string>("free");
  const [rotation, setRotation] = useState(0);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);

  // Drawing
  const [drawColor, setDrawColor] = useState<string>(DESIGN_COLOR_VALUES.imageEditor.defaultStroke);
  const [drawWidth, setDrawWidth] = useState<number>(4);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const currentStrokeRef = useRef<{ color: string; width: number; points: { x: number; y: number }[] } | null>(null);

  // Image reference & state
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
    setRotation(0);
  };

  const imageSize = imgElement ? {
    width: imgElement.naturalWidth || imgElement.width,
    height: imgElement.naturalHeight || imgElement.height
  } : null;
  const previewSize = imageSize && isNativeEditor ? (() => {
    const maxWidth = window.innerWidth * 0.88;
    const maxHeight = window.innerHeight * 0.76;
    const rotated = rotation % 180 === 90;
    const availableWidth = rotated ? maxHeight : maxWidth;
    const availableHeight = rotated ? maxWidth : maxHeight;
    const scale = Math.min(
      1,
      1024 / Math.max(imageSize.width, imageSize.height, 1),
      availableWidth / (rotated ? imageSize.height : imageSize.width),
      availableHeight / (rotated ? imageSize.width : imageSize.height)
    );
    return { width: Math.max(1, Math.round(imageSize.width * scale)), height: Math.max(1, Math.round(imageSize.height * scale)) };
  })() : imageSize ?? { width: 800, height: 600 };

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

    const sourceTargetAspect = rotation % 180 === 90 ? 1 / targetAspect : targetAspect;
    if (imgAspect > sourceTargetAspect) {
      // Image is wider than target ratio
      newWidth = (sourceTargetAspect / imgAspect) * 100;
    } else {
      // Image is taller than target ratio
      newHeight = (imgAspect / sourceTargetAspect) * 100;
    }

    const x = (100 - newWidth) / 2;
    const y = (100 - newHeight) / 2;
    setCrop({ x, y, width: newWidth, height: newHeight });
  };

  const cropPointFromEvent = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = drawCanvasRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    const displayPoint = {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    };
    const point = unrotateNormalizedPoint(displayPoint, rotation);
    return { x: point.x * 100, y: point.y * 100 };
  };

  const handleCropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activeTab !== "crop") return;
    const point = cropPointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    cropStartRef.current = point;
    setCrop({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const handleCropPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = cropStartRef.current;
    const point = cropPointFromEvent(event);
    if (activeTab !== "crop" || !start || !point) return;
    event.preventDefault();
    const left = Math.min(start.x, point.x);
    const top = Math.min(start.y, point.y);
    setCrop({
      x: left,
      y: top,
      width: Math.max(1, Math.min(100 - left, Math.abs(point.x - start.x))),
      height: Math.max(1, Math.min(100 - top, Math.abs(point.y - start.y)))
    });
  };

  const handleCropPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    cropStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  // Drawing mouse/touch handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTab !== "draw" || !drawCanvasRef.current) return;
    e.preventDefault();
    const rect = drawCanvasRef.current.getBoundingClientRect();
    const displayPoint = { x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)) };
    const { x, y } = unrotateNormalizedPoint(displayPoint, rotation);

    setIsDrawing(true);
    const newStroke = { color: drawColor, width: drawWidth, points: [{ x, y }] };
    currentStrokeRef.current = newStroke;
    setStrokes((prev) => [...prev, newStroke]);
    try { drawCanvasRef.current.setPointerCapture(e.pointerId); } catch { /* pointer capture is optional */ }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || activeTab !== "draw" || !drawCanvasRef.current || !currentStrokeRef.current) return;
    e.preventDefault();
    const rect = drawCanvasRef.current.getBoundingClientRect();
    const displayPoint = { x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)) };
    const { x, y } = unrotateNormalizedPoint(displayPoint, rotation);

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
      ctx.lineWidth = isNativeEditor ? stroke.width * (canvas.width / Math.max(1, canvas.clientWidth)) : (stroke.width / 100) * canvas.width;
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
  }, [isNativeEditor, strokes, imgElement]);

  // Save changes & process canvas export
  const handleSave = useCallback(async () => {
    if (!imgElement) return;
    setIsProcessing(true);
    setSaveError(null);

    try {
      // Source image dimensions
      const origW = imgElement.naturalWidth || imgElement.width;
      const origH = imgElement.naturalHeight || imgElement.height;

      // Calculate crop rect in pixels
      const cropX = Math.max(0, Math.min(origW - 1, Math.round((crop.x / 100) * origW)));
      const cropY = Math.max(0, Math.min(origH - 1, Math.round((crop.y / 100) * origH)));
      const cropW = Math.max(1, Math.min(origW - cropX, Math.round((crop.width / 100) * origW)));
      const cropH = Math.max(1, Math.min(origH - cropY, Math.round((crop.height / 100) * origH)));
      const sourceSize = isNativeEditor ? fitPhotoDimensions(cropW, cropH) : { width: cropW, height: cropH };
      const swapsDimensions = rotation % 180 === 90;
      const outputWidth = swapsDimensions ? sourceSize.height : sourceSize.width;
      const outputHeight = swapsDimensions ? sourceSize.width : sourceSize.height;

      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = sourceSize.width;
      sourceCanvas.height = sourceSize.height;
      const sourceContext = sourceCanvas.getContext("2d");
      if (!sourceContext) {
        throw new Error("Could not get 2d context");
      }

      sourceContext.filter = buildPhotoFilter({ brightness, contrast, gamma });
      sourceContext.drawImage(imgElement, cropX, cropY, cropW, cropH, 0, 0, sourceSize.width, sourceSize.height);
      sourceContext.filter = "none";

      // Step 2: Apply Gamma Correction if gamma !== 1.0
      if (Math.abs(gamma - 1.0) > 0.01) {
        const imgData = sourceContext.getImageData(0, 0, sourceSize.width, sourceSize.height);
        const data = imgData.data;
        const gammaCorrection = 1 / gamma;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, Math.max(0, Math.round(Math.pow(data[i] / 255, gammaCorrection) * 255)));
          data[i + 1] = Math.min(255, Math.max(0, Math.round(Math.pow(data[i + 1] / 255, gammaCorrection) * 255)));
          data[i + 2] = Math.min(255, Math.max(0, Math.round(Math.pow(data[i + 2] / 255, gammaCorrection) * 255)));
        }
        sourceContext.putImageData(imgData, 0, 0);
      }

      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get 2d context");
      if (rotation === 90) {
        ctx.translate(outputWidth, 0);
        ctx.rotate(Math.PI / 2);
      } else if (rotation === 180) {
        ctx.translate(outputWidth, outputHeight);
        ctx.rotate(Math.PI);
      } else if (rotation === 270) {
        ctx.translate(0, outputHeight);
        ctx.rotate(-Math.PI / 2);
      }
      ctx.drawImage(sourceCanvas, 0, 0);

      // Step 3: Draw annotation strokes mapped to cropped space
      strokes.forEach((stroke) => {
        if (stroke.points.length < 1) return;
        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        const previewWidth = Math.max(1, drawCanvasRef.current?.clientWidth ?? outputWidth);
        ctx.lineWidth = isNativeEditor ? stroke.width * (outputWidth / previewWidth) : (stroke.width / 100) * origW;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        const mapPoint = (pt: { x: number; y: number }) => {
          const sourcePoint = { x: (pt.x * origW - cropX) / cropW, y: (pt.y * origH - cropY) / cropH };
          const rotatedPoint = rotateNormalizedPoint(sourcePoint, rotation);
          return { x: rotatedPoint.x * outputWidth, y: rotatedPoint.y * outputHeight };
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
      const requestedMimeType = ["image/jpeg", "image/png", "image/webp"].includes(pending.file.type) ? pending.file.type : "image/jpeg";
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), requestedMimeType, 0.84)
      );

      if (blob) {
        const outputMimeType = blob.type || requestedMimeType;
        const extension = outputMimeType === "image/png" ? ".png" : outputMimeType === "image/webp" ? ".webp" : ".jpg";
        const outputName = `${pending.file.name.replace(/\.[^.]+$/, "")}${extension}`;
        const editedFile = new File([blob], outputName, {
          type: outputMimeType,
          lastModified: Date.now()
        });
        onSave(editedFile);
      } else setSaveError(copy.saveError);
    } catch (err) {
      console.error("Failed to edit image", err);
      setSaveError(copy.saveError);
    } finally {
      setIsProcessing(false);
    }
  }, [brightness, contrast, copy.saveError, crop, gamma, imgElement, isNativeEditor, onSave, pending.file, rotation, strokes]);

  return createPortal(
    <PopupBackdrop className="image-editor-backdrop">
      <div className="image-editor-modal" role="dialog" aria-modal="true" aria-label={copy.editImage}>
        {/* Header */}
        <header className="image-editor-header">
          <div className="image-editor-title">
            <span className="ms-icon" aria-hidden="true">edit</span>
            <h3>{copy.title}</h3>
          </div>
          <div className="image-editor-header-actions">
            <button
              type="button"
              className="image-editor-btn-secondary image-editor-reset-btn"
              onClick={handleReset}
              title={copy.resetAll}
            >
              <RotateCcw size={16} />
              <span>{copy.reset}</span>
            </button>
            <button
              type="button"
              className="image-editor-rotate-btn native-editor-action"
              onClick={() => setRotation((current) => (current + 90) % 360)}
              title={copy.rotatePhoto}
              aria-label={copy.rotatePhoto}
            >
              <RotateCw size={18} />
            </button>
            <PopupCloseButton className="image-editor-close-btn" onClick={onClose} ariaLabel={copy.close} />
          </div>
        </header>

        {/* Stage / Preview */}
        <div className="image-editor-stage" ref={previewContainerRef}>
          {pending.previewUrl ? (
            <div
              className={`image-editor-preview-wrapper${isNativeEditor && activeTab === "crop" ? " is-cropping" : ""}`}
              style={isNativeEditor ? { width: previewSize.width, height: previewSize.height, transform: `rotate(${rotation}deg)` } : undefined}
              onPointerDown={isNativeEditor ? handleCropPointerDown : undefined}
              onPointerMove={isNativeEditor ? handleCropPointerMove : undefined}
              onPointerUp={isNativeEditor ? handleCropPointerUp : undefined}
              onPointerCancel={isNativeEditor ? handleCropPointerUp : undefined}
            >
              <img
                src={pending.previewUrl}
                alt={copy.preview}
                className="image-editor-base-img"
                style={{
                  filter: buildPhotoFilter({ brightness, contrast, gamma }),
                  clipPath: `inset(${crop.y}% ${100 - (crop.x + crop.width)}% ${100 - (crop.y + crop.height)}% ${crop.x}%)`
                }}
              />
              {/* Drawing canvas overlay */}
              <canvas
                ref={drawCanvasRef}
                width={previewSize.width}
                height={previewSize.height}
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
            <div className="image-editor-empty">{copy.noPreview}</div>
          )}
        </div>

        {/* Navigation Tabs */}
        <nav className="image-editor-tabs">
          <button
            type="button"
            className={`image-editor-tab${activeTab === "adjust" ? " is-active" : ""}`}
            aria-label={copy.adjust}
            onClick={() => setActiveTab((tab) => tab === "adjust" ? null : "adjust")}
          >
            <Sliders size={18} />
          </button>
          <button
            type="button"
            className={`image-editor-tab${activeTab === "crop" ? " is-active" : ""}`}
            aria-label={copy.crop}
            onClick={() => setActiveTab((tab) => tab === "crop" ? null : "crop")}
          >
            <CropIcon size={18} />
          </button>
          {editorFeatures.drawing && <button
            type="button"
            className={`image-editor-tab${activeTab === "draw" ? " is-active" : ""}`}
            aria-label={copy.draw}
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
                  <span>{copy.brightness}</span>
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
                  <span>{copy.contrast}</span>
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
                  <span>{copy.gamma}</span>
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
                <span className="control-section-label">{copy.aspectRatio}</span>
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

              <span className="crop-grid-hint">{copy.cropGridHint}</span>
              <div className="crop-sliders desktop-editor-action">
                {([
                  [copy.xOffset, crop.x, 0, 100 - crop.width, (value: number) => setCrop({ ...crop, x: value })],
                  [copy.yOffset, crop.y, 0, 100 - crop.height, (value: number) => setCrop({ ...crop, y: value })],
                  [copy.width, crop.width, 20, 100 - crop.x, (value: number) => setCrop({ ...crop, width: value })],
                  [copy.height, crop.height, 20, 100 - crop.y, (value: number) => setCrop({ ...crop, height: value })]
                ] as const).map(([label, value, min, max, update]) => (
                  <label className="image-editor-control-item" key={label}>
                    <span className="control-label"><span>{label}</span><strong>{Math.round(value)}%</strong></span>
                    <input type="range" min={min} max={max} value={value} onChange={(event) => update(Number(event.target.value))} />
                  </label>
                ))}
              </div>
            </div>
          )}

          {editorFeatures.drawing && activeTab === "draw" && (
            <div className="image-editor-draw-controls">
              <div className="draw-colors">
                <span className="control-section-label">{copy.color}</span>
                <div className="color-palette">
                  {COLOR_PRESETS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      className={`color-swatch${drawColor === hex ? " is-active" : ""}`}
                      style={{ backgroundColor: hex }}
                      onClick={() => setDrawColor(hex)}
                      aria-label={copy.selectColor(hex)}
                    />
                  ))}
                </div>
              </div>

              <div className="draw-settings">
                <div className="draw-pen-selector" role="group" aria-label={copy.penSize}>
                  <span className="control-section-label">{copy.pen}</span>
                  {penSizes.map((pen) => (
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
                    <span>{copy.brushSize}</span>
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
                  <span>{copy.undoStroke}</span>
                </button>
              </div>
            </div>
          )}
        </div>}

        {/* Footer Actions */}
        <footer className="image-editor-footer">
          {saveError && <p className="image-editor-error" role="alert">{saveError}</p>}
          <button type="button" className="image-editor-select-btn native-editor-action" onClick={handleSave} disabled={isProcessing || !imgElement} aria-label={copy.selectPhoto} title={copy.selectPhoto}>
            <Check size={20} strokeWidth={2.5} />
          </button>
          <button type="button" className="image-editor-btn-cancel desktop-editor-action" onClick={onClose}>
            {copy.cancel}
          </button>
          <button
            type="button"
            className="image-editor-btn-save desktop-editor-action"
            disabled={isProcessing}
            onClick={() => void handleSave()}
          >
            <Check size={18} />
            <span>{isProcessing ? copy.saving : copy.done}</span>
          </button>
        </footer>
      </div>
    </PopupBackdrop>,
    document.body
  );
}
