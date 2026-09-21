import { ChevronDown, Plus } from "lucide-react";
import { useId, useState } from "react";

export type GuestMeetingSelectOption = { value: string; label: string };

/** A compact, platform-styled menu — deliberately not a browser select. */
export function GuestMeetingSelect({ ariaLabel, options, value, onChange, onCreateNew, creating }: {
  ariaLabel: string;
  options: GuestMeetingSelectOption[];
  value: string;
  onChange: (value: string) => void;
  /** When supplied, the menu also lets the user create a chat without leaving the meeting flow. */
  onCreateNew?: (title: string) => Promise<boolean> | boolean;
  creating?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [newChatTitle, setNewChatTitle] = useState("");
  const listId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  async function createNewChat() {
    const title = newChatTitle.trim();
    if (!title || !onCreateNew) return;
    const created = await onCreateNew(title);
    if (!created) return;
    setNewChatTitle("");
    setOpen(false);
  }

  return (
    <span className="guest-link-select" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button type="button" className="guest-link-select-trigger" aria-label={ariaLabel} aria-controls={listId} aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span>{selected?.label ?? "Select or create a chat"}</span><ChevronDown size={18} aria-hidden="true" />
      </button>
      {open && <span className="guest-link-select-menu" id={listId} role="listbox" aria-label={ariaLabel}>
        {options.map((option) => <button type="button" role="option" aria-selected={option.value === value} className={option.value === value ? "selected" : ""} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}</button>)}
        {onCreateNew && <span className="guest-link-select-create">
          <input
            aria-label="New meeting chat name"
            maxLength={255}
            placeholder="e.g. Design review"
            value={newChatTitle}
            onChange={(event) => setNewChatTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void createNewChat();
              }
            }}
          />
          <button type="button" onClick={() => void createNewChat()} disabled={!newChatTitle.trim() || creating}>
            <Plus size={16} aria-hidden="true" />{creating ? "Creating…" : "Create new chat"}
          </button>
        </span>}
      </span>}
    </span>
  );
}
