import { act } from "react";
import { readFileSync } from "node:fs";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SharedCallControlPanel } from "./SharedCallControlPanel";

const roots: Root[] = [];
afterEach(() => { while (roots.length) act(() => roots.pop()?.unmount()); document.body.innerHTML = ""; vi.useRealTimers(); });

describe("SharedCallControlPanel", () => {
  it("reveals on pointer entry and stays visible for 12 seconds after the last movement", () => {
    vi.useFakeTimers();
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); roots.push(root);
    const onReveal = vi.fn();
    act(() => root.render(<SharedCallControlPanel autoHide onReveal={onReveal}><button>Mute</button></SharedCallControlPanel>));
    const panel = host.querySelector<HTMLElement>(".shared-call-control-panel")!;
    expect(panel.dataset.visible).toBe("false");
    act(() => panel.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
    expect(panel.dataset.visible).toBe("true");
    expect(onReveal).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(11_999));
    expect(panel.dataset.visible).toBe("true");
    act(() => vi.advanceTimersByTime(1));
    expect(panel.dataset.visible).toBe("false");
  });
  it("keeps controls visible when auto-hide is disabled", () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); roots.push(root);
    act(() => root.render(<SharedCallControlPanel autoHide={false}><button>Mute</button></SharedCallControlPanel>));
    expect(host.querySelector(".shared-call-control-panel")?.getAttribute("data-visible")).toBe("true");
  });

  it("reveals hidden controls on keyboard focus and touch", () => {
    vi.useFakeTimers();
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); roots.push(root);
    act(() => root.render(<SharedCallControlPanel autoHide><button>Mute</button></SharedCallControlPanel>));
    const panel = host.querySelector<HTMLElement>(".shared-call-control-panel")!;
    const button = host.querySelector<HTMLButtonElement>("button")!;
    act(() => button.focus());
    expect(panel.dataset.visible).toBe("true");
    act(() => button.blur());
    expect(panel.dataset.visible).toBe("true");
    act(() => vi.advanceTimersByTime(12_000));
    expect(panel.dataset.visible).toBe("false");
    act(() => panel.dispatchEvent(new Event("touchstart", { bubbles: true })));
    expect(panel.dataset.visible).toBe("true");
  });
  it("reveals the panel when the call surface reports pointer movement", () => {
    vi.useFakeTimers();
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); roots.push(root);
    act(() => root.render(<SharedCallControlPanel autoHide><button>Mute</button></SharedCallControlPanel>));
    const panel = host.querySelector<HTMLElement>(".shared-call-control-panel")!;
    act(() => window.dispatchEvent(new Event("stovo:reveal-call-controls")));
    expect(panel.dataset.visible).toBe("true");
    act(() => vi.advanceTimersByTime(8_000));
    act(() => window.dispatchEvent(new Event("stovo:reveal-call-controls")));
    act(() => vi.advanceTimersByTime(11_999));
    expect(panel.dataset.visible).toBe("true");
    act(() => vi.advanceTimersByTime(1));
    expect(panel.dataset.visible).toBe("false");
  });

  it("keeps hidden controls from blocking clicks and disables motion when requested", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    expect(styles).toMatch(/\.shared-call-control-panel\[data-auto-hide="true"\]\[data-visible="false"\]\s*\{[^}]*pointer-events:\s*none/);
    expect(styles).toMatch(/\.shared-call-control-panel\[data-auto-hide="true"\]:focus-within\s*\{[^}]*pointer-events:\s*auto/);
    expect(styles).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.shared-call-control-panel\s*\{\s*transition:\s*none/);
  });

  it("keeps the floating control box padded, rounded, and translucent over the shared stage", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    expect(styles).toMatch(/\.shared-call-control-panel\s*\{[^}]*background:\s*rgba\(24, 25, 28, \.9\);[^}]*border-radius:\s*22px;[^}]*padding:\s*8px 12px/);
    expect(styles).toMatch(/\.call-popup\.call-popup-fullscreen \.shared-call-control-panel > \.call-popup-ctrl-row\s*\{[^}]*background:\s*transparent !important;[^}]*padding:\s*0 !important/);
  });
});
