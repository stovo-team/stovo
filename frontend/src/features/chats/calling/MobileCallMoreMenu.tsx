import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreVertical, Settings2, Share2 } from "lucide-react";
import IconIntelligence from "../../../components/icons/IconIntelligence";

export function MobileCallMoreMenu({
  isSharing,
  isIntelligenceActive = false,
  onOpenSettings,
  onToggleScreenShare,
  onToggleIntelligence,
  children,
}: {
  isSharing: boolean;
  isIntelligenceActive?: boolean;
  onOpenSettings?: () => void;
  onToggleScreenShare: () => void;
  onToggleIntelligence: () => void;
  children?: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [isOpen]);

  return (
    <div className="mobile-active-ctrl mobile-active-more-anchor" ref={anchorRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`mobile-active-ctrl-btn${isOpen || isIntelligenceActive ? " active" : ""}`}
        aria-label="More options"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <MoreVertical size={20} aria-hidden="true" />
      </button>
      <span className="mobile-active-ctrl-lbl">More</span>
      {isOpen && (
        <div className="mobile-active-more-menu" role="group" aria-label="More call options">
          <button type="button" aria-label="Settings" onClick={() => { setIsOpen(false); onOpenSettings?.(); }}>
            <Settings2 size={17} aria-hidden="true" /><span>Settings</span>
          </button>
          <button type="button" aria-label="Share screen" onClick={() => { setIsOpen(false); onToggleScreenShare(); }}>
            <Share2 size={17} aria-hidden="true" /><span>{isSharing ? "Stop screen share" : "Share screen"}</span>
          </button>
          <button type="button" aria-label="Stovo Intelligence" onClick={() => { setIsOpen(false); onToggleIntelligence(); }}>
            <IconIntelligence size={17} /><span>Stovo Intelligence</span>
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
