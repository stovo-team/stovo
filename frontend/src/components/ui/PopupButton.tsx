import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./Popup.css";

export type PopupButtonVariant = "primary" | "secondary" | "danger";

export interface PopupButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: PopupButtonVariant;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  loading?: boolean;
}

export function PopupButton({
  variant,
  startIcon,
  endIcon,
  loading = false,
  disabled = false,
  className = "",
  type = "button",
  children,
  ...props
}: PopupButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`popup-button popup-button--${variant}${className ? ` ${className}` : ""}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {startIcon ? <span className="popup-button__icon" aria-hidden="true">{startIcon}</span> : null}
      {children}
      {endIcon ? <span className="popup-button__icon" aria-hidden="true">{endIcon}</span> : null}
    </button>
  );
}

export default PopupButton;
