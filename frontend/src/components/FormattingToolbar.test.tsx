import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FormattingKind } from "../composerFormatting";
import {
  FormattingToolbar,
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
});

describe("FormattingToolbar", () => {
  it.each([
    { selection: null, anchor: { left: 1, top: 2 } },
    { selection: { start: 0, end: 1 }, anchor: null },
    { selection: { start: 3, end: 3 }, anchor: { left: 1, top: 2 } },
    { selection: { start: 4, end: 2 }, anchor: { left: 1, top: 2 } }
  ])("renders nothing without a non-empty forward selection and anchor", (partial) => {
    renderToolbar({ ...partial, onFormat: vi.fn() });
    expect(toolbar()).toBeNull();
  });

  it("portals one fixed-position toolbar for a single selected code unit", () => {
    renderToolbar(visibleProps());

    const element = toolbar();
    expect(element).not.toBeNull();
    expect(element?.parentElement).toBe(document.body);
    expect(element?.getAttribute("aria-label")).toBe("Format selected text");
    expect(element?.style.position).toBe("fixed");
    expect(element?.style.left).toBe("120px");
    expect(element?.style.top).toBe("80px");
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
});
