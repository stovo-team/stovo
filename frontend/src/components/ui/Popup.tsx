import { useEffect, type HTMLAttributes, type ReactNode } from "react";
import PopupCloseButton from "./PopupCloseButton";
import "./Popup.css";

export { default as PopupCloseButton } from "./PopupCloseButton";

export type PopupSize = "sm" | "md" | "lg" | "xl" | "full";

export interface PopupBackdropProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export function PopupBackdrop({ children, className = "", ...props }: PopupBackdropProps) {
  return (
    <div className={`popup-backdrop${className ? ` ${className}` : ""}`} {...props}>
      {children}
    </div>
  );
}

export interface PopupDialogProps {
  children: ReactNode;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  onClose?: () => void;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  dialogRole?: "dialog" | "alertdialog";
  closeLabel?: string;
  showCloseButton?: boolean;
  size?: PopupSize;
  className?: string;
  backdropClassName?: string;
}

export function PopupDialog({
  children,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  onClose,
  closeOnBackdrop = false,
  closeOnEscape = false,
  dialogRole = "dialog",
  closeLabel = "Close dialog",
  showCloseButton = true,
  size = "md",
  className = "",
  backdropClassName = "",
}: PopupDialogProps) {
  useEffect(() => {
    if (!closeOnEscape || !onClose) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeOnEscape, onClose]);

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && onClose && event.target === event.currentTarget) onClose();
  };

  return (
    <PopupBackdrop className={backdropClassName} onClick={handleBackdropClick}>
      <section
        className={`popup-dialog popup-dialog--${size}${className ? ` ${className}` : ""}`}
        role={dialogRole}
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        onClick={(event) => event.stopPropagation()}
      >
        {showCloseButton && onClose ? <PopupCloseButton ariaLabel={closeLabel} onClick={onClose} /> : null}
        {children}
      </section>
    </PopupBackdrop>
  );
}
