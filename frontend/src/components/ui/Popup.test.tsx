import { act } from "react";
import { readFileSync } from "node:fs";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PopupDialog } from "./Popup";
import PopupCloseButton from "./PopupCloseButton";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("PopupDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  it("renders an accessible modal dialog with a shared backdrop and labeled close action", () => {
    act(() => {
      root.render(
        <PopupDialog ariaLabel="Edit profile" onClose={() => undefined}>
          <p>Profile details</p>
        </PopupDialog>,
      );
    });

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-label")).toBe("Edit profile");
    expect(container.querySelector(".popup-backdrop")).not.toBeNull();
    expect(container.querySelector(".popup-close")?.getAttribute("aria-label")).toBe("Close dialog");
  });

  it("supports alertdialog semantics for urgent confirmations", () => {
    act(() => root.render(<PopupDialog ariaLabel="Delete message?" dialogRole="alertdialog">Confirm</PopupDialog>));
    expect(container.querySelector('[role="alertdialog"]')?.getAttribute("aria-modal")).toBe("true");
  });

  it("forwards a ref to the shared close control for dialog focus management", () => {
    const ref = { current: null as HTMLButtonElement | null };
    act(() => root.render(<PopupCloseButton ref={ref} ariaLabel="Close statistics" onClick={() => undefined} />));
    expect(ref.current).toBe(container.querySelector("button.popup-close"));
  });

  it("closes the dialog when the shared close button is activated", () => {
    const onClose = vi.fn();
    act(() => root.render(<PopupDialog ariaLabel="Dialog" onClose={onClose}>Content</PopupDialog>));

    act(() => container.querySelector<HTMLButtonElement>(".popup-close")?.click());

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked if enabled", () => {
    const onClose = vi.fn();
    act(() => root.render(<PopupDialog ariaLabel="Dialog" onClose={onClose} closeOnBackdrop>Content</PopupDialog>));
    const backdrop = container.querySelector<HTMLElement>(".popup-backdrop");
    expect(backdrop).not.toBeNull();
    act(() => backdrop?.click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when the backdrop is clicked if disabled", () => {
    const onClose = vi.fn();
    act(() => root.render(<PopupDialog ariaLabel="Dialog" onClose={onClose} closeOnBackdrop={false}>Content</PopupDialog>));
    act(() => container.querySelector<HTMLElement>(".popup-backdrop")?.click());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose on Escape when enabled and preserves the dialog when disabled", () => {
    const onClose = vi.fn();
    act(() => root.render(<PopupDialog ariaLabel="Dialog" onClose={onClose} closeOnEscape>Content</PopupDialog>));
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    act(() => root.render(<PopupDialog ariaLabel="Dialog" onClose={onClose} closeOnEscape={false}>Content</PopupDialog>));
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("shared popup shell styles", () => {
  it("uses the shared 56% black backdrop without blur and a true 34px circular close control", () => {
    const styles = readFileSync("src/components/ui/Popup.css", "utf8");
    expect(styles).toMatch(/background:\s*rgba\(0,\s*0,\s*0,\s*0\.56\)/);
    expect(styles).toMatch(/\.popup-backdrop[\s\S]*?\{[^}]*backdrop-filter:\s*none/);
    const closeRule = styles.match(/\.popup-close\s*\{([^}]*)\}/s)?.[1] ?? "";
    expect(closeRule).toMatch(/width:\s*34px/);
    expect(closeRule).toMatch(/height:\s*34px/);
    expect(closeRule).toMatch(/min-width:\s*34px/);
    expect(closeRule).toMatch(/min-height:\s*34px/);
    expect(closeRule).toMatch(/flex:\s*0\s+0\s+34px/);
  });
});
