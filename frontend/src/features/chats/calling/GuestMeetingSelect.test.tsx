import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuestMeetingSelect } from "./GuestMeetingSelect";

describe("GuestMeetingSelect keyboard behavior", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container.remove();
  });

  it("keeps Home and End navigation in the new chat name field", async () => {
    await act(async () => {
      root?.render(<GuestMeetingSelect ariaLabel="Meeting chat" value="one" onChange={() => undefined} options={[{ value: "one", label: "One" }]} onCreateNew={() => true} />);
    });
    const trigger = container.querySelector<HTMLButtonElement>(".guest-link-select-trigger")!;
    await act(async () => { trigger.click(); });
    const input = container.querySelector<HTMLInputElement>('input[aria-label="New meeting chat name"]')!;
    input.focus();
    await act(async () => {
      root?.render(<GuestMeetingSelect ariaLabel="Meeting chat" value="one" onChange={() => undefined} options={[{ value: "one", label: "One" }]} onCreateNew={() => true} creating />);
    });
    expect(document.activeElement).toBe(input);
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(input);
    expect(container.querySelector('[role="listbox"]')).toBeTruthy();
  });

  it("prevents duplicate native button activation for Enter and Space", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root?.render(<GuestMeetingSelect ariaLabel="Meeting chat" value="one" onChange={onChange} options={[{ value: "one", label: "One" }, { value: "two", label: "Two" }]} />);
    });
    const trigger = container.querySelector<HTMLButtonElement>(".guest-link-select-trigger")!;
    await act(async () => { trigger.click(); });
    const option = [...container.querySelectorAll<HTMLButtonElement>('[role="option"]')][1];
    expect(option.tabIndex).toBe(-1);
    option.focus();
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => { option.dispatchEvent(enter); });
    await act(async () => { option.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true })); });
    expect(enter.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("two");

    await act(async () => { trigger.click(); });
    const spaceOption = [...container.querySelectorAll<HTMLButtonElement>('[role="option"]')][0];
    spaceOption.focus();
    const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    await act(async () => { spaceOption.dispatchEvent(space); });
    await act(async () => { spaceOption.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true })); });
    expect(space.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith("one");
  });
});
