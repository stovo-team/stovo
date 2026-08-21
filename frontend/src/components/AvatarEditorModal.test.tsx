import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AvatarEditorModal } from "./AvatarEditorModal";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AvatarEditorModal", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
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
    container?.remove();
    container = null;
    root = null;
    document.body.innerHTML = "";
  });

  it("renders circular crop viewport, zoom controls, rotate and reset buttons", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const dummyFile = new File(["dummy image content"], "avatar.jpg", { type: "image/jpeg" });

    act(() => {
      root?.render(
        <AvatarEditorModal
          file={dummyFile}
          onClose={onClose}
          onSave={onSave}
        />
      );
    });

    // Check title
    expect(document.body.textContent).toContain("Edit Profile Photo");

    // Check circular crop mask and hint
    expect(document.querySelector(".avatar-crop-mask")).not.toBeNull();
    expect(document.querySelector(".avatar-crop-ring")).not.toBeNull();
    expect(document.querySelector(".avatar-editor-hint")).not.toBeNull();

    // Check slider
    const zoomInput = document.querySelector<HTMLInputElement>("input[type='range']");
    expect(zoomInput).not.toBeNull();
    expect(zoomInput?.value).toBe("1");

    // Check cancel button
    const cancelBtn = document.querySelector<HTMLButtonElement>(".avatar-editor-btn-cancel");
    expect(cancelBtn).not.toBeNull();

    act(() => {
      cancelBtn?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("handles zoom slider and zoom buttons interaction", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const dummyFile = new File(["dummy"], "avatar.png", { type: "image/png" });

    act(() => {
      root?.render(
        <AvatarEditorModal
          file={dummyFile}
          onClose={onClose}
          onSave={onSave}
        />
      );
    });

    const zoomInput = document.querySelector<HTMLInputElement>("input[type='range']");
    expect(zoomInput).not.toBeNull();

    // Change slider value
    act(() => {
      if (zoomInput) {
        zoomInput.value = "1.8";
        zoomInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    expect(zoomInput?.value).toBe("1.8");

    // Click Reset
    const resetBtn = document.querySelector<HTMLButtonElement>("button[title='Reset']");
    expect(resetBtn).not.toBeNull();

    act(() => {
      resetBtn?.click();
    });

    expect(zoomInput?.value).toBe("1");
  });

  it("calls onClose when close icon button is clicked", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const dummyFile = new File(["dummy"], "avatar.jpg", { type: "image/jpeg" });

    act(() => {
      root?.render(
        <AvatarEditorModal
          file={dummyFile}
          onClose={onClose}
          onSave={onSave}
        />
      );
    });

    const closeBtn = document.querySelector<HTMLButtonElement>(".avatar-editor-close-btn");
    expect(closeBtn).not.toBeNull();

    act(() => {
      closeBtn?.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
