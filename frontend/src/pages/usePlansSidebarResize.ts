import { KeyboardEvent, PointerEvent as ReactPointerEvent, useRef, useState } from "react";

export const PLANS_SIDEBAR_MIN_WIDTH = 220;
export const PLANS_SIDEBAR_MAX_WIDTH = 560;
const KEYBOARD_STEP = 16;

export function usePlansSidebarResize() {
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isEventListCollapsed, setIsEventListCollapsed] = useState(false);
  const resizeStart = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  const handleSidebarResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeStart.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: sidebarWidth };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const handleSidebarResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = resizeStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const nextWidth = start.startWidth + event.clientX - start.startX;
    if (nextWidth < PLANS_SIDEBAR_MIN_WIDTH) {
      setSidebarWidth(start.startWidth);
      setIsEventListCollapsed(true);
      return;
    }
    setSidebarWidth(Math.min(PLANS_SIDEBAR_MAX_WIDTH, nextWidth));
  };
  const handleSidebarResizeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizeStart.current?.pointerId === event.pointerId) resizeStart.current = null;
  };
  const handleSidebarResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const step = event.shiftKey ? KEYBOARD_STEP * 3 : KEYBOARD_STEP;
      setSidebarWidth((width) => Math.max(PLANS_SIDEBAR_MIN_WIDTH, Math.min(PLANS_SIDEBAR_MAX_WIDTH, width + direction * step)));
    } else if (event.key === "Home") {
      event.preventDefault();
      setSidebarWidth(PLANS_SIDEBAR_MIN_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      setSidebarWidth(PLANS_SIDEBAR_MAX_WIDTH);
    }
  };

  return {
    handleSidebarResizeEnd,
    handleSidebarResizeKeyDown,
    handleSidebarResizeMove,
    handleSidebarResizeStart,
    isEventListCollapsed,
    setIsEventListCollapsed,
    sidebarWidth,
  };
}
