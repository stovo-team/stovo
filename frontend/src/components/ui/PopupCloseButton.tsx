import { X } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";

export interface PopupCloseButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  ariaLabel: string;
}

const PopupCloseButton = forwardRef<HTMLButtonElement, PopupCloseButtonProps>(function PopupCloseButton(
  { ariaLabel, className = "", type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      {...props}
      type={type}
      aria-label={ariaLabel}
      className={`popup-close${className ? ` ${className}` : ""}`}
    >
      <X aria-hidden="true" size={18} strokeWidth={1.8} />
    </button>
  );
});

export default PopupCloseButton;
