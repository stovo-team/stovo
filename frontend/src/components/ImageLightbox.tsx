import { useEffect } from "react";
import { Download } from "lucide-react";

interface ImageLightboxProps {
  imageUrl: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onDownload?: () => void;
}

export default function ImageLightbox({
  imageUrl,
  title,
  subtitle,
  onClose,
  onDownload
}: ImageLightboxProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="image-lightbox-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <header className="image-lightbox-toolbar">
        <button type="button" className="image-lightbox-close" aria-label="Close image preview" onClick={onClose}>
          <span className="ms-icon ms-icon--24" aria-hidden={true}>
            close
          </span>
        </button>
        <div className="image-lightbox-copy">
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
        {onDownload ? (
          <button type="button" className="image-lightbox-download" onClick={onDownload}>
            <Download aria-hidden="true" size={18} />
            <span>Download</span>
          </button>
        ) : (
          <span className="image-lightbox-toolbar-spacer" aria-hidden={true} />
        )}
      </header>
      <div className="image-lightbox-stage" role="dialog" aria-modal="true" aria-label={`Full view of ${title}`}>
        <img src={imageUrl} alt={title} />
      </div>
    </div>
  );
}
