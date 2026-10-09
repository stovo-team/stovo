import "./floatingCallPanel.css";
import { useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes } from "react";

type Position = { x: number; y: number };
type SavedPosition = { chatId: string; offsetX: number; offsetY: number } | { chatId: null; x: number; y: number };
const HEADER_GAP = 12;
let savedPosition: SavedPosition | null = null;
export function resetFloatingCallPosition() { savedPosition = null; }

function findVisibleHeader(chatId?: string): HTMLElement | null {
  if (!chatId) return null;
  const matching = Array.from(document.querySelectorAll<HTMLElement>("[data-call-header-chat-id]"))
    .filter((element) => element.dataset.callHeaderChatId === chatId)
    .sort((a, b) => Number(b.dataset.callHeaderKind === "details") - Number(a.dataset.callHeaderKind === "details"));
  return matching.find((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 &&
      rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  }) ?? null;
}

/** Drag only the title, preserving buttons and a normal click to restore. */
export function useFloatingCallPanel<T extends HTMLElement = HTMLDivElement>(enabled: boolean, anchorChatId?: string): HTMLAttributes<T> & { ref: React.RefObject<T | null> } {
  const ref = useRef<T>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; origin: Position; moved: boolean; capture: Element } | null>(null);
  const suppressClick = useRef(false);

  const constrain = (point: Position, snap: boolean, minimumTop = 96): Position => {
    const box = ref.current?.getBoundingClientRect();
    const right = Math.max(12, window.innerWidth - (box?.width ?? 0) - 12);
    const bottom = Math.max(0, window.innerHeight - (box?.height ?? 0) - 12);
    const top = Math.min(minimumTop, bottom);
    const axis = (value: number, min: number, max: number) => {
      const clamped = Math.max(min, Math.min(max, value));
      const anchor = [min, (min + max) / 2, max].find((candidate) => Math.abs(candidate - clamped) <= 24);
      return snap && anchor !== undefined ? anchor : clamped;
    };
    return { x: axis(point.x, 12, right), y: axis(point.y, top, bottom) };
  };

  const anchorPosition = (anchor: HTMLElement): Position => {
    const header = anchor.getBoundingClientRect();
    const panel = ref.current?.getBoundingClientRect();
    return { x: header.right - (panel?.width ?? 0), y: header.bottom + HEADER_GAP };
  };

  const save = (next: Position, snap: boolean) => {
    const anchor = findVisibleHeader(anchorChatId);
    const minimumTop = anchor ? HEADER_GAP : 96;
    const constrained = constrain(next, snap, minimumTop);
    if (anchor && anchorChatId) {
      const base = anchorPosition(anchor);
      savedPosition = { chatId: anchorChatId, offsetX: constrained.x - base.x, offsetY: constrained.y - base.y };
    } else {
      savedPosition = { chatId: null, x: constrained.x, y: constrained.y };
    }
    setPosition(constrained);
  };

  useLayoutEffect(() => {
    if (!enabled) return;

    const update = () => {
      const anchor = findVisibleHeader(anchorChatId);
      const base = anchor ? anchorPosition(anchor) : {
        x: window.innerWidth - (ref.current?.getBoundingClientRect().width ?? 0) - 12,
        y: 96,
      };
      const saved = savedPosition;
      const desired = anchor && anchorChatId && saved?.chatId === anchorChatId
        ? { x: base.x + saved.offsetX, y: base.y + saved.offsetY }
        : !anchor && saved?.chatId === null
          ? { x: saved.x, y: saved.y }
          : base;
      setPosition(constrain(desired, false, anchor ? HEADER_GAP : 96));
    };

    let observedAnchor: HTMLElement | null = null;
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    const syncAnchorObservation = () => {
      const nextAnchor = findVisibleHeader(anchorChatId);
      if (nextAnchor !== observedAnchor) {
        if (observedAnchor) resizeObserver?.unobserve(observedAnchor);
        observedAnchor = nextAnchor;
        if (observedAnchor) resizeObserver?.observe(observedAnchor);
      }
      update();
    };

    update();
    if (ref.current) resizeObserver?.observe(ref.current);
    window.addEventListener("resize", syncAnchorObservation);
    window.addEventListener("scroll", syncAnchorObservation, true);
    const mutationObserver = typeof MutationObserver !== "undefined" ? new MutationObserver(syncAnchorObservation) : null;
    if (document.body) mutationObserver?.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "aria-hidden"],
    });
    syncAnchorObservation();
    return () => {
      window.removeEventListener("resize", syncAnchorObservation);
      window.removeEventListener("scroll", syncAnchorObservation, true);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [enabled, anchorChatId]);

  const finish = (event: React.PointerEvent<HTMLElement>, snap: boolean) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (current.moved) {
      save({ x: current.origin.x + event.clientX - current.x, y: current.origin.y + event.clientY - current.y }, snap);
      suppressClick.current = true;
    }
    drag.current = null;
    current.capture.releasePointerCapture?.(event.pointerId);
  };
  return {
    ref,
    style: enabled && position ? { position: "fixed", left: position.x, top: position.y, right: "auto", bottom: "auto", margin: 0, transform: "none" } as CSSProperties : undefined,
    onPointerDown: (event) => {
      suppressClick.current = false;
      if (!enabled || event.button !== 0 || !(event.target as Element).closest("[data-call-drag-handle]")) return;
      const box = event.currentTarget.getBoundingClientRect();
      drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, origin: { x: box.left, y: box.top }, moved: false, capture: (event.target as Element).closest("[data-call-drag-handle]")! };
      drag.current.capture.setPointerCapture?.(event.pointerId);
    },
    onPointerMove: (event) => {
      const current = drag.current;
      if (!current || current.pointer !== event.pointerId) return;
      current.moved ||= Math.hypot(event.clientX - current.x, event.clientY - current.y) > 4;
      if (current.moved) save({ x: current.origin.x + event.clientX - current.x, y: current.origin.y + event.clientY - current.y }, false);
    },
    onPointerUp: (event) => finish(event, true),
    onPointerCancel: (event) => finish(event, false),
    onClickCapture: (event) => {
      if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); }
    },
  };
}
