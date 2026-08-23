import { Check, RotateCcw, SlidersHorizontal, SunMedium, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import { useStrings } from "../i18n/LanguageContext";

type WallpaperAdjustments = {
  zoom: number;
  brightness: number;
  contrast: number;
  gamma: number;
  hue: number;
  saturation: number;
  blur: number;
};

const DEFAULT_ADJUSTMENTS: WallpaperAdjustments = {
  zoom: 1,
  brightness: 100,
  contrast: 100,
  gamma: 1,
  hue: 0,
  saturation: 100,
  blur: 0
};

const OUTPUT_WIDTH = 1440;
const OUTPUT_HEIGHT = 2560;

interface ChatWallpaperEditorModalProps {
  file: File;
  onSave: (wallpaperFile: File) => void | Promise<void>;
  onClose: () => void;
}

export function ChatWallpaperEditorModal({ file, onSave, onClose }: ChatWallpaperEditorModalProps) {
  const strings = useStrings();
  const [previewUrl, setPreviewUrl] = useState("");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [adjustments, setAdjustments] = useState<WallpaperAdjustments>(DEFAULT_ADJUSTMENTS);
  const [isAdjustmentsOpen, setIsAdjustmentsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const gammaFilterId = `chat-wallpaper-gamma-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    const nextImage = new Image();
    nextImage.onload = () => setImage(nextImage);
    nextImage.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const update = <K extends keyof WallpaperAdjustments>(key: K, value: WallpaperAdjustments[K]) => {
    setAdjustments((current) => ({ ...current, [key]: value }));
  };

  const visualFilter = [
    `brightness(${adjustments.brightness}%)`,
    `contrast(${adjustments.contrast}%)`,
    `hue-rotate(${adjustments.hue}deg)`,
    `saturate(${adjustments.saturation}%)`,
    `blur(${adjustments.blur}px)`,
    `url(#${gammaFilterId})`
  ].join(" ");

  async function handleApply() {
    if (!image) return;
    setIsProcessing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_WIDTH;
      canvas.height = OUTPUT_HEIGHT;
      const context = canvas.getContext("2d", { willReadFrequently: adjustments.gamma !== 1 });
      if (!context) throw new Error("Could not create image canvas");

      context.fillStyle = "#111827";
      context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      const baseScale = Math.max(OUTPUT_WIDTH / image.naturalWidth, OUTPUT_HEIGHT / image.naturalHeight);
      const scale = baseScale * adjustments.zoom;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.filter = [
        `brightness(${adjustments.brightness}%)`,
        `contrast(${adjustments.contrast}%)`,
        `hue-rotate(${adjustments.hue}deg)`,
        `saturate(${adjustments.saturation}%)`,
        `blur(${adjustments.blur}px)`
      ].join(" ");
      context.drawImage(image, (OUTPUT_WIDTH - width) / 2, (OUTPUT_HEIGHT - height) / 2, width, height);
      context.filter = "none";

      if (adjustments.gamma !== 1) {
        const pixels = context.getImageData(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
        for (let index = 0; index < pixels.data.length; index += 4) {
          pixels.data[index] = Math.round(255 * Math.pow(pixels.data[index] / 255, adjustments.gamma));
          pixels.data[index + 1] = Math.round(255 * Math.pow(pixels.data[index + 1] / 255, adjustments.gamma));
          pixels.data[index + 2] = Math.round(255 * Math.pow(pixels.data[index + 2] / 255, adjustments.gamma));
        }
        context.putImageData(pixels, 0, 0);
      }

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) throw new Error("Could not export wallpaper");
      await onSave(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
        type: "image/jpeg",
        lastModified: Date.now()
      }));
    } finally {
      setIsProcessing(false);
    }
  }

  return createPortal(
    <div className="wallpaper-editor-backdrop" role="dialog" aria-modal="true" aria-label={strings.wallpaperEditor.title}>
      <div className="wallpaper-editor-modal">
        <header className="wallpaper-editor-header">
          <div>
            <h3>{strings.wallpaperEditor.title}</h3>
            <p>{strings.wallpaperEditor.previewHelp}</p>
          </div>
          <div className="wallpaper-editor-header-actions">
            <button type="button" className="wallpaper-editor-icon-button" onClick={() => setAdjustments(DEFAULT_ADJUSTMENTS)} aria-label={strings.avatarEditor.reset} title={strings.avatarEditor.reset}>
              <RotateCcw />
            </button>
            <button type="button" className="wallpaper-editor-icon-button" onClick={onClose} aria-label={strings.avatarEditor.cancel} title={strings.avatarEditor.cancel}>
              <X />
            </button>
          </div>
        </header>

        <div className="wallpaper-editor-preview" aria-label={strings.wallpaperEditor.preview}>
          <svg className="wallpaper-editor-svg-filter" aria-hidden="true"><defs><filter id={gammaFilterId}><feComponentTransfer><feFuncR type="gamma" amplitude="1" exponent={adjustments.gamma} offset="0" /><feFuncG type="gamma" amplitude="1" exponent={adjustments.gamma} offset="0" /><feFuncB type="gamma" amplitude="1" exponent={adjustments.gamma} offset="0" /></feComponentTransfer></filter></defs></svg>
          {previewUrl && <img src={previewUrl} alt="" className="wallpaper-editor-preview-image" style={{ filter: visualFilter, transform: `scale(${adjustments.zoom})` }} />}
          <div className="wallpaper-editor-preview-shade" />
          <div className="wallpaper-editor-preview-header">{strings.wallpaperEditor.chatPreview}</div>
          <div className="wallpaper-editor-message wallpaper-editor-message--incoming">{strings.wallpaperEditor.previewIncoming}</div>
          <div className="wallpaper-editor-message wallpaper-editor-message--outgoing">{strings.wallpaperEditor.previewOutgoing}</div>
          <div className="wallpaper-editor-composer">{strings.wallpaperEditor.messagePlaceholder}</div>
        </div>

        <div className="wallpaper-editor-controls">
          <div className="wallpaper-editor-toolbar" aria-label={strings.wallpaperEditor.title}>
            <button type="button" className="wallpaper-editor-toolbar-button" onClick={() => update("zoom", Math.max(0.5, adjustments.zoom - 0.1))} disabled={adjustments.zoom <= 0.5} aria-label={strings.avatarEditor.zoomOut}><ZoomOut /></button>
            <span className="wallpaper-editor-zoom-value">{Math.round(adjustments.zoom * 100)}%</span>
            <button type="button" className="wallpaper-editor-toolbar-button" onClick={() => update("zoom", Math.min(2.5, adjustments.zoom + 0.1))} disabled={adjustments.zoom >= 2.5} aria-label={strings.avatarEditor.zoomIn}><ZoomIn /></button>
            <span className="wallpaper-editor-toolbar-divider" aria-hidden="true" />
            <button type="button" className="wallpaper-editor-toolbar-button" onClick={() => update("brightness", adjustments.brightness === 100 ? 82 : 100)} aria-label={strings.wallpaperEditor.brightness} title={strings.wallpaperEditor.brightness}><SunMedium /></button>
            <button type="button" className="wallpaper-editor-toolbar-button wallpaper-editor-toolbar-button--label" onClick={() => setIsAdjustmentsOpen((open) => !open)} aria-expanded={isAdjustmentsOpen} aria-controls="wallpaper-adjustments"><SlidersHorizontal /><span>{strings.wallpaperEditor.adjustments}</span></button>
          </div>
          <div id="wallpaper-adjustments" className="wallpaper-editor-adjustments" hidden={!isAdjustmentsOpen}>
            <Adjustment label={strings.avatarEditor.zoom} min={0.5} max={2.5} step={0.01} value={adjustments.zoom} unit="×" onChange={(value) => update("zoom", value)} />
            <Adjustment label={strings.wallpaperEditor.brightness} min={0} max={200} value={adjustments.brightness} unit="%" onChange={(value) => update("brightness", value)} />
            <Adjustment label={strings.wallpaperEditor.contrast} min={0} max={200} value={adjustments.contrast} unit="%" onChange={(value) => update("contrast", value)} />
            <Adjustment label={strings.wallpaperEditor.gamma} min={0.2} max={3} step={0.01} value={adjustments.gamma} onChange={(value) => update("gamma", value)} />
            <Adjustment label={strings.wallpaperEditor.hue} min={-180} max={180} value={adjustments.hue} unit="°" onChange={(value) => update("hue", value)} />
            <Adjustment label={strings.wallpaperEditor.saturation} min={0} max={200} value={adjustments.saturation} unit="%" onChange={(value) => update("saturation", value)} />
            <Adjustment label={strings.wallpaperEditor.blur} min={0} max={30} value={adjustments.blur} unit="px" onChange={(value) => update("blur", value)} />
          </div>
        </div>

        <footer className="wallpaper-editor-footer">
          <button type="button" className="avatar-editor-btn-cancel" onClick={onClose} disabled={isProcessing}>{strings.avatarEditor.cancel}</button>
          <button type="button" className="avatar-editor-btn-save" onClick={() => void handleApply()} disabled={isProcessing || !image}><Check /><span>{isProcessing ? strings.settings.savingEllipsis : strings.wallpaperEditor.apply}</span></button>
        </footer>
      </div>
    </div>,
    document.body
  );
}

function Adjustment({ label, min, max, step = 1, value, unit = "", onChange }: { label: string; min: number; max: number; step?: number; value: number; unit?: string; onChange: (value: number) => void }) {
  return <label className="wallpaper-editor-range"><span>{label}<output>{value}{unit}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
