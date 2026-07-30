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
  it("records only while the pointer is held and sends when released", () => {
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
    expect(button.getAttribute("title")).toBe("Hold to record voice message");

    act(() => button.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true })));
    act(() => button.dispatchEvent(new Event("pointerup", { bubbles: true, cancelable: true })));

    expect(onPressStart).toHaveBeenCalledTimes(1);
    expect(onPressEnd).toHaveBeenCalledTimes(1);
    expect(onPressCancel).not.toHaveBeenCalled();
  });
});
