import { AudioLines, Camera, FileText, Image } from "lucide-react";

export type AttachmentPickerOption = "gallery" | "camera" | "audio" | "file";

type AttachmentPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  onPick: (option: AttachmentPickerOption) => void;
};

const OPTIONS: Array<{
  id: AttachmentPickerOption;
  label: string;
  description: string;
  icon: typeof Image;
}> = [
  {
    id: "gallery",
    label: "Gallery",
    description: "Photos and videos",
    icon: Image
  },
  {
    id: "camera",
    label: "Camera",
    description: "Take a photo",
    icon: Camera
  },
  {
    id: "audio",
    label: "Audio",
    description: "Music and voice files",
    icon: AudioLines
  },
  {
    id: "file",
    label: "File",
    description: "Documents",
    icon: FileText
  }
];

export default function AttachmentPickerSheet({
  open,
  onClose,
  onPick
}: AttachmentPickerSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="attachment-picker-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="attachment-picker-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Attach"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="attachment-picker-sheet-handle" aria-hidden="true" />
        <div className="attachment-picker-sheet-title">Attach</div>
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              type="button"
              className="attachment-picker-sheet-item"
              onClick={() => onPick(option.id)}
            >
              <span className="attachment-picker-sheet-icon" aria-hidden="true">
                <Icon size={22} />
              </span>
              <span className="attachment-picker-sheet-copy">
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </span>
            </button>
          );
        })}
        <button type="button" className="attachment-picker-sheet-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
