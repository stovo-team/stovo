import { useEffect, useState } from "react";
import { AudioLines, Camera, Check, FileText, Image as ImageIcon, Music, X } from "lucide-react";

import {
  isNativeMediaLibraryAvailable,
  listNativeMedia,
  selectNativeMediaFiles,
  type NativeMediaItem
} from "../native/mediaLibraryPlugin";

export type AttachmentPickerOption = "gallery" | "camera" | "audio" | "file";
export type AttachmentPickerTab = "gallery" | "file" | "audio";

type AttachmentPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  onPick: (option: AttachmentPickerOption) => void;
  onSelectFiles?: (files: File[]) => void;
};

function formatDuration(durationMs: number): string | null {
  if (durationMs <= 0) return null;
  const seconds = Math.floor(durationMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function AttachmentPickerSheet({ open, onClose, onPick, onSelectFiles }: AttachmentPickerSheetProps) {
  const [activeTab, setActiveTab] = useState<AttachmentPickerTab>("gallery");
  const [media, setMedia] = useState<NativeMediaItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [galleryState, setGalleryState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [isSending, setIsSending] = useState(false);

  const resetSheetState = () => {
    setActiveTab("gallery");
    setSelectedItemIds([]);
    setIsSending(false);
  };

  const closeSheet = () => {
    resetSheetState();
    onClose();
  };

  const loadGallery = async () => {
    if (!isNativeMediaLibraryAvailable()) {
      setGalleryState("empty");
      return;
    }
    setGalleryState("loading");
    try {
      const items = await listNativeMedia();
      setMedia(items);
      setGalleryState(items.length > 0 ? "ready" : "empty");
    } catch {
      setMedia([]);
      setGalleryState("error");
    }
  };

  useEffect(() => {
    if (!open) return;
    resetSheetState();
    void loadGallery();
  }, [open]);

  if (!open) return null;

  const toggleGridItemSelection = (id: string) => {
    setSelectedItemIds((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]);
  };

  const handleSendSelected = async () => {
    if (selectedItemIds.length === 0 || isSending) return;
    if (!isNativeMediaLibraryAvailable()) {
      onPick("gallery");
      closeSheet();
      return;
    }
    setIsSending(true);
    try {
      const files = await selectNativeMediaFiles(selectedItemIds);
      if (files.length > 0) onSelectFiles?.(files);
      closeSheet();
    } catch {
      setIsSending(false);
    }
  };

  const selectedCount = selectedItemIds.length;
  return (
    <div className="attachment-picker-backdrop" role="presentation" onClick={closeSheet}>
      <div className="attachment-picker-sheet tg-style" role="dialog" aria-modal="true" aria-label="Attach media and files" onClick={(event) => event.stopPropagation()}>
        <div className="attachment-picker-sheet-handle" aria-hidden="true" />
        <div className="attachment-picker-header">
          <div className="attachment-picker-header-title">
            {activeTab === "gallery" && selectedCount > 0 ? <span className="attachment-picker-selected-count">{selectedCount} selected</span> : <span>Attach</span>}
          </div>
          <button type="button" className="attachment-picker-close-btn" aria-label="Close attachment menu" onClick={closeSheet}><X size={18} /></button>
        </div>

        <div className="attachment-picker-body">
          {activeTab === "gallery" && (
            <div className="attachment-picker-gallery-tab">
              <div className="attachment-picker-grid">
                <button type="button" className="attachment-picker-grid-tile camera-tile" onClick={() => { onPick("camera"); closeSheet(); }} title="Take photo or video">
                  <span className="camera-tile-icon"><Camera size={26} /></span><span className="camera-tile-label">Camera</span>
                </button>
                {media.map((item) => {
                  const selected = selectedItemIds.includes(item.id);
                  return <button key={item.id} type="button" className={`attachment-picker-grid-tile media-tile ${selected ? "selected" : ""}`} onClick={() => toggleGridItemSelection(item.id)} aria-label={`Select ${item.name}`}>
                    <img src={item.uri} alt="" />
                    {formatDuration(item.durationMs) && <span className="media-tile-badge">{formatDuration(item.durationMs)}</span>}
                    <span className={`media-tile-checkbox ${selected ? "checked" : ""}`}>{selected && <Check size={12} strokeWidth={3} />}</span>
                  </button>;
                })}
              </div>
              {galleryState === "loading" && <p className="attachment-picker-gallery-status">Loading your gallery…</p>}
              {galleryState === "empty" && <p className="attachment-picker-gallery-status">No photos or videos found on this device.</p>}
              {galleryState === "error" && <div className="attachment-picker-gallery-status"><p>Allow photo and video access to show your gallery.</p><button type="button" className="attachment-picker-secondary-btn" onClick={() => void loadGallery()}>Try again</button></div>}
              {!isNativeMediaLibraryAvailable() && <button type="button" className="attachment-picker-secondary-btn" onClick={() => { onPick("gallery"); closeSheet(); }}><ImageIcon size={18} />Choose photos</button>}
            </div>
          )}

          {activeTab === "file" && <div className="attachment-picker-list-tab"><button type="button" className="attachment-picker-sheet-item" onClick={() => { onPick("file"); closeSheet(); }}><span className="attachment-picker-sheet-icon file-icon"><FileText size={22} /></span><span className="attachment-picker-sheet-copy"><strong>Document or file</strong><span>PDF, DOCX, ZIP, or any file</span></span></button></div>}
          {activeTab === "audio" && <div className="attachment-picker-list-tab"><button type="button" className="attachment-picker-sheet-item" onClick={() => { onPick("audio"); closeSheet(); }}><span className="attachment-picker-sheet-icon audio-icon"><Music size={22} /></span><span className="attachment-picker-sheet-copy"><strong>Music or audio file</strong><span>MP3, WAV, FLAC, M4A, and more</span></span></button></div>}
        </div>

        {activeTab === "gallery" && selectedCount > 0 && <div className="attachment-picker-floating-bar"><button type="button" className="attachment-picker-send-btn" disabled={isSending} onClick={() => void handleSendSelected()}>Send {isSending ? "…" : `${selectedCount} item${selectedCount === 1 ? "" : "s"}`}</button></div>}
        <nav className="attachment-picker-bottom-nav" aria-label="Attachment options">
          <button type="button" className={`attachment-nav-item ${activeTab === "gallery" ? "active" : ""}`} onClick={() => setActiveTab("gallery")}><span className="nav-item-icon"><ImageIcon size={20} /></span><span className="nav-item-label">Gallery</span></button>
          <button type="button" className={`attachment-nav-item ${activeTab === "file" ? "active" : ""}`} onClick={() => setActiveTab("file")}><span className="nav-item-icon"><FileText size={20} /></span><span className="nav-item-label">File</span></button>
          <button type="button" className={`attachment-nav-item ${activeTab === "audio" ? "active" : ""}`} onClick={() => setActiveTab("audio")}><span className="nav-item-icon"><AudioLines size={20} /></span><span className="nav-item-label">Audio</span></button>
        </nav>
      </div>
    </div>
  );
}
