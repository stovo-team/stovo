import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MoreVertical, Settings2, Share2 } from "lucide-react";
import IconIntelligence from "../../../components/icons/IconIntelligence";

export function MobileCallMoreMenu({
  isSharing,
  isLandscape = false,
  isIntelligenceActive = false,
  onOpenSettings,
  onToggleScreenShare,
  onToggleIntelligence,
  children,
}: {
  isSharing: boolean;
  isLandscape?: boolean;
  isIntelligenceActive?: boolean;
  onOpenSettings?: () => void;
  onToggleScreenShare: () => void;
  onToggleIntelligence: () => void;
  children?: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuOffset, setMenuOffset] = useState(0);
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const alignWithinViewport = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const menu = menuRef.current;
      if (!anchor || !menu) return;
      if (isLandscape || anchorRef.current?.closest(".mobile-active-screen--landscape")) {
        setMenuOffset(0);
        return;
      }
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const menuWidth = menu.getBoundingClientRect().width || Math.min(336, viewportWidth - 32);
      const minLeft = 16;
      const maxLeft = Math.max(minLeft, viewportWidth - menuWidth - 16);
      const targetLeft = Math.min(maxLeft, Math.max(minLeft, anchor.left));
      setMenuOffset(Math.max(0, anchor.left - targetLeft));
    };
    alignWithinViewport();
    window.addEventListener("resize", alignWithinViewport);
    return () => window.removeEventListener("resize", alignWithinViewport);
  }, [isOpen, isLandscape]);

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
        data-shape="circle"
        data-fixed-size="true"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <MoreVertical size={20} aria-hidden="true" />
      </button>
      <span className="mobile-active-ctrl-lbl">More</span>
      {isOpen && (
        <div ref={menuRef} className="mobile-active-more-menu" style={{ left: `${-menuOffset}px` }} role="group" aria-label="More call options">
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
