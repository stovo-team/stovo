import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export const CALL_CONTROLS_REVEAL_EVENT = "stovo:reveal-call-controls";
export const CALL_CONTROLS_AUTO_HIDE_MS = 12_000;

export function SharedCallControlPanel({ autoHide, children, onReveal }: { autoHide: boolean; children: ReactNode; onReveal?: () => void }) {
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reveal = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), CALL_CONTROLS_AUTO_HIDE_MS);
    onReveal?.();
  }, [onReveal]);
  useEffect(() => {
    window.addEventListener(CALL_CONTROLS_REVEAL_EVENT, reveal);
    return () => {
      window.removeEventListener(CALL_CONTROLS_REVEAL_EVENT, reveal);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [reveal]);
  return (
    <div
      className="shared-call-control-panel"
      data-auto-hide={autoHide ? "true" : "false"}
      data-visible={!autoHide || visible ? "true" : "false"}
      onPointerEnter={reveal}
      onPointerMove={reveal}
      onFocusCapture={reveal}
      onTouchStart={reveal}
    >
      {children}
    </div>
  );
}
