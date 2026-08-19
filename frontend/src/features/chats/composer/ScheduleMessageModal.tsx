import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, X } from "lucide-react";
import type { PendingLocalAttachment } from "../shared/types";

export interface ScheduleMessageModalProps {
  isOpen: boolean;
  messageText: string;
  attachments: PendingLocalAttachment[];
  onClose: () => void;
  onConfirmSchedule: (scheduledDate: Date) => void;
}

function toLocalDatetimeInputString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ScheduleMessageModal({
  isOpen,
  messageText,
  attachments,
  onClose,
  onConfirmSchedule
}: ScheduleMessageModalProps) {
  const [selectedDatetimeStr, setSelectedDatetimeStr] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 60);
    return toLocalDatetimeInputString(d);
  });

  const nowMinStr = useMemo(() => {
    return toLocalDatetimeInputString(new Date());
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const d = new Date();
      d.setMinutes(d.getMinutes() + 60);
      setSelectedDatetimeStr(toLocalDatetimeInputString(d));
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const parsedDate = new Date(selectedDatetimeStr);
  const isValidFuture = !Number.isNaN(parsedDate.getTime()) && parsedDate.getTime() > Date.now();

  function applyPreset(offsetMinutes: number, setHours?: number, setMinutes?: number, addDays: number = 0) {
    const d = new Date();
    if (addDays > 0) {
      d.setDate(d.getDate() + addDays);
    }
    if (setHours !== undefined) {
      d.setHours(setHours, setMinutes ?? 0, 0, 0);
    } else {
      d.setMinutes(d.getMinutes() + offsetMinutes);
    }
    setSelectedDatetimeStr(toLocalDatetimeInputString(d));
  }

  function handleConfirm() {
    if (!isValidFuture) return;
    onConfirmSchedule(parsedDate);
    onClose();
  }

  const previewText = (messageText ?? "").trim();
  const previewSnippet = previewText
    ? previewText.length > 80
      ? `${previewText.slice(0, 80)}…`
      : previewText
    : attachments && attachments.length > 0
    ? `${attachments.length} attachment${attachments.length > 1 ? "s" : ""}`
    : "Empty message";

  const modalContent = (
    <div
      className="modal-backdrop schedule-modal-backdrop"
      onClick={onClose}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div
        className="modal-card schedule-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-modal-title"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="modal-card-header">
          <div className="modal-card-title-wrap">
            <CalendarClock size={20} className="modal-card-header-icon" aria-hidden="true" />
            <h2 id="schedule-modal-title" className="modal-card-title">
              Schedule Message
            </h2>
          </div>
          <button
            type="button"
            className="modal-card-close-btn"
            onClick={onClose}
            aria-label="Close schedule dialog"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-card-body">
          <div className="schedule-preview-box">
            <span className="schedule-preview-label">Message:</span>
            <span className="schedule-preview-text">"{previewSnippet}"</span>
          </div>

          <div className="schedule-presets-label">Quick Presets:</div>
          <div className="schedule-presets-grid">
            <button
              type="button"
              className="schedule-preset-chip"
              onClick={() => applyPreset(30)}
            >
              In 30 mins
            </button>
            <button
              type="button"
              className="schedule-preset-chip"
              onClick={() => applyPreset(60)}
            >
              In 1 hour
            </button>
            <button
              type="button"
              className="schedule-preset-chip"
              onClick={() => applyPreset(0, 9, 0, 1)}
            >
              Tomorrow 09:00
            </button>
            <button
              type="button"
              className="schedule-preset-chip"
              onClick={() => applyPreset(0, 18, 0, 1)}
            >
              Tomorrow 18:00
            </button>
          </div>

          <div className="schedule-input-group">
            <label htmlFor="schedule-datetime-input" className="schedule-input-label">
              Send Date & Time:
            </label>
            <input
              id="schedule-datetime-input"
              type="datetime-local"
              className="schedule-datetime-input"
              value={selectedDatetimeStr}
              min={nowMinStr}
              onChange={(e) => setSelectedDatetimeStr(e.target.value)}
            />
          </div>

          {!isValidFuture && (
            <p className="schedule-error-hint">Please choose a future date and time.</p>
          )}
        </div>

        <div className="modal-card-footer modal-card-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!isValidFuture}
            onClick={handleConfirm}
          >
            Schedule Message
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined" || !document.body) {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
}
