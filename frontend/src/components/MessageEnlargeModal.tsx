import { Maximize2, Pencil, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

import { MessageMarkdown } from "../messageMarkdown";

export function MessageEnlargeModal({
  content,
  renderMarkdown,
  canEdit,
  onClose,
  onEdit,
}: {
  content: string;
  renderMarkdown: boolean;
  canEdit?: boolean;
  onClose: () => void;
  onEdit?: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="message-enlarge-backdrop" role="presentation" onClick={onClose}>
      <div
        className="message-enlarge-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Message"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="message-enlarge-header">
          <strong>Message</strong>
          <div className="message-enlarge-actions">
            {canEdit && onEdit && (
              <button
                type="button"
                className="message-enlarge-edit"
                onClick={() => {
                  onEdit();
                  onClose();
                }}
              >
                <Pencil size={16} aria-hidden="true" />
                Edit
              </button>
            )}
            <button
              type="button"
              className="message-enlarge-close"
              aria-label="Close"
              onClick={onClose}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="message-enlarge-body">
          {renderMarkdown ? <MessageMarkdown source={content} /> : content}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function MessageEnlargeButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="message-enlarge-button"
      aria-label="Enlarge message"
      title="Enlarge message"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <Maximize2 size={14} aria-hidden="true" />
    </button>
  );
}
