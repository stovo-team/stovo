import { useState, useId } from "react";
import {
  AudioLines,
  Camera,
  Check,
  FileText,
  FolderArchive,
  Image as ImageIcon,
  MapPin,
  Music,
  Sparkles,
  UploadCloud,
  X
} from "lucide-react";

export type AttachmentPickerOption = "gallery" | "camera" | "audio" | "file" | "location" | "article";

export type AttachmentPickerTab = "gallery" | "file" | "audio" | "location" | "article";

type AttachmentPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  onPick: (option: AttachmentPickerOption) => void;
  onSelectFiles?: (files: File[]) => void;
};

// Preset sample photos for the interactive TG-style gallery grid
const SAMPLE_GALLERY_ITEMS: Array<{
  id: string;
  title: string;
  gradient: string;
  type: "image" | "video";
  duration?: string;
}> = [
  {
    id: "sample-1",
    title: "Photo 1",
    gradient: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
    type: "image"
  },
  {
    id: "sample-2",
    title: "Video 1",
    gradient: "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)",
    type: "video",
    duration: "00:14"
  },
  {
    id: "sample-3",
    title: "Photo 2",
    gradient: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
    type: "image"
  },
  {
    id: "sample-4",
    title: "Photo 3",
    gradient: "linear-gradient(135deg, #10b981 0%, #3b82f6 100%)",
    type: "image"
  },
  {
    id: "sample-5",
    title: "Video 2",
    gradient: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
    type: "video",
    duration: "01:05"
  },
  {
    id: "sample-6",
    title: "Photo 4",
    gradient: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
    type: "image"
  }
];

export default function AttachmentPickerSheet({
  open,
  onClose,
  onPick,
  onSelectFiles
}: AttachmentPickerSheetProps) {
  const [activeTab, setActiveTab] = useState<AttachmentPickerTab>("gallery");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  if (!open) {
    return null;
  }

  function toggleGridItemSelection(id: string) {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function handleSendSelected() {
    if (selectedItemIds.length === 0) return;
    if (onSelectFiles) {
      const generatedFiles: File[] = selectedItemIds.map((id, index) => {
        const item = SAMPLE_GALLERY_ITEMS.find((s) => s.id === id);
        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
          <defs>
            <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#6366f1"/>
              <stop offset="100%" stop-color="#a855f7"/>
            </linearGradient>
          </defs>
          <rect width="800" height="600" fill="url(#g)"/>
          <text x="400" y="300" font-family="sans-serif" font-size="32" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${item?.title ?? `Photo ${index + 1}`}</text>
        </svg>`;
        const blob = new Blob([svgContent], { type: "image/svg+xml" });
        return new File([blob], `${item?.title ?? `photo_${index + 1}`}.svg`, {
          type: "image/svg+xml"
        });
      });
      onSelectFiles(generatedFiles);
    } else {
      onPick("gallery");
    }
    setSelectedItemIds([]);
    onClose();
  }

  const selectedCount = selectedItemIds.length;

  return (
    <div
      className="attachment-picker-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="attachment-picker-sheet tg-style"
        role="dialog"
        aria-modal="true"
        aria-label="Attach media and files"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="attachment-picker-sheet-handle" aria-hidden="true" />

        {/* Header bar */}
        <div className="attachment-picker-header">
          <div className="attachment-picker-header-title">
            {selectedCount > 0 ? (
              <span className="attachment-picker-selected-count">
                {selectedCount} item{selectedCount > 1 ? "s" : ""} selected
              </span>
            ) : (
              <span>Attach</span>
            )}
          </div>
          <button
            type="button"
            className="attachment-picker-close-btn"
            aria-label="Close attachment menu"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body content based on active tab */}
        <div className="attachment-picker-body">
          {activeTab === "gallery" && (
            <div className="attachment-picker-gallery-tab">
              {/* Media Grid */}
              <div className="attachment-picker-grid">
                {/* Camera Tile */}
                <button
                  type="button"
                  className="attachment-picker-grid-tile camera-tile"
                  onClick={() => {
                    onPick("camera");
                    onClose();
                  }}
                  title="Take photo or video"
                >
                  <div className="camera-tile-icon">
                    <Camera size={26} />
                  </div>
                  <span className="camera-tile-label">Camera</span>
                </button>

                {/* Sample media thumbnails */}
                {SAMPLE_GALLERY_ITEMS.map((item) => {
                  const isSelected = selectedItemIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`attachment-picker-grid-tile media-tile ${isSelected ? "selected" : ""}`}
                      style={{ background: item.gradient }}
                      onClick={() => toggleGridItemSelection(item.id)}
                    >
                      {item.duration && (
                        <span className="media-tile-badge">{item.duration}</span>
                      )}
                      {/* Checkbox overlay */}
                      <button
                        type="button"
                        className={`media-tile-checkbox ${isSelected ? "checked" : ""}`}
                        aria-label={`Select ${item.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleGridItemSelection(item.id);
                        }}
                      >
                        {isSelected && <Check size={12} strokeWidth={3} />}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Gallery secondary action button */}
              <button
                type="button"
                className="attachment-picker-secondary-btn"
                onClick={() => {
                  onPick("gallery");
                  onClose();
                }}
              >
                <ImageIcon size={18} />
                <span>Browse from device gallery</span>
              </button>
            </div>
          )}

          {activeTab === "file" && (
            <div className="attachment-picker-list-tab">
              <button
                type="button"
                className="attachment-picker-sheet-item"
                onClick={() => {
                  onPick("file");
                  onClose();
                }}
              >
                <span className="attachment-picker-sheet-icon file-icon">
                  <FileText size={22} />
                </span>
                <span className="attachment-picker-sheet-copy">
                  <strong>Document / File</strong>
                  <span>Send PDF, DOCX, ZIP, or any file</span>
                </span>
              </button>
              <button
                type="button"
                className="attachment-picker-sheet-item"
                onClick={() => {
                  onPick("file");
                  onClose();
                }}
              >
                <span className="attachment-picker-sheet-icon cloud-icon">
                  <UploadCloud size={22} />
                </span>
                <span className="attachment-picker-sheet-copy">
                  <strong>Cloud Storage</strong>
                  <span>Pick from Stovo Family Files</span>
                </span>
              </button>
              <button
                type="button"
                className="attachment-picker-sheet-item"
                onClick={() => {
                  onPick("file");
                  onClose();
                }}
              >
                <span className="attachment-picker-sheet-icon archive-icon">
                  <FolderArchive size={22} />
                </span>
                <span className="attachment-picker-sheet-copy">
                  <strong>Compressed Archive</strong>
                  <span>ZIP, RAR, 7Z files</span>
                </span>
              </button>
            </div>
          )}

          {activeTab === "audio" && (
            <div className="attachment-picker-list-tab">
              <button
                type="button"
                className="attachment-picker-sheet-item"
                onClick={() => {
                  onPick("audio");
                  onClose();
                }}
              >
                <span className="attachment-picker-sheet-icon audio-icon">
                  <Music size={22} />
                </span>
                <span className="attachment-picker-sheet-copy">
                  <strong>Music & Audio File</strong>
                  <span>MP3, WAV, FLAC, M4A</span>
                </span>
              </button>
              <button
                type="button"
                className="attachment-picker-sheet-item"
                onClick={() => {
                  onPick("audio");
                  onClose();
                }}
              >
                <span className="attachment-picker-sheet-icon voice-icon">
                  <AudioLines size={22} />
                </span>
                <span className="attachment-picker-sheet-copy">
                  <strong>Voice Recording</strong>
                  <span>Attach voice message file</span>
                </span>
              </button>
            </div>
          )}

          {activeTab === "location" && (
            <div className="attachment-picker-location-tab">
              <div className="attachment-picker-map-card">
                <div className="attachment-picker-map-bg">
                  <div className="map-pin-pulse">
                    <MapPin size={32} className="map-pin-icon" />
                  </div>
                </div>
                <div className="map-card-info">
                  <strong>Current Location</strong>
                  <span>Accurate within 15 meters</span>
                </div>
              </div>
              <button
                type="button"
                className="attachment-picker-primary-action-btn"
                onClick={() => {
                  onPick("location");
                  onClose();
                }}
              >
                <MapPin size={18} />
                <span>Send My Current Location</span>
              </button>
            </div>
          )}

          {activeTab === "article" && (
            <div className="attachment-picker-article-tab">
              <button
                type="button"
                className="attachment-picker-sheet-item"
                onClick={() => {
                  onPick("article");
                  onClose();
                }}
              >
                <span className="attachment-picker-sheet-icon article-icon">
                  <Sparkles size={22} />
                </span>
                <span className="attachment-picker-sheet-copy">
                  <strong>Create Schedule Plan</strong>
                  <span>Schedule reminder or plan in calendar</span>
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Floating action button when media is selected in grid */}
        {selectedCount > 0 && (
          <div className="attachment-picker-floating-bar">
            <button
              type="button"
              className="attachment-picker-send-btn"
              onClick={handleSendSelected}
            >
              <span>Send {selectedCount} photo{selectedCount > 1 ? "s" : ""}</span>
            </button>
          </div>
        )}

        {/* Telegram-style Bottom Category Navigation Bar */}
        <nav className="attachment-picker-bottom-nav" aria-label="Attachment options">
          <button
            type="button"
            className={`attachment-nav-item ${activeTab === "gallery" ? "active" : ""}`}
            onClick={() => setActiveTab("gallery")}
          >
            <span className="nav-item-icon">
              <ImageIcon size={20} />
            </span>
            <span className="nav-item-label">Gallery</span>
          </button>
          <button
            type="button"
            className={`attachment-nav-item ${activeTab === "file" ? "active" : ""}`}
            onClick={() => setActiveTab("file")}
          >
            <span className="nav-item-icon">
              <FileText size={20} />
            </span>
            <span className="nav-item-label">File</span>
          </button>
          <button
            type="button"
            className={`attachment-nav-item ${activeTab === "audio" ? "active" : ""}`}
            onClick={() => setActiveTab("audio")}
          >
            <span className="nav-item-icon">
              <AudioLines size={20} />
            </span>
            <span className="nav-item-label">Audio</span>
          </button>
          <button
            type="button"
            className={`attachment-nav-item ${activeTab === "location" ? "active" : ""}`}
            onClick={() => setActiveTab("location")}
          >
            <span className="nav-item-icon">
              <MapPin size={20} />
            </span>
            <span className="nav-item-label">Location</span>
          </button>
          <button
            type="button"
            className={`attachment-nav-item ${activeTab === "article" ? "active" : ""}`}
            onClick={() => setActiveTab("article")}
          >
            <span className="nav-item-icon">
              <Sparkles size={20} />
            </span>
            <span className="nav-item-label">Article</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
