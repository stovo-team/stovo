import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PresetNumberControl } from "./PresetNumberControl";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("PresetNumberControl", () => {
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
  });

  it("selects a preset matching the current value and preserves numeric constraints", () => {
    act(() => root.render(
      <PresetNumberControl
        ariaLabel="Max history messages"
        customLabel="Custom"
        presets={[10, 25, 50, 100, 200, 500]}
        min={1}
        max={500}
        step={1}
        value={50}
        onValueChange={vi.fn()}
      />,
    ));

    const input = container.querySelector<HTMLInputElement>("input");
    const select = container.querySelector<HTMLSelectElement>("select");
    expect(input?.type).toBe("number");
    expect(input?.min).toBe("1");
    expect(input?.max).toBe("500");
    expect(input?.step).toBe("1");
    expect(input?.value).toBe("50");
    expect(select?.value).toBe("50");
  });

  it("switches to Custom while retaining typed values outside the presets", () => {
    const onValueChange = vi.fn();
    act(() => root.render(
      <PresetNumberControl
        ariaLabel="Max history messages"
        customLabel="Custom"
        presets={[10, 25, 50, 100, 200, 500]}
        min={1}
        max={500}
        value={50}
        onValueChange={onValueChange}
      />,
    ));

    const input = container.querySelector<HTMLInputElement>("input")!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "53");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onValueChange).toHaveBeenCalledWith("53");
    expect(container.querySelector("select")?.value).toBe("custom");
  });

  it("updates the value when a preset is selected", () => {
    const onValueChange = vi.fn();
    act(() => root.render(
      <PresetNumberControl
        ariaLabel="Max history messages"
        customLabel="Custom"
        presets={[10, 25, 50, 100, 200, 500]}
        value={50}
        onValueChange={onValueChange}
      />,
    ));

    const select = container.querySelector<HTMLSelectElement>("select")!;
    act(() => {
      select.value = "100";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onValueChange).toHaveBeenCalledWith("100");
  });
});
