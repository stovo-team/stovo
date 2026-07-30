import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VoiceRecordButton } from "./VoiceRecordButton";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.replaceChildren();
});

describe("VoiceRecordButton", () => {
  it("keeps a mouse recording active until the next click", () => {
    const onPressStart = vi.fn();
    const onPressEnd = vi.fn();
    const onPressCancel = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => root.render(
      <VoiceRecordButton
        isRecording={false}
        disabled={false}
        onPressStart={onPressStart}
        onPressEnd={onPressEnd}
        onPressCancel={onPressCancel}
      />
    ));

    const button = container.querySelector("button");
    if (!button) throw new Error("Expected a voice recording button");
    expect(button.getAttribute("title")).toBe("Click to record voice message");

    const pointerDown = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(pointerDown, "pointerType", { value: "mouse" });
    const pointerUp = new Event("pointerup", { bubbles: true, cancelable: true });
    Object.defineProperty(pointerUp, "pointerType", { value: "mouse" });
    act(() => button.dispatchEvent(pointerDown));
    act(() => button.dispatchEvent(pointerUp));

    expect(onPressStart).toHaveBeenCalledTimes(1);
    expect(onPressEnd).not.toHaveBeenCalled();
    expect(onPressCancel).not.toHaveBeenCalled();
  });
});
