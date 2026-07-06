import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { useReducedMotion } from "../hooks/useReducedMotion";

interface ImageLightboxProps {
  imageUrl: string;
  title: string;
  subtitle?: string;
  isExternallyClosing?: boolean;
  onClose: () => void;
  onDownload?: () => void;
}

export default function ImageLightbox({
  imageUrl,
  title,
  subtitle,
  isExternallyClosing = false,
  onClose,
  onDownload
}: ImageLightboxProps) {
  const prefersReducedMotion = useReducedMotion();
  const [isClosing, setIsClosing] = useState(false);
  const [isReady, setIsReady] = useState(prefersReducedMotion);

  const requestClose = useCallback(() => {
    if (isClosing) {
      return;
    }

    if (prefersReducedMotion) {
      onClose();
      return;
    }

    setIsClosing(true);
  }, [isClosing, onClose, prefersReducedMotion]);

  useEffect(() => {
    if (prefersReducedMotion) {
      setIsReady(true);
      return;
    }

    setIsReady(false);
    const frame = window.requestAnimationFrame(() => {
      setIsReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [imageUrl, prefersReducedMotion]);

  useEffect(() => {
    if (isExternallyClosing) {
      requestClose();
    }
  }, [isExternallyClosing, requestClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        requestClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [requestClose]);

  useEffect(() => {
    if (!isClosing || prefersReducedMotion) {
      return;
    }

    const timeout = window.setTimeout(() => onClose(), 220);
    return () => window.clearTimeout(timeout);
  }, [isClosing, onClose, prefersReducedMotion]);

  return (
    <div
      className={`image-lightbox-backdrop${isReady ? " is-ready" : ""}${isClosing ? " is-closing" : ""}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          requestClose();
        }
      }}
    >
      <header className="image-lightbox-toolbar">
        <button
          type="button"
          className="image-lightbox-close"
          aria-label="Close image preview"
          onClick={requestClose}
        >
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
