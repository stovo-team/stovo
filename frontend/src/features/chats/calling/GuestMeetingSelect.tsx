import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type GuestMeetingSelectOption = { value: string; label: string };

/** A compact, platform-styled menu — deliberately not a browser select. */
export function GuestMeetingSelect({ ariaLabel, options, value, onChange, newChatTitle = "", onNewChatTitleChange, className = "", disabled = false }: {
  ariaLabel: string;
  options: GuestMeetingSelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  newChatTitle?: string;
  onNewChatTitleChange?: (title: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedValueOnOpenRef = useRef(value);
  const trimmedNewChatTitle = newChatTitle.trim();
  const newChatOption = trimmedNewChatTitle ? { value: "new", label: `New chat: ${trimmedNewChatTitle}` } : null;
  const visibleOptions = useMemo(() => newChatOption ? [...options, newChatOption] : options, [options, newChatOption?.label]);
  const selected = visibleOptions.find((option) => option.value === value) ?? visibleOptions[0];

  useEffect(() => {
    if (!open) return;
    const selectedIndex = Math.max(visibleOptions.findIndex((option) => option.value === selectedValueOnOpenRef.current), 0);
    document.getElementById(listId)?.querySelectorAll<HTMLButtonElement>('[role="option"]')[selectedIndex]?.focus();
  }, [listId, open]);

  function selectOption(option: GuestMeetingSelectOption) {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLSpanElement>) {
    if (event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable='true']") && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (!open || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

    const optionButtons = [...(document.getElementById(listId)?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
    if (!optionButtons.length) return;
    event.preventDefault();
    const currentIndex = optionButtons.indexOf(document.activeElement as HTMLButtonElement);
    const selectedIndex = visibleOptions.findIndex((option) => option.value === value);
    const index = event.key === "Home" ? 0
      : event.key === "End" ? optionButtons.length - 1
        : event.key === "ArrowDown" ? (currentIndex < 0 ? Math.max(selectedIndex, 0) : (currentIndex + 1) % optionButtons.length)
          : (currentIndex < 0 ? Math.max(selectedIndex, 0) : (currentIndex - 1 + optionButtons.length) % optionButtons.length);
    optionButtons[index].focus();
  }

  return (
    <span className={`guest-link-select${className ? ` ${className}` : ""}`} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={handleKeyDown}>
      <button ref={triggerRef} type="button" className="guest-link-select-trigger" aria-label={`${ariaLabel}: ${selected?.label ?? "No selection"}`} aria-controls={listId} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => {
        if (open) setOpen(false);
        else {
          selectedValueOnOpenRef.current = value;
          setOpen(true);
        }
      }}>
        <span>{selected?.label ?? "Select or create a chat"}</span><ChevronDown size={18} aria-hidden="true" />
      </button>
      {open && <span className="guest-link-select-menu" id={listId} role="listbox" aria-label={ariaLabel}>
        {visibleOptions.map((option) => <button type="button" role="option" tabIndex={-1} aria-selected={option.value === value} className={option.value === value ? "selected" : ""} key={option.value} onClick={() => selectOption(option)} onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectOption(option);
          }
        }}><span>{option.label}</span>{option.value === value && <Check size={15} aria-hidden="true" />}</button>)}
        {onNewChatTitleChange && <span className="guest-link-select-create">
          <span className="guest-link-select-create-label">Or in a new chat</span>
          <input
            aria-label="New meeting chat name"
            maxLength={255}
            placeholder="e.g. Design review"
            value={newChatTitle}
            onChange={(event) => { onNewChatTitleChange(event.target.value); onChange(event.target.value.trim() ? "new" : options[0]?.value ?? ""); }}
          />
        </span>}
      </span>}
    </span>
  );
}
