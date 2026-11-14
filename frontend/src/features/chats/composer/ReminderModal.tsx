import { useEffect, useMemo, useState, FormEvent, MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { BellRing, Repeat } from "lucide-react";
import { PopupDialog } from "../../../components/ui/Popup";
import { PopupButton } from "../../../components/ui/PopupButton";
import { PopupField } from "../../../components/ui/PopupField";
import { PresetNumberControl } from "../../../components/ui/PresetNumberControl";
import type { ReminderRule } from "../outbox/messageOutboxStore";
import type { PendingLocalAttachment } from "../shared/types";
import { useStrings } from "../../../i18n/LanguageContext";

export interface ReminderModalProps {
  isOpen: boolean;
  messageText: string;
  attachments: PendingLocalAttachment[];
  onClose: () => void;
  onConfirmReminder: (rule: ReminderRule) => void;
}

function formatDateToIsoString(date?: Date | null): string {
  const d = date && !Number.isNaN(date.getTime()) ? date : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTimeToTimeString(date?: Date | null): string {
  const d = date && !Number.isNaN(date.getTime()) ? date : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ReminderModal({
  isOpen,
  messageText = "",
  attachments = [],
  onClose,
  onConfirmReminder
}: ReminderModalProps) {
  const strings = useStrings();
  const copy = strings.auditUi;
  const weekdays = copy.weekdaysShort.map((label, index) => ({ label, value: (index + 1) % 7 }));
  const initialDate = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 60);
    return d;
  }, [isOpen]);

  const [startDate, setStartDate] = useState(() => formatDateToIsoString(initialDate));
  const [startTime, setStartTime] = useState(() => formatTimeToTimeString(initialDate));
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("daily");
  const [selectedDaysOfWeek, setSelectedDaysOfWeek] = useState<number[]>(() => [initialDate.getDay()]);
  const [selectedDaysOfMonth, setSelectedDaysOfMonth] = useState<number[]>(() => [initialDate.getDate()]);
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

  function toggleDayOfWeek(day: number) {
    setSelectedDaysOfWeek((current) => {
      const list = Array.isArray(current) ? current : [];
      if (list.includes(day)) {
        if (list.length === 1) return list;
        return list.filter((d) => d !== day);
      }
      return [...list, day].sort((a, b) => a - b);
    });
  }

  function toggleDayOfMonth(day: number) {
    setSelectedDaysOfMonth((current) => {
      const list = Array.isArray(current) ? current : [];
      if (list.includes(day)) {
        if (list.length === 1) return list;
        return list.filter((d) => d !== day);
      }
      return [...list, day].sort((a, b) => a - b);
    });
  }

  function handleConfirm(event?: FormEvent | ReactMouseEvent) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const safeStartDate = startDate || formatDateToIsoString(new Date());
    const safeStartTime = startTime || "09:00";
    const safeCount = Math.max(1, Math.min(999, Number(repeatCount) || 1));

    const safeDaysOfWeek = Array.isArray(selectedDaysOfWeek) && selectedDaysOfWeek.length > 0 ? selectedDaysOfWeek : [1];
    const safeDaysOfMonth = Array.isArray(selectedDaysOfMonth) && selectedDaysOfMonth.length > 0 ? selectedDaysOfMonth : [1];

    const rule: ReminderRule = {
      frequency,
      startDate: safeStartDate,
      time: safeStartTime,
      repeatCount: safeCount,
      remainingCount: safeCount,
      ...(frequency === "weekly" ? { daysOfWeek: safeDaysOfWeek } : {}),
      ...(frequency === "monthly" ? { daysOfMonth: safeDaysOfMonth } : {})
    };

    onConfirmReminder(rule);
    onClose();
  }

  if (!isOpen) return null;

  const rawText = typeof messageText === "string" ? messageText : String(messageText ?? "");
  const previewText = rawText.trim();
  const safeAttachments = Array.isArray(attachments) ? attachments : [];
  const previewSnippet = previewText
    ? previewText.length > 80
      ? `${previewText.slice(0, 80)}…`
      : previewText
    : safeAttachments.length > 0
    ? `${safeAttachments.length} attachment${safeAttachments.length > 1 ? "s" : ""}`
    : "Empty message";

  let freqText = "daily";
  const daysWeekList = Array.isArray(selectedDaysOfWeek) ? selectedDaysOfWeek : [];
  const daysMonthList = Array.isArray(selectedDaysOfMonth) ? selectedDaysOfMonth : [];
  if (frequency === "weekly") {
    const dayNames = daysWeekList
      .map((val) => weekdays.find((d) => d.value === val)?.label)
      .filter(Boolean)
      .join(", ");
    freqText = `weekly on ${dayNames || "selected days"}`;
  } else if (frequency === "monthly") {
    freqText = `monthly on day(s) ${daysMonthList.join(", ")}`;
  }
  const safeDate = startDate || "start date";
  const safeTime = startTime || "09:00";
  const safeCount = Math.max(1, Number(repeatCount) || 1);
  const repeatSummary = `Starts on ${safeDate} at ${safeTime}, repeats ${freqText} for ${safeCount} time${safeCount > 1 ? "s" : ""}.`;

  const modalContent = (
    <PopupDialog className="reminder-modal-card" ariaLabelledBy="reminder-modal-title" onClose={onClose} closeOnBackdrop closeOnEscape backdropClassName="reminder-modal-backdrop">
      <div className="reminder-modal-content" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onTouchStart={(event) => event.stopPropagation()}>
        <div className="modal-card-header modal-header">
          <div className="modal-card-title-wrap">
            <BellRing size={20} className="modal-card-header-icon" aria-hidden="true" />
            <h2 id="reminder-modal-title" className="modal-card-title">{copy.setRepeatingReminder}</h2>
          </div>
        </div>

        <div className="modal-card-body">
          <div className="reminder-preview-box">
            <span className="reminder-preview-label">{copy.reminderMessage}</span>
            <span className="reminder-preview-text">{previewSnippet}</span>
          </div>

          <div className="reminder-form-row">
            <div className="reminder-form-group">
              <PopupField
                label={copy.startDate}
                id="reminder-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="reminder-form-group">
              <PopupField
                label={copy.exactTime}
                id="reminder-start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
          </div>

          <div className="reminder-form-group">
            <label className="reminder-form-label">{copy.repeatFrequency}</label>
            <div className="reminder-freq-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={frequency === "daily"}
                className={`reminder-freq-tab${frequency === "daily" ? " is-active" : ""}`}
                onClick={() => setFrequency("daily")}
              >{copy.daily}</button>
              <button
                type="button"
                role="tab"
                aria-selected={frequency === "weekly"}
                className={`reminder-freq-tab${frequency === "weekly" ? " is-active" : ""}`}
                onClick={() => setFrequency("weekly")}
              >{copy.weekly}</button>
              <button
                type="button"
                role="tab"
                aria-selected={frequency === "monthly"}
                className={`reminder-freq-tab${frequency === "monthly" ? " is-active" : ""}`}
                onClick={() => setFrequency("monthly")}
              >{copy.monthly}</button>
            </div>
          </div>

          {frequency === "weekly" && (
            <div className="reminder-form-group">
              <label className="reminder-form-label">{copy.customWeekdays}</label>
              <div className="reminder-days-week-grid">
                {weekdays.map((day) => {
                  const isSelected = (Array.isArray(selectedDaysOfWeek) ? selectedDaysOfWeek : []).includes(day.value);
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
              <label className="reminder-form-label">{copy.customMonthDays}</label>
              <div className="reminder-days-month-grid">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((dayNum) => {
                  const isSelected = (Array.isArray(selectedDaysOfMonth) ? selectedDaysOfMonth : []).includes(dayNum);
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
            <label htmlFor="reminder-repeat-count" className="reminder-form-label">{copy.repeatCount}</label>
            <div className="reminder-repeat-presets">
              <PresetNumberControl
                ariaLabel={copy.customCount}
                customLabel={strings.chats?.details?.custom ?? "Custom"}
                presets={[1, 3, 5, 10, 30]}
                id="reminder-repeat-count"
                min={1}
                max={999}
                inputClassName="reminder-count-input"
                value={repeatCount}
                onValueChange={(value) => setRepeatCount(Math.max(1, Number(value) || 1))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleConfirm();
                  }
                }}
              />
            </div>
          </div>

          <div className="reminder-summary-box">
            <Repeat size={16} className="reminder-summary-icon" aria-hidden="true" />
            <span className="reminder-summary-text">{repeatSummary}</span>
          </div>
        </div>

        <div className="modal-card-footer modal-card-actions modal-actions">
          <PopupButton variant="secondary" onClick={onClose}>
            {copy.cancel}
          </PopupButton>
          <PopupButton variant="primary" onClick={handleConfirm}>
            {copy.setReminder}
          </PopupButton>
        </div>
      </div>
    </PopupDialog>
  );

  if (typeof document === "undefined" || !document.body) {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
}
