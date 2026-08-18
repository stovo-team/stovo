import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BellRing, Repeat, X } from "lucide-react";
import type { ReminderRule } from "../outbox/messageOutboxStore";
import type { PendingLocalAttachment } from "../shared/types";

export interface ReminderModalProps {
  isOpen: boolean;
  messageText: string;
  attachments: PendingLocalAttachment[];
  onClose: () => void;
  onConfirmReminder: (rule: ReminderRule) => void;
}

const DAYS_OF_WEEK = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
  { label: "Sun", value: 0 }
];

function formatDateToIsoString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTimeToTimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ReminderModal({
  isOpen,
  messageText,
  attachments,
  onClose,
  onConfirmReminder
}: ReminderModalProps) {
  const initialDate = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 60);
    return d;
  }, [isOpen]);

  const [startDate, setStartDate] = useState(() => formatDateToIsoString(initialDate));
  const [startTime, setStartTime] = useState(() => formatTimeToTimeString(initialDate));
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("daily");
  const [selectedDaysOfWeek, setSelectedDaysOfWeek] = useState<number[]>([initialDate.getDay()]);
  const [selectedDaysOfMonth, setSelectedDaysOfMonth] = useState<number[]>([initialDate.getDate()]);
  const [repeatCount, setRepeatCount] = useState<number>(5);

  useEffect(() => {
    if (isOpen) {
      const d = new Date();
      d.setMinutes(d.getMinutes() + 60);
      setStartDate(formatDateToIsoString(d));
      setStartTime(formatTimeToTimeString(d));
      setSelectedDaysOfWeek([d.getDay()]);
      setSelectedDaysOfMonth([d.getDate()]);
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

  function toggleDayOfWeek(day: number) {
    setSelectedDaysOfWeek((current) => {
      if (current.includes(day)) {
        if (current.length === 1) return current;
        return current.filter((d) => d !== day);
      }
      return [...current, day].sort((a, b) => a - b);
    });
  }

  function toggleDayOfMonth(day: number) {
    setSelectedDaysOfMonth((current) => {
      if (current.includes(day)) {
        if (current.length === 1) return current;
        return current.filter((d) => d !== day);
      }
      return [...current, day].sort((a, b) => a - b);
    });
  }

  function handleConfirm() {
    const safeStartDate = startDate || formatDateToIsoString(new Date());
    const safeStartTime = startTime || "09:00";
    const safeCount = Math.max(1, Number(repeatCount) || 1);

    const rule: ReminderRule = {
      frequency,
      startDate: safeStartDate,
      time: safeStartTime,
      repeatCount: safeCount,
      remainingCount: safeCount,
      ...(frequency === "weekly" ? { daysOfWeek: selectedDaysOfWeek.length > 0 ? selectedDaysOfWeek : [1] } : {}),
      ...(frequency === "monthly" ? { daysOfMonth: selectedDaysOfMonth.length > 0 ? selectedDaysOfMonth : [1] } : {})
    };

    onConfirmReminder(rule);
    onClose();
  }

  const previewSnippet = messageText.trim()
    ? messageText.length > 80
      ? `${messageText.slice(0, 80)}…`
      : messageText
    : attachments.length > 0
    ? `${attachments.length} attachment${attachments.length > 1 ? "s" : ""}`
    : "Empty message";

  const repeatSummary = useMemo(() => {
    let freqText = "daily";
    if (frequency === "weekly") {
      const dayNames = selectedDaysOfWeek
        .map((val) => DAYS_OF_WEEK.find((d) => d.value === val)?.label)
        .filter(Boolean)
        .join(", ");
      freqText = `weekly on ${dayNames || "selected days"}`;
    } else if (frequency === "monthly") {
      freqText = `monthly on day(s) ${selectedDaysOfMonth.join(", ")}`;
    }
    const safeDate = startDate || "start date";
    const safeTime = startTime || "09:00";
    const safeCount = Math.max(1, Number(repeatCount) || 1);
    return `Starts on ${safeDate} at ${safeTime}, repeats ${freqText} for ${safeCount} time${safeCount > 1 ? "s" : ""}.`;
  }, [startDate, startTime, frequency, selectedDaysOfWeek, selectedDaysOfMonth, repeatCount]);

  return createPortal(
    <div
      className="modal-backdrop reminder-modal-backdrop"
      onClick={onClose}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="modal-card reminder-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reminder-modal-title"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-card-header">
          <div className="modal-card-title-wrap">
            <BellRing size={20} className="modal-card-header-icon" aria-hidden="true" />
            <h2 id="reminder-modal-title" className="modal-card-title">
              Set Repeating Reminder
            </h2>
          </div>
          <button
            type="button"
            className="modal-card-close-btn"
            onClick={onClose}
            aria-label="Close reminder dialog"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-card-body">
          <div className="reminder-preview-box">
            <span className="reminder-preview-label">Reminder Message:</span>
            <span className="reminder-preview-text">{previewSnippet}</span>
          </div>

          <div className="reminder-form-row">
            <div className="reminder-form-group">
              <label htmlFor="reminder-start-date" className="reminder-form-label">
                Start Date:
              </label>
              <input
                id="reminder-start-date"
                type="date"
                className="reminder-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="reminder-form-group">
              <label htmlFor="reminder-start-time" className="reminder-form-label">
                Exact Time:
              </label>
              <input
                id="reminder-start-time"
                type="time"
                className="reminder-input"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
          </div>

          <div className="reminder-form-group">
            <label className="reminder-form-label">Repeat Frequency:</label>
            <div className="reminder-freq-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={frequency === "daily"}
                className={`reminder-freq-tab${frequency === "daily" ? " is-active" : ""}`}
                onClick={() => setFrequency("daily")}
              >
                Daily
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={frequency === "weekly"}
                className={`reminder-freq-tab${frequency === "weekly" ? " is-active" : ""}`}
                onClick={() => setFrequency("weekly")}
              >
                Weekly
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={frequency === "monthly"}
                className={`reminder-freq-tab${frequency === "monthly" ? " is-active" : ""}`}
                onClick={() => setFrequency("monthly")}
              >
                Monthly
              </button>
            </div>
          </div>

          {frequency === "weekly" && (
            <div className="reminder-form-group">
              <label className="reminder-form-label">Custom Days of the Week:</label>
              <div className="reminder-days-week-grid">
                {DAYS_OF_WEEK.map((day) => {
                  const isSelected = selectedDaysOfWeek.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      className={`reminder-day-chip${isSelected ? " is-selected" : ""}`}
                      onClick={() => toggleDayOfWeek(day.value)}
                      aria-pressed={isSelected}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {frequency === "monthly" && (
            <div className="reminder-form-group">
              <label className="reminder-form-label">Custom Days of the Month:</label>
              <div className="reminder-days-month-grid">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((dayNum) => {
                  const isSelected = selectedDaysOfMonth.includes(dayNum);
                  return (
                    <button
                      key={dayNum}
                      type="button"
                      className={`reminder-month-day-chip${isSelected ? " is-selected" : ""}`}
                      onClick={() => toggleDayOfMonth(dayNum)}
                      aria-pressed={isSelected}
                    >
                      {dayNum}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="reminder-form-group">
            <label htmlFor="reminder-repeat-count" className="reminder-form-label">
              How Many Times to Repeat:
            </label>
            <div className="reminder-repeat-presets">
              {[1, 3, 5, 10, 30].map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`reminder-preset-chip${repeatCount === num ? " is-active" : ""}`}
                  onClick={() => setRepeatCount(num)}
                >
                  {num} time{num > 1 ? "s" : ""}
                </button>
              ))}
            </div>
            <div className="reminder-repeat-custom-row">
              <span className="reminder-repeat-label">Custom count:</span>
              <input
                id="reminder-repeat-count"
                type="number"
                min={1}
                max={999}
                className="reminder-input reminder-count-input"
                value={repeatCount}
                onChange={(e) => setRepeatCount(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>

          <div className="reminder-summary-box">
            <Repeat size={16} className="reminder-summary-icon" aria-hidden="true" />
            <span className="reminder-summary-text">{repeatSummary}</span>
          </div>

          <div className="modal-card-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleConfirm}>
              Set Reminder
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
