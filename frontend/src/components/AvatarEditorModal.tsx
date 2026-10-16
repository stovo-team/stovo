import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import { useStrings } from "../i18n/LanguageContext";
import { PopupBackdrop, PopupCloseButton } from "./ui/Popup";

interface AvatarEditorModalProps {
  file: File;
  title?: string;
  applyLabel?: string;
  onSave: (croppedFile: File) => void | Promise<void>;
  onClose: () => void;
}

const CROP_SIZE = 280; // Diameter of circular crop aperture in pixels
const OUTPUT_SIZE = 512; // Exported square canvas resolution

export function AvatarEditorModal({
  file,
  title,
  applyLabel,
  onSave,
  onClose
}: AvatarEditorModalProps) {
  const strings = useStrings();
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);

  // Position and transform state
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1.0); // 1.0 to 3.5
  const [rotation, setRotation] = useState<number>(0); // 0, 90, 180, 270

  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Pointer drag state
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ clientX: number; clientY: number; offsetX: number; offsetY: number }>({
    clientX: 0,
    clientY: 0,
    offsetX: 0,
    offsetY: 0
  });

  // Touch pinch tracking
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const initialPinchDistRef = useRef<number | null>(null);
  const initialPinchZoomRef = useRef<number>(1.0);

  // Create and clean up object URL
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    const img = new Image();
    img.onload = () => {
      setImgElement(img);
    };
    img.src = url;

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Calculate base scale to fill the crop circle initially
  const getBaseScale = useCallback(() => {
    if (!imgElement) return 1.0;
    const isRotatedQuarter = rotation === 90 || rotation === 270;
    const effectiveWidth = isRotatedQuarter ? imgElement.naturalHeight : imgElement.naturalWidth;
    const effectiveHeight = isRotatedQuarter ? imgElement.naturalWidth : imgElement.naturalHeight;

    if (!effectiveWidth || !effectiveHeight) return 1.0;
    return Math.max(CROP_SIZE / effectiveWidth, CROP_SIZE / effectiveHeight);
  }, [imgElement, rotation]);

  const baseScale = getBaseScale();

  // Reset transforms
  const handleReset = () => {
    setOffset({ x: 0, y: 0 });
    setZoom(1.0);
    setRotation(0);
  };

  // Rotate 90 degrees clockwise
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Pointer event handlers for panning
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 1) {
      isDraggingRef.current = true;
      dragStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        offsetX: offset.x,
        offsetY: offset.y
      };
    } else if (activePointersRef.current.size === 2) {
      // Begin pinch
      isDraggingRef.current = false;
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      initialPinchDistRef.current = dist;
      initialPinchZoomRef.current = zoom;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (activePointersRef.current.size === 2 && initialPinchDistRef.current) {
      // Pinch to zoom
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (initialPinchDistRef.current > 0) {
        const factor = dist / initialPinchDistRef.current;
        const nextZoom = Math.min(3.5, Math.max(1.0, initialPinchZoomRef.current * factor));
        setZoom(nextZoom);
      }
      return;
    }

    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.clientX;
      const dy = e.clientY - dragStartRef.current.clientY;
      setOffset({
        x: dragStartRef.current.offsetX + dx,
        y: dragStartRef.current.offsetY + dy
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      initialPinchDistRef.current = null;
    }
    if (activePointersRef.current.size === 0) {
      isDraggingRef.current = false;
    }
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setZoom((prev) => Math.min(3.5, Math.max(1.0, prev * (1 + delta))));
  };

  // Export cropped circle region to Canvas and file
  const handleSave = async () => {
    if (!imgElement) return;
    setIsProcessing(true);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Could not get 2d context");
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const ratio = OUTPUT_SIZE / CROP_SIZE;

      ctx.save();
      // Translate origin to center of output canvas
      ctx.translate(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2);
      // Translate by user offset scaled by ratio
      ctx.translate(offset.x * ratio, offset.y * ratio);
      // Rotate
      ctx.rotate((rotation * Math.PI) / 180);
      // Scale
      const totalScale = baseScale * zoom * ratio;
      ctx.scale(totalScale, totalScale);

      // Draw source image centered
      const natW = imgElement.naturalWidth;
      const natH = imgElement.naturalHeight;
      ctx.drawImage(imgElement, -natW / 2, -natH / 2, natW, natH);
      ctx.restore();

      const mimeType = file.type || "image/jpeg";
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), mimeType, 0.95);
      });

      if (blob) {
        const croppedFile = new File([blob], file.name, {
          type: mimeType,
          lastModified: Date.now()
        });
        await onSave(croppedFile);
      }
    } catch (err) {
      console.error("Failed to crop avatar", err);
    } finally {
      setIsProcessing(false);
    }
  };

  return createPortal(
    <PopupBackdrop className="avatar-editor-backdrop">
      <div className="avatar-editor-modal" role="dialog" aria-modal="true" aria-label={title || strings.avatarEditor.title}>
        {/* Header */}
        <header className="avatar-editor-header">
          <div className="avatar-editor-title">
            <span className="ms-icon" aria-hidden="true">
              account_circle
            </span>
            <h3>{title || strings.avatarEditor.title}</h3>
          </div>
          <div className="avatar-editor-header-actions">
            <button
              type="button"
              className="avatar-editor-btn-icon"
              onClick={handleReset}
              title={strings.avatarEditor.reset}
              aria-label={strings.avatarEditor.reset}
            >
              <RotateCcw size={18} />
            </button>
            <PopupCloseButton className="avatar-editor-close-btn" onClick={onClose} ariaLabel={strings.avatarEditor.cancel} />
          </div>
        </header>

        {/* Interactive Cropping Stage */}
        <div
          className="avatar-editor-stage"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
        >
          {previewUrl && imgElement && (
            <div className="avatar-editor-image-layer">
              <img
                src={previewUrl}
                alt={strings.sharedUi.profilePreview}
                className="avatar-editor-preview-img"
                draggable={false}
                style={{
                  width: `${imgElement.naturalWidth}px`,
                  height: `${imgElement.naturalHeight}px`,
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) rotate(${rotation}deg) scale(${baseScale * zoom})`
                }}
              />
            </div>
          )}

          {/* Circular Cutout Mask & Frame */}
          <div
            className="avatar-crop-mask"
            style={{ width: `${CROP_SIZE}px`, height: `${CROP_SIZE}px` }}
          >
            <div className="avatar-crop-ring" />
          </div>

          <div className="avatar-editor-hint">
            <span>{strings.avatarEditor.dragHint}</span>
          </div>
        </div>

        {/* Transform Controls */}
        <div className="avatar-editor-controls">
          <div className="avatar-editor-zoom-row">
            <button
              type="button"
              className="avatar-editor-btn-icon"
              onClick={() => setZoom((prev) => Math.max(1.0, prev - 0.15))}
              title={strings.avatarEditor.zoomOut}
              aria-label={strings.avatarEditor.zoomOut}
              disabled={zoom <= 1.0}
            >
              <Minus size={16} />
            </button>

            <div className="avatar-editor-slider-wrap">
              <input
                type="range"
                min="1.0"
                max="3.5"
                step="0.01"
                value={zoom}
                aria-label={strings.avatarEditor.zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </div>

            <button
              type="button"
              className="avatar-editor-btn-icon"
              onClick={() => setZoom((prev) => Math.min(3.5, prev + 0.15))}
              title={strings.avatarEditor.zoomIn}
              aria-label={strings.avatarEditor.zoomIn}
              disabled={zoom >= 3.5}
            >
              <Plus size={16} />
            </button>

            <div className="avatar-editor-controls-divider" />

            <button
              type="button"
              className="avatar-editor-btn-icon"
              onClick={handleRotate}
              title={strings.avatarEditor.rotate}
              aria-label={strings.avatarEditor.rotate}
            >
              <RotateCw size={18} />
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <footer className="avatar-editor-footer">
          <button
            type="button"
            className="avatar-editor-btn-cancel"
            onClick={onClose}
            disabled={isProcessing}
          >
            {strings.avatarEditor.cancel}
          </button>
          <button
            type="button"
            className="avatar-editor-btn-save"
            disabled={isProcessing || !imgElement}
            onClick={() => void handleSave()}
          >
            <Check size={18} />
            <span>
              {isProcessing
                ? strings.settings.savingEllipsis
                : applyLabel || strings.avatarEditor.apply}
            </span>
          </button>
        </footer>
      </div>
    </PopupBackdrop>,
    document.body
  );
}
