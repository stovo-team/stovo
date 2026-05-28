import { useEffect } from "react";
import { Download, X } from "lucide-react";

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
      className="modal-backdrop image-lightbox-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="image-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={`Full view of ${title}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="image-lightbox-header">
          <div className="image-lightbox-copy">
            <strong>{title}</strong>
            {subtitle && <span>{subtitle}</span>}
          </div>
          <div className="image-lightbox-actions">
            {onDownload && (
              <button type="button" onClick={onDownload}>
                <Download aria-hidden="true" size={18} />
                <span>Download</span>
              </button>
            )}
            <button type="button" className="icon-button subtle" aria-label="Close image preview" onClick={onClose}>
              <X aria-hidden="true" size={18} />
            </button>
          </div>
        </div>
        <div className="image-lightbox-body">
          <img src={imageUrl} alt={title} />
        </div>
      </section>
    </div>
  );
}
