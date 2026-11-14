import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AttachmentControls } from "./AttachmentControls";
import { ComposerAttachmentProvider } from "./ComposerAttachmentContext";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

describe("AttachmentControls", () => {
  it("opens the picker without submitting the surrounding message form", () => {
    const onSubmit = vi.fn();
    const onAttachButtonClick = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
          <ComposerAttachmentProvider value={{
            disabled: false,
            isAttachmentSheetOpen: false,
            attachmentInputRef: { current: null },
            galleryAttachmentInputRef: { current: null },
            cameraAttachmentInputRef: { current: null },
            audioAttachmentInputRef: { current: null },
            documentAttachmentInputRef: { current: null },
            onAttachButtonClick,
            onFileSelect: vi.fn(),
            onCloseSheet: vi.fn(),
            onPickOption: vi.fn()
          }}>
            <AttachmentControls />
          </ComposerAttachmentProvider>
        </form>
      );
    });

    const button = container.querySelector<HTMLButtonElement>("button.file-picker");
    expect(button?.type).toBe("button");
    act(() => button?.click());

    expect(onAttachButtonClick).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("allows multiple files from non-camera choosers and restricts capture to images", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <ComposerAttachmentProvider value={{
          disabled: false,
          isAttachmentSheetOpen: false,
          attachmentInputRef: { current: null },
          galleryAttachmentInputRef: { current: null },
          cameraAttachmentInputRef: { current: null },
          audioAttachmentInputRef: { current: null },
          documentAttachmentInputRef: { current: null },
          onAttachButtonClick: vi.fn(),
          onFileSelect: vi.fn(),
          onCloseSheet: vi.fn(),
          onPickOption: vi.fn()
        }}>
          <AttachmentControls />
        </ComposerAttachmentProvider>
      );
    });

    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    expect(inputs).toHaveLength(5);
    expect(inputs.filter((input) => !input.hasAttribute("capture")).every((input) => input.multiple)).toBe(true);
    const cameraInput = inputs.find((input) => input.hasAttribute("capture"));
    expect(cameraInput?.accept).toBe("image/*");
    expect(inputs.filter((input) => input !== cameraInput).every((input) => !input.hasAttribute("accept"))).toBe(true);
  });
});
