import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PopupSelect } from "./PopupSelect";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const options = [
  { value: "one", label: "First option" },
  { value: "disabled", label: "Unavailable", disabled: true },
  { value: "three", label: "Third option" },
];

describe("PopupSelect", () => {
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

  it("opens from the trigger and exposes the selected listbox option", () => {
    act(() => root.render(<PopupSelect ariaLabel="Color" options={options} value="three" onChange={() => undefined} />));
    const trigger = container.querySelector<HTMLButtonElement>(".popup-select__trigger");
    expect(trigger?.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    act(() => trigger?.click());
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    expect(container.querySelector('[role="option"][aria-selected="true"]')?.textContent).toContain("Third option");
  });

  it("moves through enabled options and selects with Enter, then restores trigger focus", () => {
    const onChange = vi.fn();
    act(() => root.render(<PopupSelect ariaLabel="Color" options={options} value="one" onChange={onChange} />));
    const trigger = container.querySelector<HTMLButtonElement>(".popup-select__trigger");
    act(() => trigger?.click());
    const first = container.querySelector<HTMLButtonElement>('[role="option"][data-value="one"]');
    expect(document.activeElement).toBe(first);
    act(() => first?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    const third = container.querySelector<HTMLButtonElement>('[role="option"][data-value="three"]');
    expect(document.activeElement).toBe(third);
    act(() => third?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onChange).toHaveBeenCalledWith("three");
    expect(document.activeElement).toBe(trigger);
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on Escape and returns focus to the trigger", () => {
    act(() => root.render(<PopupSelect ariaLabel="Color" options={options} value="one" onChange={() => undefined} />));
    const trigger = container.querySelector<HTMLButtonElement>(".popup-select__trigger");
    act(() => trigger?.click());
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("does not select disabled options and renders an empty state", () => {
    const onChange = vi.fn();
    act(() => root.render(<PopupSelect ariaLabel="Color" options={options} value="one" onChange={onChange} />));
    const trigger = container.querySelector<HTMLButtonElement>(".popup-select__trigger");
    act(() => trigger?.click());
    const unavailable = container.querySelector<HTMLButtonElement>('[role="option"][data-value="disabled"]');
    expect(unavailable?.disabled).toBe(true);
    act(() => unavailable?.click());
    expect(onChange).not.toHaveBeenCalled();

    act(() => root.render(<PopupSelect key="empty" ariaLabel="Color" options={[]} value="" onChange={onChange} />));
    act(() => container.querySelector<HTMLButtonElement>(".popup-select__trigger")?.click());
    expect(container.querySelector('[role="listbox"]')?.textContent).toContain("No options available");
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(0);
  });

  it("keeps a disabled trigger closed", () => {
    act(() => root.render(<PopupSelect ariaLabel="Color" options={options} value="one" onChange={() => undefined} disabled />));
    const trigger = container.querySelector<HTMLButtonElement>(".popup-select__trigger");
    expect(trigger?.disabled).toBe(true);
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
  });
});
