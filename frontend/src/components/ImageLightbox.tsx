import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, MoreVertical, Share2, X } from "lucide-react";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { shareContent } from "../native/nativeSharePlugin";
import { useStrings } from "../i18n/LanguageContext";

interface ImageLightboxProps {
  imageUrl: string;
  title: string;
  subtitle?: string;
  isExternallyClosing?: boolean;
  onClose: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  onGoToMessage?: () => void;
}

export default function ImageLightbox({
  imageUrl,
  title,
  subtitle,
  isExternallyClosing = false,
  onClose,
  onDownload,
  onShare,
  onGoToMessage
}: ImageLightboxProps) {
  const copy = useStrings().imageViewer;
  const prefersReducedMotion = useReducedMotion();
  const [isClosing, setIsClosing] = useState(false);
  const [isReady, setIsReady] = useState(prefersReducedMotion);
  const [isActionsOpen, setIsActionsOpen] = useState(false);

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

  const handleShare = useCallback(async () => {
    if (onShare) {
      onShare();
      return;
    }

    const result = await shareContent({
      title,
      url: imageUrl,
      dialogTitle: title || copy.shareMedia
    });

    if (result.fallbackToCopy && typeof navigator !== "undefined" && navigator.clipboard && imageUrl) {
      try {
        await navigator.clipboard.writeText(imageUrl);
      } catch {
        // Clipboard fallback failed
      }
    }
  }, [copy.shareMedia, imageUrl, onShare, title]);

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

    const timeout = window.setTimeout(() => onClose(), 280);
    return () => window.clearTimeout(timeout);
  }, [isClosing, onClose, prefersReducedMotion]);

  return createPortal(
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
          aria-label={copy.closePreview}
          onClick={requestClose}
        >
          <X aria-hidden="true" size={24} strokeWidth={2.25} />
        </button>
        <div className="image-lightbox-copy">
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <div className="image-lightbox-actions">
          {onDownload && (
            <button
              type="button"
              className="image-lightbox-download"
              title={copy.download}
              aria-label={copy.download}
              onClick={onDownload}
            >
              <Download aria-hidden="true" size={18} />
            </button>
          )}
          <button
            type="button"
            className="image-lightbox-share"
            title={copy.share}
            aria-label={copy.shareMedia}
            onClick={() => void handleShare()}
          >
            <Share2 aria-hidden="true" size={18} />
          </button>
          {onGoToMessage && (
            <div className="image-lightbox-more-wrap">
              <button
                type="button"
                className="image-lightbox-more"
                aria-label={copy.moreActions}
                aria-expanded={isActionsOpen}
                onClick={() => setIsActionsOpen((open) => !open)}
              >
                <MoreVertical aria-hidden="true" size={22} />
              </button>
              {isActionsOpen && (
                <button
                  type="button"
                  className="image-lightbox-action-menu"
                  onClick={onGoToMessage}
                >
                  {copy.goToMessage}
                </button>
              )}
            </div>
          )}
        </div>
      </header>
      <div className="image-lightbox-stage" role="dialog" aria-modal="true" aria-label={copy.fullView(title)}>
        <img src={imageUrl} alt={title} decoding="async" />
      </div>
    </div>,
    document.body
  );
}
