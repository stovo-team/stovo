import { Maximize2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { MessageMarkdown } from "../messageMarkdown";

export function MessageEnlargeModal({
  content,
  renderMarkdown,
  editable = false,
  onClose,
  onChange,
}: {
  content: string;
  renderMarkdown: boolean;
  editable?: boolean;
  onClose: () => void;
  onChange?: (value: string) => void;
}) {
  const [draft, setDraft] = useState(content);

  useEffect(() => {
    setDraft(content);
  }, [content]);

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
          <strong>{editable ? "Compose" : "Message"}</strong>
          <div className="message-enlarge-actions">
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
          {editable ? (
            <textarea
              className="message-enlarge-editor"
              value={draft}
              maxLength={4000}
              autoFocus
              onChange={(event) => {
                const next = event.target.value;
                setDraft(next);
                onChange?.(next);
              }}
            />
          ) : renderMarkdown ? (
            <MessageMarkdown source={content} />
          ) : (
            content
          )}
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
