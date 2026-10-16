import { useMemo } from "react";
import { PopupSelect } from "../../../components/ui/PopupSelect";
import { useStrings } from "../../../i18n/LanguageContext";
import { getAppStrings, getSystemLanguage } from "../../../config/strings";

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
  const appStrings = useStrings();
  const copy = appStrings.sharedUi ?? getAppStrings(getSystemLanguage()).sharedUi;
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
        triggerAriaLabel={copy.selectedOptionLabel(ariaLabel, visibleOptions.find((option) => option.value === value)?.label ?? copy.noSelection)}
        triggerClassName="guest-link-select-trigger"
        options={visibleOptions}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={copy.noSelection}
        menuFooter={
          onNewChatTitleChange ? (
            <span className="guest-link-select-create">
              <span className="guest-link-select-create-label">{copy.orInNewChat}</span>
              <input
                aria-label={copy.newMeetingChatName}
                maxLength={255}
                placeholder={copy.designReviewPlaceholder}
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
