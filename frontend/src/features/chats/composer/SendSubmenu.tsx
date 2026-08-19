import { useEffect, useRef } from "react";
import { CalendarClock, BellRing } from "lucide-react";

export interface SendSubmenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSchedule: () => void;
  onSelectReminder: () => void;
}

export function SendSubmenu({
  isOpen,
  onClose,
  onSelectSchedule,
  onSelectReminder
}: SendSubmenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("touchstart", handleClickOutside, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("touchstart", handleClickOutside, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="send-submenu-popup action-menu"
      role="menu"
      aria-label="Message send options"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        className="action-menu-item send-submenu-item"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
          onSelectSchedule();
        }}
      >
        <CalendarClock size={16} aria-hidden="true" />
        <span>Schedule message</span>
      </button>

      <button
        type="button"
        role="menuitem"
        className="action-menu-item send-submenu-item"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
          onSelectReminder();
        }}
      >
        <BellRing size={16} aria-hidden="true" />
        <span>Set reminder</span>
      </button>
    </div>
  );
}
