import { forwardRef, useId, type InputHTMLAttributes } from "react";
import "./Popup.css";

export interface PopupFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  labelHidden?: boolean;
  helperText?: string;
  error?: string;
}

export const PopupField = forwardRef<HTMLInputElement, PopupFieldProps>(function PopupField(
  { label, labelHidden = false, helperText, error, id, className = "", "aria-describedby": describedBy, ...inputProps },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helperId = helperText ? `${inputId}-helper` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const descriptionIds = [describedBy, helperId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="popup-field">
      <label className={`popup-field__label${labelHidden ? " visually-hidden" : ""}`} htmlFor={inputId}>{label}</label>
      <input
        {...inputProps}
        ref={ref}
        id={inputId}
        className={`popup-field__input${error ? " popup-field__input--error" : ""}${className ? ` ${className}` : ""}`}
        aria-describedby={descriptionIds}
        aria-invalid={error ? true : inputProps["aria-invalid"]}
      />
      {helperText ? <span className="popup-field__helper" id={helperId}>{helperText}</span> : null}
      {error ? <span className="popup-field__error" id={errorId}>{error}</span> : null}
    </div>
  );
});

export default PopupField;
