import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

interface UseResizableSidebarOptions {
  onCollapse: () => void;
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

export function useResizableSidebar({
  onCollapse,
  initialWidth = 300,
  minWidth = 180,
  maxWidth = 640
}: UseResizableSidebarOptions) {
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => {
    if (!isResizing) return;
    const move = (event: globalThis.PointerEvent) => {
      const start = resizeStart.current;
      if (!start) return;
      const nextWidth = start.width + event.clientX - start.x;
      if (nextWidth < minWidth) {
        resizeStart.current = null;
        setIsResizing(false);
        onCollapse();
        return;
      }
      setWidth(Math.min(maxWidth, nextWidth));
    };
    const stop = () => {
      resizeStart.current = null;
      setIsResizing(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [isResizing, maxWidth, minWidth, onCollapse]);

  const onPointerDown = useCallback((event: PointerEvent, disabled: boolean) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    resizeStart.current = { x: event.clientX, width };
    setIsResizing(true);
  }, [width]);

  const onKeyDown = useCallback((event: KeyboardEvent, disabled: boolean) => {
    if (disabled || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    const nextWidth = width + (event.key === "ArrowLeft" ? -24 : 24);
    if (nextWidth < minWidth) onCollapse();
    else setWidth(Math.min(maxWidth, nextWidth));
  }, [maxWidth, minWidth, onCollapse, width]);

  const resetWidth = useCallback(() => setWidth(initialWidth), [initialWidth]);

  return { width, onPointerDown, onKeyDown, resetWidth };
}
