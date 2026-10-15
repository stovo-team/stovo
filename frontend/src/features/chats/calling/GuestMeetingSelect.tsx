import { useMemo } from "react";
import { PopupSelect } from "../../../components/ui/PopupSelect";

export type GuestMeetingSelectOption = { value: string; label: string };

/** A compact, platform-styled menu using the shared PopupSelect. */
export function GuestMeetingSelect({
  ariaLabel,
  options,
  value,
  onChange,
  newChatTitle = "",
  onNewChatTitleChange,
  className = "",
  disabled = false,
}: {
  ariaLabel: string;
  options: GuestMeetingSelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  newChatTitle?: string;
  onNewChatTitleChange?: (title: string) => void;
}) {
  const trimmedNewChatTitle = newChatTitle.trim();
  const newChatOption = trimmedNewChatTitle ? { value: "new", label: `New chat: ${trimmedNewChatTitle}` } : null;
  const visibleOptions = useMemo(
    () => (newChatOption ? [...options, newChatOption] : options),
    [options, newChatOption?.label],
  );

  return (
    <span className={`guest-link-select${className ? ` ${className}` : ""}`}>
      <PopupSelect
        ariaLabel={ariaLabel}
        triggerClassName="guest-link-select-trigger"
        options={visibleOptions}
        value={value}
        onChange={onChange}
        disabled={disabled}
        menuFooter={
          onNewChatTitleChange ? (
            <span className="guest-link-select-create">
              <span className="guest-link-select-create-label">Or in a new chat</span>
              <input
                aria-label="New meeting chat name"
                maxLength={255}
                placeholder="e.g. Design review"
                value={newChatTitle}
                onChange={(event) => {
                  onNewChatTitleChange(event.target.value);
                  onChange(event.target.value.trim() ? "new" : options[0]?.value ?? "");
                }}
              />
            </span>
          ) : null
        }
      />
    </span>
  );
}
