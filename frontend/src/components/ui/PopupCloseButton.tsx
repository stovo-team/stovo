import { X } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

export interface PopupCloseButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  ariaLabel: string;
}

export default function PopupCloseButton({ ariaLabel, className = "", type = "button", ...props }: PopupCloseButtonProps) {
  return (
    <button
      {...props}
      type={type}
      aria-label={ariaLabel}
      className={`popup-close${className ? ` ${className}` : ""}`}
    >
      <X aria-hidden="true" size={18} strokeWidth={1.8} />
    </button>
  );
}
