import { useState, type InputHTMLAttributes } from "react";

export interface NumberPreset {
  value: number;
  label?: string;
}

export interface PresetNumberControlProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  ariaLabel: string;
  customLabel: string;
  presets: readonly (number | NumberPreset)[];
  value: number | string;
  onValueChange: (value: string) => void;
  onControlBlur?: () => void;
  inputClassName?: string;
  selectClassName?: string;
}

function normalizePreset(preset: number | NumberPreset): NumberPreset {
  return typeof preset === "number" ? { value: preset } : preset;
}

export function PresetNumberControl({
  ariaLabel,
  customLabel,
  presets,
  value,
  onValueChange,
  onControlBlur,
  inputClassName = "",
  selectClassName = "",
  className = "",
  disabled,
  ...inputProps
}: PresetNumberControlProps) {
  const [customSelected, setCustomSelected] = useState(false);
  const options = presets.map(normalizePreset);
  const valueString = String(value);
  const matchingPreset = options.find((preset) => String(preset.value) === valueString);
  const selectedPreset = customSelected || !matchingPreset ? "custom" : valueString;

  return (
    <div
      className={`preset-number-control${className ? ` ${className}` : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onControlBlur?.();
      }}
    >
      <select
        aria-label={ariaLabel}
        className={`preset-number-control__preset${selectClassName ? ` ${selectClassName}` : ""}`}
        value={selectedPreset}
        disabled={disabled}
        onChange={(event) => {
          if (event.target.value === "custom") {
            setCustomSelected(true);
            return;
          }
          setCustomSelected(false);
          onValueChange(event.target.value);
        }}
      >
        {options.map((preset) => (
          <option key={preset.value} value={String(preset.value)}>{preset.label ?? preset.value}</option>
        ))}
        <option value="custom">{customLabel}</option>
      </select>
      <input
        {...inputProps}
        aria-label={ariaLabel}
        className={`preset-number-control__value${inputClassName ? ` ${inputClassName}` : ""}`}
        type="number"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const nextValue = event.target.value;
          const isPreset = options.some((preset) => String(preset.value) === nextValue);
          setCustomSelected(nextValue === "" || !isPreset);
          onValueChange(nextValue);
        }}
      />
    </div>
  );
}
