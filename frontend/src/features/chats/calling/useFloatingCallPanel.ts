import "./floatingCallPanel.css";
import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes } from "react";

type Position = { x: number; y: number };
let savedPosition: Position | null = null;
export function resetFloatingCallPosition() { savedPosition = null; }

/** Drag only the title, preserving buttons and a normal click to restore. */
export function useFloatingCallPanel<T extends HTMLElement = HTMLDivElement>(enabled: boolean): HTMLAttributes<T> & { ref: React.RefObject<T | null> } {
  const ref = useRef<T>(null);
  const [position, setPosition] = useState<Position | null>(savedPosition);
  const drag = useRef<{ pointer: number; x: number; y: number; origin: Position; moved: boolean; capture: Element } | null>(null);
  const suppressClick = useRef(false);
  const constrain = (point: Position, snap: boolean): Position => {
    const box = ref.current?.getBoundingClientRect();
    const right = Math.max(12, window.innerWidth - (box?.width ?? 0) - 12);
    const bottom = Math.max(0, window.innerHeight - (box?.height ?? 0) - 12);
    const top = Math.min(96, bottom);
    const axis = (value: number, min: number, max: number) => {
      const clamped = Math.max(min, Math.min(max, value));
      const anchor = [min, (min + max) / 2, max].find((candidate) => Math.abs(candidate - clamped) <= 24);
      return snap && anchor !== undefined ? anchor : clamped;
    };
    return { x: axis(point.x, 12, right), y: axis(point.y, top, bottom) };
  };
  const save = (next: Position) => { savedPosition = next; setPosition(next); };
  useEffect(() => {
    if (!enabled) return;
    setPosition(savedPosition ? constrain(savedPosition, false) : null);
    const resize = () => { if (savedPosition) save(constrain(savedPosition, false)); };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [enabled]);
  const finish = (event: React.PointerEvent<HTMLElement>, snap: boolean) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (current.moved) {
      save(constrain({ x: current.origin.x + event.clientX - current.x, y: current.origin.y + event.clientY - current.y }, snap));
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
      if (current.moved) save(constrain({ x: current.origin.x + event.clientX - current.x, y: current.origin.y + event.clientY - current.y }, false));
    },
    onPointerUp: (event) => finish(event, true),
    onPointerCancel: (event) => finish(event, false),
    onClickCapture: (event) => {
      if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); }
    },
  };
}
