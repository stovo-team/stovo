import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ExtensionSlot, extensionRegistry } from "./ExtensionSlot";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("ExtensionSlot", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    extensionRegistry.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
  });

  it("renders nothing when no plugin component is registered for slot", () => {
    act(() => {
      root?.render(<ExtensionSlot name="chat.header" />);
    });
    expect(container?.childElementCount).toBe(0);
  });

  it("renders registered plugin components inside extension slot", () => {
    const SampleWidget = () => <div data-testid="sample-plugin">Plugin Widget</div>;
    extensionRegistry.register("chat.header", SampleWidget);

    act(() => {
      root?.render(<ExtensionSlot name="chat.header" />);
    });

    const slotNode = container?.querySelector('[data-slot-name="chat.header"]');
    expect(slotNode).not.toBeNull();
    expect(slotNode?.textContent).toBe("Plugin Widget");
  });

  it("allows unregistering plugin components", () => {
    const SampleWidget = () => <div data-testid="sample-plugin">Plugin Widget</div>;
    const unregister = extensionRegistry.register("chat.header", SampleWidget);

    unregister();

    act(() => {
      root?.render(<ExtensionSlot name="chat.header" />);
    });

    expect(container?.childElementCount).toBe(0);
  });
});
