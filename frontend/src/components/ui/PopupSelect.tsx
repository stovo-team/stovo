import { ChevronDown, Check } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import "./Popup.css";

export interface PopupSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface PopupSelectProps {
  options: PopupSelectOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  triggerAriaLabel?: string;
  labelledBy?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  placeholder?: string;
  emptyMessage?: string;
  renderOption?: (option: PopupSelectOption, selected: boolean) => ReactNode;
  menuFooter?: ReactNode;
}

export function PopupSelect({
  options,
  value,
  onChange,
  ariaLabel,
  triggerAriaLabel,
  labelledBy,
  disabled = false,
  className = "",
  triggerClassName = "",
  placeholder = "Select an option",
  emptyMessage = "No options available",
  renderOption,
  menuFooter,
}: PopupSelectProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return undefined;

    const focusSelectedOrFirst = () => {
      const enabledOptions = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? [])];
      const selectedOption = enabledOptions.find((option) => option.getAttribute("aria-selected") === "true");
      (selectedOption ?? enabledOptions[0])?.focus();
    };
    focusSelectedOrFirst();

    const closeOnOutsidePress = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("mousedown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function closeAndRestoreFocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function selectOption(option: PopupSelectOption) {
    if (option.disabled) return;
    onChange(option.value);
    closeAndRestoreFocus();
  }

  function enabledOptions() {
    return [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? [])];
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true']")) return;

    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setOpen(true);
      return;
    }

    if (!open || !["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) return;
    const choices = enabledOptions();
    if (event.key === "Enter" || event.key === " ") {
      const activeOption = choices.find((option) => option === document.activeElement);
      if (activeOption) {
        event.preventDefault();
        const option = options.find((candidate) => candidate.value === activeOption.dataset.value);
        if (option) selectOption(option);
      }
      return;
    }
    if (!choices.length) return;

    event.preventDefault();
    const currentIndex = choices.indexOf(document.activeElement as HTMLButtonElement);
    const current = currentIndex < 0 ? Math.max(choices.findIndex((option) => option.dataset.value === value), 0) : currentIndex;
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? choices.length - 1
        : event.key === "ArrowDown" ? (current + 1) % choices.length
          : (current - 1 + choices.length) % choices.length;
    choices[nextIndex].focus();
  }

  return (
    <div
      className={`popup-select${open ? " popup-select--open" : ""}${className ? ` ${className}` : ""}`}
      ref={rootRef}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`popup-select__trigger${triggerClassName ? ` ${triggerClassName}` : ""}`}
        aria-label={triggerAriaLabel ?? (ariaLabel ? `${ariaLabel}: ${selected?.label ?? placeholder}` : undefined)}
        aria-labelledby={labelledBy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span className="popup-select__value">{selected?.label ?? placeholder}</span>
        <ChevronDown className="popup-select__chevron" size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          ref={menuRef}
          className="popup-select__menu"
          role="listbox"
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
        >
          {options.length ? options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                data-value={option.value}
                aria-selected={isSelected}
                className={`popup-select__option${isSelected ? " popup-select__option--selected" : ""}`}
                disabled={option.disabled}
                tabIndex={-1}
                onClick={() => selectOption(option)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectOption(option);
                  }
                }}
              >
                {renderOption ? renderOption(option, isSelected) : <span>{option.label}</span>}
                {isSelected ? <Check className="popup-select__check" size={16} aria-hidden="true" /> : null}
              </button>
            );
          }) : <div className="popup-select__empty">{emptyMessage}</div>}
          {menuFooter ? <div className="popup-select__footer">{menuFooter}</div> : null}
        </div>
      )}
    </div>
  );
}

export default PopupSelect;
