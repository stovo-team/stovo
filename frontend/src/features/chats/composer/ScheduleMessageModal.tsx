import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from "lucide-react";
import type { PendingLocalAttachment } from "../shared/types";

export interface ScheduleMessageModalProps {
  isOpen: boolean;
  messageText: string;
  attachments: PendingLocalAttachment[];
  onClose: () => void;
  onConfirmSchedule: (scheduledDate: Date) => void;
}

function toLocalDatetimeInputString(date?: Date | null): string {
  const d = date && !Number.isNaN(date.getTime()) ? date : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function sameCalendarDay(left: Date, right: Date): boolean {
  return dateKey(left) === dateKey(right);
}

function formatScheduleDateTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function ScheduleMessageModal({
  isOpen,
  onClose,
  onConfirmSchedule
}: ScheduleMessageModalProps) {
  const [selectedDatetimeStr, setSelectedDatetimeStr] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 60);
    return toLocalDatetimeInputString(d);
  });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  useEffect(() => {
    if (isOpen) {
      const d = new Date();
      d.setMinutes(d.getMinutes() + 60);
      setSelectedDatetimeStr(toLocalDatetimeInputString(d));
      setVisibleMonth(new Date(d.getFullYear(), d.getMonth(), 1));
      setIsDatePickerOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const parsedDate = new Date(selectedDatetimeStr);
  const isValidFuture = !Number.isNaN(parsedDate.getTime()) && parsedDate.getTime() > Date.now();
  const selectedDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const calendarStart = new Date(visibleMonth);
  calendarStart.setDate(1 - ((calendarStart.getDay() + 6) % 7));
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(calendarStart);
    day.setDate(calendarStart.getDate() + index);
    return day;
  });

  function updateSelectedDate(nextDate: Date) {
    const next = new Date(selectedDate);
    next.setFullYear(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
    setSelectedDatetimeStr(toLocalDatetimeInputString(next));
  }

  function updateSelectedTime(part: "hours" | "minutes", value: string) {
    const next = new Date(selectedDate);
    next[part === "hours" ? "setHours" : "setMinutes"](Number(value));
    setSelectedDatetimeStr(toLocalDatetimeInputString(next));
  }

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

  function handleConfirm(e?: React.FormEvent | React.MouseEvent) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!isValidFuture) return;
    onConfirmSchedule(parsedDate);
    onClose();
  }

  const modalContent = (
    <div
      className="modal-backdrop schedule-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.stopPropagation();
        }
      }}
    >
      <section
        className="messenger-modal schedule-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-modal-title"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="modal-card-header modal-header">
          <div className="modal-card-title-wrap">
            <CalendarClock size={20} className="modal-card-header-icon" aria-hidden="true" />
            <h2 id="schedule-modal-title" className="modal-card-title">
              Schedule Message
            </h2>
          </div>
          <button
            type="button"
            className="icon-button subtle icon-button--plain modal-card-close-btn"
            onClick={onClose}
            aria-label="Close schedule dialog"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-card-body">
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
            <span className="schedule-input-label">
              Send Date & Time:
            </span>
            <div className="schedule-date-picker-shell">
              <button
                type="button"
                className="schedule-datetime-trigger"
                aria-expanded={isDatePickerOpen}
                aria-haspopup="dialog"
                onClick={() => setIsDatePickerOpen((open) => !open)}
              >
                <span>{formatScheduleDateTime(selectedDate)}</span>
                <CalendarDays size={17} aria-hidden="true" />
              </button>

              {isDatePickerOpen && (
                <div className="schedule-date-picker" role="dialog" aria-label="Choose date and time">
                  <div className="schedule-calendar-panel">
                    <div className="schedule-calendar-header">
                      <button
                        type="button"
                        className="schedule-calendar-nav"
                        aria-label="Previous month"
                        onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                      >
                        <ChevronLeft size={18} aria-hidden="true" />
                      </button>
                      <strong>{new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(visibleMonth)}</strong>
                      <button
                        type="button"
                        className="schedule-calendar-nav"
                        aria-label="Next month"
                        onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                      >
                        <ChevronRight size={18} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="schedule-calendar-weekdays" aria-hidden="true">
                      {WEEKDAY_LABELS.map((weekday) => <span key={weekday}>{weekday}</span>)}
                    </div>
                    <div className="schedule-calendar-days">
                      {calendarDays.map((day) => {
                        const isOutsideMonth = day.getMonth() !== visibleMonth.getMonth();
                        const isPast = day < today;
                        const isSelected = sameCalendarDay(day, selectedDate);
                        const isToday = sameCalendarDay(day, today);
                        return (
                          <button
                            key={dateKey(day)}
                            type="button"
                            className={`schedule-calendar-day${isOutsideMonth ? " is-outside" : ""}${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
                            disabled={isPast}
                            aria-label={day.toLocaleDateString()}
                            aria-pressed={isSelected}
                            onClick={() => updateSelectedDate(day)}
                          >
                            {day.getDate()}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      className="schedule-calendar-today"
                      onClick={() => {
                        setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                        updateSelectedDate(today);
                      }}
                    >
                      Today
                    </button>
                  </div>
                  <div className="schedule-time-panel">
                    <span className="schedule-time-label"><Clock3 size={15} aria-hidden="true" /> Time</span>
                    <div className="schedule-time-controls">
                      <label>
                        <span className="visually-hidden">Hour</span>
                        <select value={String(selectedDate.getHours()).padStart(2, "0")} onChange={(event) => updateSelectedTime("hours", event.target.value)}>
                          {Array.from({ length: 24 }, (_, hour) => {
                            const value = String(hour).padStart(2, "0");
                            return <option key={value} value={value}>{value}</option>;
                          })}
                        </select>
                      </label>
                      <span className="schedule-time-separator" aria-hidden="true">:</span>
                      <label>
                        <span className="visually-hidden">Minute</span>
                        <select value={String(selectedDate.getMinutes()).padStart(2, "0")} onChange={(event) => updateSelectedTime("minutes", event.target.value)}>
                          {Array.from({ length: 60 }, (_, minute) => {
                            const value = String(minute).padStart(2, "0");
                            return <option key={value} value={value}>{value}</option>;
                          })}
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {!isValidFuture && (
            <p className="schedule-error-hint">Please choose a future date and time.</p>
          )}
        </div>

        <div className="modal-card-footer modal-card-actions modal-actions">
          <button type="button" className="secondary-button btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-button btn-primary"
            disabled={!isValidFuture}
            onClick={handleConfirm}
          >
            Schedule Message
          </button>
        </div>
      </section>
    </div>
  );

  if (typeof document === "undefined" || !document.body) {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
}
