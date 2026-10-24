import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PopupButton } from "./PopupButton";
import { PopupField } from "./PopupField";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("shared popup controls", () => {
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

  it("associates the field label and exposes helper and error text", () => {
    act(() => root.render(
      <PopupField label="Email address" helperText="Work address" error="Address is required" />,
    ));

    const input = container.querySelector<HTMLInputElement>("input");
    const label = container.querySelector<HTMLLabelElement>("label");
    expect(input).not.toBeNull();
    expect(label?.htmlFor).toBe(input?.id);
    expect(input?.getAttribute("aria-describedby")).toContain("helper");
    expect(input?.getAttribute("aria-describedby")).toContain("error");
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(container.textContent).toContain("Work address");
    expect(container.textContent).toContain("Address is required");
  });

  it("keeps an accessible label available without adding a visible label row", () => {
    act(() => root.render(<PopupField label="Search chats" labelHidden aria-label="Search chats" />));

    const input = container.querySelector<HTMLInputElement>("input");
    const label = container.querySelector<HTMLLabelElement>("label");
    expect(label?.htmlFor).toBe(input?.id);
    expect(label?.classList.contains("visually-hidden")).toBe(true);
  });

  it("renders the semantic button variants and preserves disabled state", () => {
    act(() => root.render(
      <>
        <PopupButton variant="primary">Save</PopupButton>
        <PopupButton variant="secondary">Cancel</PopupButton>
        <PopupButton variant="danger" disabled>Delete</PopupButton>
      </>,
    ));

    const [primary, secondary, danger] = [...container.querySelectorAll<HTMLButtonElement>("button")];
    expect(primary.classList.contains("popup-button--primary")).toBe(true);
    expect(secondary.classList.contains("popup-button--secondary")).toBe(true);
    expect(danger.classList.contains("popup-button--danger")).toBe(true);
    expect(danger.disabled).toBe(true);
  });
});
