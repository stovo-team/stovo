import { Camera, Check, Image as ImageIcon } from "lucide-react";

import { isNativeMediaLibraryAvailable, nativeMediaPreviewUrl, type NativeMediaItem } from "../../native/mediaLibraryPlugin";
import type { MediaPickerState } from "./useMediaPicker";
import { useStrings } from "../../i18n/LanguageContext";

type MediaGalleryGridProps = {
  media: NativeMediaItem[];
  selectedItemIds: string[];
  state: MediaPickerState;
  onToggle: (id: string) => void;
  onPreview: (item: NativeMediaItem) => void;
  onCamera: () => void;
  onChooseGallery: () => void;
  onRetry: () => void;
};

function durationLabel(durationMs: number): string | null {
  if (durationMs <= 0) return null;
  const seconds = Math.floor(durationMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function MediaGalleryGrid({ media, selectedItemIds, state, onToggle, onPreview, onCamera, onChooseGallery, onRetry }: MediaGalleryGridProps) {
  const copy = useStrings().attachments.picker;
  const chooser = <button type="button" className="attachment-picker-secondary-btn" onClick={onChooseGallery}><ImageIcon size={18} />{copy.choosePhotos}</button>;
  return <div className="attachment-picker-gallery-tab">
    <div className="attachment-picker-grid">
      <button type="button" className="attachment-picker-grid-tile camera-tile" onClick={onCamera} title={copy.takePhotoOrVideo}>
        <span className="camera-tile-icon"><Camera size={26} /></span><span className="camera-tile-label">{copy.camera}</span>
      </button>
      {media.map((item) => {
        const selected = selectedItemIds.includes(item.id);
        return <div key={item.id} className={`attachment-picker-grid-tile media-tile ${selected ? "selected" : ""}`}>
          <button type="button" className="media-tile-thumb-btn" onClick={() => onPreview(item)} aria-label={copy.previewItem(item.name)}>
            <img src={nativeMediaPreviewUrl(item)} alt="" loading="lazy" decoding="async" />
            {durationLabel(item.durationMs) && <span className="media-tile-badge">{durationLabel(item.durationMs)}</span>}
          </button>
          <button type="button" className={`media-tile-checkbox ${selected ? "checked" : ""}`} onClick={() => onToggle(item.id)} aria-label={selected ? `Deselect ${item.name}` : `Select ${item.name}`} aria-pressed={selected}>
            {selected && <Check size={12} strokeWidth={3} />}
          </button>
        </div>;
      })}
    </div>
    {state === "loading" && <p className="attachment-picker-gallery-status">{copy.loadingGallery}</p>}
    {state === "empty" && <div className="attachment-picker-gallery-status"><p>{copy.emptyGallery}</p>{chooser}</div>}
    {state === "error" && <div className="attachment-picker-gallery-status"><p>{copy.galleryError}</p>{chooser}<button type="button" className="attachment-picker-secondary-btn" onClick={onRetry}>{copy.retry}</button></div>}
    {!isNativeMediaLibraryAvailable() && chooser}
  </div>;
}
