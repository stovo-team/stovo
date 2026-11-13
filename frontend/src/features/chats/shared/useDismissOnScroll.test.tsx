import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDismissOnScroll } from "./useDismissOnScroll";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.replaceChildren();
});

function renderProbe(onDismiss: () => void) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);

  function Probe() {
    const menuRef = useRef<HTMLDivElement>(null);
    useDismissOnScroll(menuRef, onDismiss);
    return (
      <div data-testid="outer-scroll">
        <div ref={menuRef} data-testid="menu">
          <div data-testid="menu-scroll" />
        </div>
        <div data-testid="nested-scroll" />
      </div>
    );
  }

  act(() => root.render(<Probe />));
  return container;
}

describe("useDismissOnScroll", () => {
  it("dismisses when the viewport scrolls", () => {
    const onDismiss = vi.fn();
    renderProbe(onDismiss);

    act(() => window.dispatchEvent(new Event("scroll")));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses for scrolls in nested containers outside the menu", () => {
    const onDismiss = vi.fn();
    const container = renderProbe(onDismiss);
    const nestedScroller = container.querySelector("[data-testid=nested-scroll]")!;

    act(() => nestedScroller.dispatchEvent(new Event("scroll")));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not dismiss when a scroll originates inside the menu", () => {
    const onDismiss = vi.fn();
    const container = renderProbe(onDismiss);
    const menuScroller = container.querySelector("[data-testid=menu-scroll]")!;

    act(() => menuScroller.dispatchEvent(new Event("scroll")));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("removes the capture listener when the menu unmounts", () => {
    const onDismiss = vi.fn();
    const container = renderProbe(onDismiss);
    const root = roots.pop()!;

    act(() => root.unmount());
    act(() => window.dispatchEvent(new Event("scroll")));

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
