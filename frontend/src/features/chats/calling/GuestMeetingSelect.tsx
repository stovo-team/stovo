import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

export type GuestMeetingSelectOption = { value: string; label: string };

/** A compact, platform-styled menu — deliberately not a browser select. */
export function GuestMeetingSelect({ ariaLabel, options, value, onChange }: {
  ariaLabel: string;
  options: GuestMeetingSelectOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <span className="guest-link-select" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button type="button" className="guest-link-select-trigger" aria-label={ariaLabel} aria-controls={listId} aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span>{selected?.label}</span><ChevronDown size={18} aria-hidden="true" />
      </button>
      {open && <span className="guest-link-select-menu" id={listId} role="listbox" aria-label={ariaLabel}>
        {options.map((option) => <button type="button" role="option" aria-selected={option.value === value} className={option.value === value ? "selected" : ""} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}</button>)}
      </span>}
    </span>
  );
}
