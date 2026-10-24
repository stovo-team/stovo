import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { SendMessageIcon } from "./SendMessageIcon";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SendMessageIcon", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("renders a graphical icon without relying on a ligature font", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(<SendMessageIcon />));

    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("svg")?.classList.contains("composer-send-icon")).toBe(true);
    expect(container.textContent?.trim()).toBe("");
    expect(container.querySelector("svg.lucide-arrow-up")).not.toBeNull();
  });
});
