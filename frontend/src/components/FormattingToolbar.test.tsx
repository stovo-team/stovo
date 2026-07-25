import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FormattingKind } from "../composerFormatting";
import {
  FormattingToolbar,
  getFormattingToolbarPlacement,
  type FormattingToolbarProps
} from "./FormattingToolbar";

const mountedRoots: Root[] = [];

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function renderToolbar(
  props: FormattingToolbarProps,
  parentHandlers: {
    onPointerDown?: () => void;
    onClick?: () => void;
  } = {}
): Root {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(
      <div {...parentHandlers}>
        <FormattingToolbar {...props} />
      </div>
    );
  });
  return root;
}

function visibleProps(
  onFormat: (kind: FormattingKind) => void = () => undefined
): FormattingToolbarProps {
  return {
    selection: { start: 0, end: 1 },
    anchor: { left: 120, top: 80 },
    onFormat
  };
}

function toolbar(): HTMLElement | null {
  return document.body.querySelector('[role="toolbar"]');
}

afterEach(() => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();
    act(() => root?.unmount());
  }
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("FormattingToolbar", () => {
  it("centers the measured toolbar above an ordinary selection anchor", () => {
    expect(getFormattingToolbarPlacement(
      { left: 200, top: 200 },
      { width: 100, height: 40 },
      { width: 800, height: 600 }
    )).toEqual({ left: 150, top: 152 });
  });

  it.each([
    [{ left: 20, top: 200 }, { left: 12, top: 152 }],
    [{ left: 790, top: 200 }, { left: 688, top: 152 }],
    [{ left: 200, top: 20 }, { left: 150, top: 12 }]
  ] as const)("clamps the complete measured rectangle at viewport edges", (anchor, expected) => {
    expect(getFormattingToolbarPlacement(
      anchor,
      { width: 100, height: 40 },
      { width: 800, height: 600 }
    )).toEqual(expected);
  });

  it("uses finite gutter-aligned placement for an oversized toolbar and invalid geometry", () => {
    const oversized = getFormattingToolbarPlacement(
      { left: Number.POSITIVE_INFINITY, top: Number.NaN },
      { width: 900, height: Number.POSITIVE_INFINITY },
      { width: 320, height: 480 }
    );

    expect(oversized).toEqual({ left: 12, top: 12 });
    expect(Number.isFinite(oversized.left)).toBe(true);
    expect(Number.isFinite(oversized.top)).toBe(true);
  });

  it.each([
    { selection: null, anchor: { left: 1, top: 2 } },
    { selection: { start: 0, end: 1 }, anchor: null },
    { selection: { start: 3, end: 3 }, anchor: { left: 1, top: 2 } },
    { selection: { start: 4, end: 2 }, anchor: { left: 1, top: 2 } }
  ])("renders nothing without a non-empty forward selection and anchor", (partial) => {
    renderToolbar({ ...partial, onFormat: vi.fn() });
    expect(toolbar()).toBeNull();
  });

  it("portals one measured fixed-position toolbar for a single selected code unit", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 100,
      height: 40,
      left: 0,
      right: 100,
      top: 0,
      bottom: 40,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    renderToolbar(visibleProps());

    const element = toolbar();
    expect(element).not.toBeNull();
    expect(element?.parentElement).toBe(document.body);
    expect(element?.getAttribute("aria-label")).toBe("Format selected text");
    expect(element?.style.position).toBe("fixed");
    expect(element?.style.left).toBe("70px");
    expect(element?.style.top).toBe("32px");
    expect(element?.style.visibility).toBe("visible");
  });

  it("remeasures on anchor changes and resize, then removes the resize listener", () => {
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 100,
      height: 40,
      left: 0,
      right: 100,
      top: 0,
      bottom: 40,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const root = renderToolbar(visibleProps());

    const initialMeasurements = rect.mock.calls.length;
    expect(initialMeasurements).toBeGreaterThanOrEqual(1);
    act(() => {
      root.render(<FormattingToolbar {...visibleProps()} anchor={{ left: 200, top: 160 }} />);
    });
    const measurementsAfterAnchorChange = rect.mock.calls.length;
    expect(measurementsAfterAnchorChange).toBeGreaterThan(initialMeasurements);
    expect(toolbar()?.style.left).toBe("150px");
    expect(toolbar()?.style.top).toBe("112px");

    act(() => window.dispatchEvent(new Event("resize")));
    expect(rect.mock.calls.length).toBeGreaterThan(measurementsAfterAnchorChange);

    act(() => root.unmount());
    mountedRoots.splice(mountedRoots.indexOf(root), 1);
    expect(add).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
  });

  it("renders exactly five actions in the declared order with fixed names", () => {
    renderToolbar(visibleProps());
    const buttons = [...document.body.querySelectorAll("button")];

    expect(buttons).toHaveLength(5);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Bold",
      "Italic",
      "Underline",
      "Strikethrough",
      "Spoiler"
    ]);
    expect(buttons.map((button) => button.getAttribute("title"))).toEqual([
      "Bold",
      "Italic",
      "Underline",
      "Strikethrough",
      "Spoiler"
    ]);
    expect(buttons.every((button) => button.type === "button")).toBe(true);
  });

  it("uses one decorative SVG and no visible text inside every action", () => {
    renderToolbar(visibleProps());
    const buttons = document.body.querySelectorAll("button");

    expect(buttons).toHaveLength(5);
    for (const button of buttons) {
      expect(button.textContent).toBe("");
      expect(button.children).toHaveLength(1);
      expect(button.firstElementChild?.tagName.toLowerCase()).toBe("svg");
      expect(button.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
      expect(button.firstElementChild?.hasAttribute("role")).toBe(false);
    }
  });

  it("prevents pointer default behavior and isolates pointer-down from its React parent", () => {
    const onPointerDown = vi.fn();
    renderToolbar(visibleProps(), { onPointerDown });
    const pointerDown = new Event("pointerdown", { bubbles: true, cancelable: true });

    act(() => {
      document.body.querySelector("button")?.dispatchEvent(pointerDown);
    });

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(onPointerDown).not.toHaveBeenCalled();
  });

  it("isolates clicks and emits the identical formatting kind exactly once", () => {
    const onClick = vi.fn();
    const onFormat = vi.fn();
    renderToolbar(visibleProps(onFormat), { onClick });
    const kinds: FormattingKind[] = [
      "bold",
      "italic",
      "underline",
      "strikethrough",
      "spoiler"
    ];

    [...document.body.querySelectorAll("button")].forEach((button, index) => {
      act(() => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(onFormat).toHaveBeenNthCalledWith(index + 1, kinds[index]);
    });

    expect(onFormat).toHaveBeenCalledTimes(5);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("removes portal content when the owning React root unmounts", () => {
    const root = renderToolbar(visibleProps());
    expect(toolbar()).not.toBeNull();

    act(() => root.unmount());
    mountedRoots.splice(mountedRoots.indexOf(root), 1);

    expect(toolbar()).toBeNull();
  });

  it("exposes SVG-only keyboard-reachable actions and returns selection focus to the composer", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "selected text";
    document.body.append(textarea);
    textarea.focus();
    textarea.setSelectionRange(0, 8);
    const initialSelection = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd
    };
    const onFormat = vi.fn((kind: FormattingKind) => {
      textarea.focus();
      textarea.setSelectionRange(initialSelection.start, initialSelection.end);
      expect(kind).toBe("bold");
    });

    renderToolbar({
      selection: { start: 0, end: 8 },
      anchor: { left: 12, top: 24 },
      onFormat
    });

    const element = toolbar();
    const buttons = [...document.body.querySelectorAll('[role="toolbar"] button')];
    expect(element?.getAttribute("aria-label")).toBe("Format selected text");
    expect(buttons).toHaveLength(5);
    for (const button of buttons) {
      expect(button.getAttribute("tabindex")).not.toBe("-1");
      expect(button.firstElementChild?.tagName.toLowerCase()).toBe("svg");
      expect(button.textContent).toBe("");
    }

    act(() => {
      buttons[0].focus();
      buttons[0].dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      buttons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onFormat).toHaveBeenCalledWith("bold");
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(initialSelection.start);
    expect(textarea.selectionEnd).toBe(initialSelection.end);
    expect(
      getFormattingToolbarPlacement(
        { left: 790, top: 20 },
        { width: 100, height: 40 },
        { width: 800, height: 600 }
      )
    ).toEqual({ left: 688, top: 12 });
  });
});
