import { ArrowLeft, Check, Droplet, Focus, RotateCcw, SunMedium } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import { useStrings } from "../i18n/LanguageContext";
import { applyGammaCorrection, buildPhotoFilter, PHOTO_EDITOR_FEATURES } from "./PhotoEditor";

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
const WALLPAPER_EDITOR_FEATURES = PHOTO_EDITOR_FEATURES.wallpaper;

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
  const [activeMenu, setActiveMenu] = useState<"light" | "color" | "blur" | null>(null);
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

  const visualFilter = `${buildPhotoFilter(adjustments)} url(#${gammaFilterId})`;

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
      context.filter = buildPhotoFilter(adjustments);
      context.drawImage(image, (OUTPUT_WIDTH - width) / 2, (OUTPUT_HEIGHT - height) / 2, width, height);
      context.filter = "none";

      applyGammaCorrection(context, OUTPUT_WIDTH, OUTPUT_HEIGHT, adjustments.gamma);

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
        <div className="wallpaper-editor-preview" aria-label={strings.wallpaperEditor.preview} data-drawing-enabled={WALLPAPER_EDITOR_FEATURES.drawing}>
          <svg className="wallpaper-editor-svg-filter" aria-hidden="true"><defs><filter id={gammaFilterId}><feComponentTransfer><feFuncR type="gamma" amplitude="1" exponent={adjustments.gamma} offset="0" /><feFuncG type="gamma" amplitude="1" exponent={adjustments.gamma} offset="0" /><feFuncB type="gamma" amplitude="1" exponent={adjustments.gamma} offset="0" /></feComponentTransfer></filter></defs></svg>
          {previewUrl && <img src={previewUrl} alt="" className="wallpaper-editor-preview-image" style={{ filter: visualFilter, transform: `scale(${adjustments.zoom})` }} />}
          <div className="wallpaper-editor-preview-shade" />
          <div className="wallpaper-editor-preview-header">{strings.wallpaperEditor.chatPreview}</div>
          <div className="wallpaper-editor-message wallpaper-editor-message--incoming">{strings.wallpaperEditor.previewIncoming}</div>
          <div className="wallpaper-editor-message wallpaper-editor-message--outgoing">{strings.wallpaperEditor.previewOutgoing}</div>
          <header className="wallpaper-editor-header">
            <button type="button" className="wallpaper-editor-icon-button" onClick={onClose} aria-label={strings.avatarEditor.cancel} title={strings.avatarEditor.cancel}><ArrowLeft /></button>
            <div className="wallpaper-editor-header-actions">
              <button type="button" className="wallpaper-editor-icon-button" onClick={() => void handleApply()} disabled={isProcessing || !image} aria-label={strings.wallpaperEditor.apply} title={strings.wallpaperEditor.apply}><Check /></button>
              <button type="button" className="wallpaper-editor-icon-button" onClick={() => setAdjustments(DEFAULT_ADJUSTMENTS)} aria-label={strings.avatarEditor.reset} title={strings.avatarEditor.reset}><RotateCcw /></button>
            </div>
          </header>
          <div className="wallpaper-editor-controls" aria-label={strings.wallpaperEditor.title}>
            <EditorMenuButton icon={<SunMedium />} label={strings.wallpaperEditor.brightness} isOpen={activeMenu === "light"} onClick={() => setActiveMenu((menu) => menu === "light" ? null : "light")}>
              <Adjustment label={strings.wallpaperEditor.brightness} min={0} max={200} value={adjustments.brightness} unit="%" onChange={(value) => update("brightness", value)} />
              <Adjustment label={strings.wallpaperEditor.contrast} min={0} max={200} value={adjustments.contrast} unit="%" onChange={(value) => update("contrast", value)} />
              <Adjustment label={strings.wallpaperEditor.gamma} min={0.2} max={3} step={0.01} value={adjustments.gamma} onChange={(value) => update("gamma", value)} />
            </EditorMenuButton>
            <EditorMenuButton icon={<Droplet />} label={strings.wallpaperEditor.hue} isOpen={activeMenu === "color"} onClick={() => setActiveMenu((menu) => menu === "color" ? null : "color")}>
              <Adjustment label={strings.wallpaperEditor.hue} min={-180} max={180} value={adjustments.hue} unit="°" onChange={(value) => update("hue", value)} />
              <Adjustment label={strings.wallpaperEditor.saturation} min={0} max={200} value={adjustments.saturation} unit="%" onChange={(value) => update("saturation", value)} />
            </EditorMenuButton>
            <EditorMenuButton icon={<Focus />} label={strings.wallpaperEditor.blur} isOpen={activeMenu === "blur"} onClick={() => setActiveMenu((menu) => menu === "blur" ? null : "blur")}>
              <Adjustment label={strings.wallpaperEditor.blur} min={0} max={30} value={adjustments.blur} unit="px" onChange={(value) => update("blur", value)} />
            </EditorMenuButton>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Adjustment({ label, min, max, step = 1, value, unit = "", onChange }: { label: string; min: number; max: number; step?: number; value: number; unit?: string; onChange: (value: number) => void }) {
  return <label className="wallpaper-editor-range"><span>{label}<output>{value}{unit}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function EditorMenuButton({ icon, label, isOpen, onClick, children }: { icon: React.ReactNode; label: string; isOpen: boolean; onClick: () => void; children: React.ReactNode }) {
  return <div className="wallpaper-editor-menu">
    <div className="wallpaper-editor-menu-popover" hidden={!isOpen}>{children}</div>
    <button type="button" className="wallpaper-editor-toolbar-button" onClick={onClick} aria-label={label} aria-expanded={isOpen}>{icon}</button>
  </div>;
}
