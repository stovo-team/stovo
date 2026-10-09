import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetFloatingCallPosition, useFloatingCallPanel } from "./useFloatingCallPanel";

let root: Root;
afterEach(() => { act(() => root?.unmount()); document.body.innerHTML = ""; resetFloatingCallPosition(); vi.unstubAllGlobals(); });
function mount(anchorChatId?: string, includeHeader = Boolean(anchorChatId)) {
  const restore = vi.fn();
  if (anchorChatId && includeHeader) {
    const anchor = document.createElement("header");
    anchor.dataset.callHeaderChatId = anchorChatId;
    anchor.getBoundingClientRect = () => ({ left: 100, top: 50, right: 800, bottom: 100, width: 700, height: 50 } as DOMRect);
    document.body.append(anchor);
  }
  function Panel() {
    const floating = useFloatingCallPanel(true, anchorChatId);
    return <div {...floating} data-panel><button data-call-drag-handle onClick={restore}>Call</button><button>Mute</button></div>;
  }
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  act(() => root.render(<Panel />));
  const panel = host.querySelector<HTMLElement>('[data-panel]')!;
  panel.getBoundingClientRect = () => ({ left: anchorChatId ? 600 : 400, top: anchorChatId ? 112 : 100, width: 200, height: 60 } as DOMRect);
  panel.setPointerCapture = vi.fn(); panel.releasePointerCapture = vi.fn();
  act(() => window.dispatchEvent(new Event("resize")));
  return { panel, handle: panel.querySelector('button')!, restore };
}
function pointer(target: Element, type: string, x: number, y: number) {
  act(() => target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 })));
}

describe("floating call panel", () => {
  it("positions the minimized call below and aligned to the active chat header", () => {
    vi.stubGlobal("innerWidth", 1200); vi.stubGlobal("innerHeight", 900);
    const { panel } = mount("chat-1");
    expect(panel.style.left).toBe("600px");
    expect(panel.style.top).toBe("112px");
  });

  it("follows a resized header and retains the dragged offset relative to it", () => {
    vi.stubGlobal("innerWidth", 1400); vi.stubGlobal("innerHeight", 1000);
    const { panel, handle } = mount("chat-1");
    pointer(handle, "pointerdown", 620, 120); pointer(panel, "pointermove", 670, 180); pointer(panel, "pointerup", 670, 180);
    expect(panel.style.left).toBe("650px");
    expect(panel.style.top).toBe("172px");

    const anchor = document.querySelector<HTMLElement>('[data-call-header-chat-id="chat-1"]')!;
    anchor.getBoundingClientRect = () => ({ left: 200, top: 80, right: 900, bottom: 150, width: 700, height: 70 } as DOMRect);
    act(() => window.dispatchEvent(new Event("resize")));
    expect(panel.style.left).toBe("750px");
    expect(panel.style.top).toBe("222px");
  });

  it("prefers the visible Chat Details header for the active chat", () => {
    vi.stubGlobal("innerWidth", 1200); vi.stubGlobal("innerHeight", 900);
    const details = document.createElement("header");
    details.dataset.callHeaderChatId = "chat-1";
    details.dataset.callHeaderKind = "details";
    details.getBoundingClientRect = () => ({ left: 300, top: 200, right: 700, bottom: 260, width: 400, height: 60 } as DOMRect);
    document.body.append(details);
    const { panel } = mount("chat-1");
    expect(panel.style.left).toBe("500px");
    expect(panel.style.top).toBe("272px");
  });

  it("reserves the minimized panel height in Chat Details content", () => {
    vi.stubGlobal("innerWidth", 1200); vi.stubGlobal("innerHeight", 900);
    const details = document.createElement("aside");
    details.className = "chat-details-panel";
    const header = document.createElement("header");
    header.dataset.callHeaderChatId = "chat-1";
    header.dataset.callHeaderKind = "details";
    header.getBoundingClientRect = () => ({ left: 300, top: 20, right: 700, bottom: 70, width: 400, height: 50 } as DOMRect);
    const body = document.createElement("div");
    body.className = "chat-info-body";
    details.append(header, body);
    document.body.append(details);

    mount("chat-1", false);

    expect(body.classList.contains("has-minimized-call")).toBe(true);
    expect(body.style.getPropertyValue("--minimized-call-slot-height")).toBe("72px");
  });

  it("reattaches when the active header is replaced by Chat Details", async () => {
    vi.stubGlobal("innerWidth", 1200); vi.stubGlobal("innerHeight", 900);
    const { panel } = mount("chat-1");
    const header = document.querySelector<HTMLElement>('[data-call-header-chat-id="chat-1"]')!;
    const details = document.createElement("header");
    details.dataset.callHeaderChatId = "chat-1";
    details.dataset.callHeaderKind = "details";
    details.getBoundingClientRect = () => ({ left: 300, top: 200, right: 700, bottom: 260, width: 400, height: 60 } as DOMRect);
    await act(async () => { header.replaceWith(details); await Promise.resolve(); });
    expect(panel.style.left).toBe("500px");
    expect(panel.style.top).toBe("272px");
  });

  it("tracks an in-place chat id change on the reused header element", async () => {
    vi.stubGlobal("innerWidth", 1200); vi.stubGlobal("innerHeight", 900);
    const { panel } = mount("chat-1");
    const header = document.querySelector<HTMLElement>('[data-call-header-chat-id="chat-1"]')!;
    await act(async () => { header.dataset.callHeaderChatId = "other-chat"; await Promise.resolve(); });
    expect(panel.style.left).toBe("988px");
    expect(panel.style.top).toBe("12px");

    await act(async () => { header.dataset.callHeaderChatId = "chat-1"; await Promise.resolve(); });
    expect(panel.style.left).toBe("600px");
    expect(panel.style.top).toBe("112px");
  });

  it("falls back to a safe viewport position when the active header is unavailable", () => {
    vi.stubGlobal("innerWidth", 1000); vi.stubGlobal("innerHeight", 800);
    const { panel } = mount("missing-chat", false);
    expect(panel.style.left).toBe("788px");
    expect(panel.style.top).toBe("12px");
  });

  it("can be dragged to the same top inset on pages without a chat header", () => {
    vi.stubGlobal("innerWidth", 1000); vi.stubGlobal("innerHeight", 800);
    const { panel, handle } = mount("missing-chat", false);
    pointer(handle, "pointerdown", 420, 120);
    pointer(panel, "pointermove", 420, 3);
    pointer(panel, "pointerup", 420, 3);
    expect(panel.style.top).toBe("12px");
  });

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
    pointer(handle, 'pointerdown', 420, 120); pointer(panel, 'pointermove', 35, 32); pointer(panel, 'pointerup', 35, 32);
    expect(panel.style.left).toBe('12px'); expect(panel.style.top).toBe('12px');
    vi.stubGlobal('innerWidth', 210); vi.stubGlobal('innerHeight', 150);
    act(() => window.dispatchEvent(new Event('resize')));
    expect(parseFloat(panel.style.left)).toBeLessThanOrEqual(12);
    expect(parseFloat(panel.style.top)).toBeLessThanOrEqual(90);
  });
  it("does not drag from a control button", () => {
    const { panel } = mount(); const initialLeft = panel.style.left; const mute = panel.querySelectorAll('button')[1];
    pointer(mute, 'pointerdown', 420, 120); pointer(panel, 'pointermove', 20, 20); pointer(panel, 'pointerup', 20, 20);
    expect(panel.style.left).toBe(initialLeft);
  });
});

it("snaps to side midpoints, retains position across remounts, and resets for a new call", () => {
  vi.stubGlobal('innerWidth', 1000); vi.stubGlobal('innerHeight', 800);
  const { panel, handle } = mount();
  pointer(handle, 'pointerdown', 420, 120); pointer(panel, 'pointermove', 30, 390); pointer(panel, 'pointerup', 30, 390);
  expect(panel.style.left).toBe('12px'); expect(panel.style.top).toBe('370px');
  act(() => root.unmount());
  const second = mount();
  expect(second.panel.style.left).toBe('12px'); expect(second.panel.style.top).toBe('370px');
  act(() => root.unmount()); resetFloatingCallPosition();
  expect(mount().panel.style.left).not.toBe('12px');
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
