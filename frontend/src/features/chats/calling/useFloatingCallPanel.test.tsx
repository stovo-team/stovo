import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetFloatingCallPosition, useFloatingCallPanel } from "./useFloatingCallPanel";

let root: Root;
afterEach(() => { act(() => root?.unmount()); document.body.innerHTML = ""; resetFloatingCallPosition(); vi.unstubAllGlobals(); });
function mount() {
  const restore = vi.fn();
  function Panel() {
    const floating = useFloatingCallPanel(true);
    return <div {...floating} data-panel><button data-call-drag-handle onClick={restore}>Call</button><button>Mute</button></div>;
  }
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  act(() => root.render(<Panel />));
  const panel = host.querySelector<HTMLElement>('[data-panel]')!;
  panel.getBoundingClientRect = () => ({ left: 400, top: 100, width: 200, height: 60 } as DOMRect);
  panel.setPointerCapture = vi.fn(); panel.releasePointerCapture = vi.fn();
  return { panel, handle: panel.querySelector('button')!, restore };
}
function pointer(target: Element, type: string, x: number, y: number) {
  act(() => target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 })));
}

describe("floating call panel", () => {
  it("allows free placement, suppresses restore after dragging, and keeps controls clickable", () => {
    const { panel, handle, restore } = mount();
    pointer(handle, 'pointerdown', 420, 120); pointer(panel, 'pointermove', 300, 300); pointer(panel, 'pointerup', 300, 300);
    expect(panel.style.left).toBe('280px'); expect(panel.style.top).toBe('280px');
    act(() => handle.click()); expect(restore).not.toHaveBeenCalled();
    pointer(handle, 'pointerdown', 300, 300); pointer(panel, 'pointerup', 300, 300);
    act(() => handle.click()); expect(restore).toHaveBeenCalledOnce();
  });
  it("snaps to corners and clamps when the viewport shrinks", () => {
    const { panel, handle } = mount();
    pointer(handle, 'pointerdown', 420, 120); pointer(panel, 'pointermove', 35, 125); pointer(panel, 'pointerup', 35, 125);
    expect(panel.style.left).toBe('12px'); expect(panel.style.top).toBe('96px');
    vi.stubGlobal('innerWidth', 210); vi.stubGlobal('innerHeight', 150);
    act(() => window.dispatchEvent(new Event('resize')));
    expect(parseFloat(panel.style.left)).toBeLessThanOrEqual(12);
    expect(parseFloat(panel.style.top)).toBeLessThanOrEqual(90);
  });
  it("does not drag from a control button", () => {
    const { panel } = mount(); const mute = panel.querySelectorAll('button')[1];
    pointer(mute, 'pointerdown', 420, 120); pointer(panel, 'pointermove', 20, 20); pointer(panel, 'pointerup', 20, 20);
    expect(panel.style.left).toBe('');
  });
});

it("snaps to side midpoints, retains position across remounts, and resets for a new call", () => {
  vi.stubGlobal('innerWidth', 1000); vi.stubGlobal('innerHeight', 800);
  const { panel, handle } = mount();
  pointer(handle, 'pointerdown', 420, 120); pointer(panel, 'pointermove', 30, 442); pointer(panel, 'pointerup', 30, 442);
  expect(panel.style.left).toBe('12px'); expect(panel.style.top).toBe('412px');
  act(() => root.unmount());
  const second = mount();
  expect(second.panel.style.left).toBe('12px'); expect(second.panel.style.top).toBe('412px');
  act(() => root.unmount()); resetFloatingCallPosition();
  expect(mount().panel.style.left).toBe('');
});

it("keeps the controls visible when a minimized audio panel grows a video preview", () => {
  vi.stubGlobal('innerWidth', 1000); vi.stubGlobal('innerHeight', 800);
  let resized!: () => void;
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resized = callback; } observe() {} disconnect() {} });
  const { panel, handle } = mount();
  pointer(handle, 'pointerdown', 420, 120); pointer(panel, 'pointermove', 300, 748); pointer(panel, 'pointerup', 300, 748);
  expect(panel.style.top).toBe('728px');
  panel.getBoundingClientRect = () => ({ left: 280, top: 728, width: 200, height: 220 } as DOMRect);
  act(() => resized?.());
  expect(panel.style.top).toBe('568px');
});
