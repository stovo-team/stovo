import { useEffect, useRef, useState, type ReactNode } from "react";

export const CALL_CONTROLS_REVEAL_EVENT = "stovo:reveal-call-controls";

export function SharedCallControlPanel({ autoHide, children, onReveal }: { autoHide: boolean; children: ReactNode; onReveal?: () => void }) {
  const [pointerInside, setPointerInside] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const reveal = () => {
      setPointerInside(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setPointerInside(false), 2200);
    };
    window.addEventListener(CALL_CONTROLS_REVEAL_EVENT, reveal);
    return () => {
      window.removeEventListener(CALL_CONTROLS_REVEAL_EVENT, reveal);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);
  const revealFromPanel = () => {
    setPointerInside(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    onReveal?.();
  };
  return (
    <div
      className="shared-call-control-panel"
      data-auto-hide={autoHide ? "true" : "false"}
      data-visible={!autoHide || pointerInside ? "true" : "false"}
      onPointerEnter={revealFromPanel}
      onPointerLeave={() => setPointerInside(false)}
      onFocusCapture={revealFromPanel}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPointerInside(false); }}
      onTouchStart={revealFromPanel}
    >
      {children}
    </div>
  );
}
