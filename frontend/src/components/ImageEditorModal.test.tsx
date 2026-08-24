import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PendingAttachmentCard } from "../features/chats/composer/PendingAttachmentCard";
import { ImageEditorModal } from "./ImageEditorModal";
import type { PendingLocalAttachment } from "../features/chats/shared/types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("PendingAttachmentCard", () => {
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

  it("stops propagation when remove button is clicked", () => {
    const onRemove = vi.fn();
    const onEdit = vi.fn();
    const dummyFile = new File(["dummy"], "sample.jpg", { type: "image/jpeg" });
    const pending: PendingLocalAttachment = {
      localId: "local:123",
      file: dummyFile,
      previewUrl: "blob:http://localhost/dummy"
    };

    act(() => {
      root?.render(
        <PendingAttachmentCard
          pending={pending}
          onRemove={onRemove}
          onEdit={onEdit}
        />
      );
    });

    const removeBtn = document.querySelector<HTMLButtonElement>(".pending-attachment-remove");
    expect(removeBtn).not.toBeNull();

    act(() => {
      removeBtn?.click();
    });

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("calls onEdit when attachment card is clicked", () => {
    const onRemove = vi.fn();
    const onEdit = vi.fn();
    const dummyFile = new File(["dummy"], "sample.jpg", { type: "image/jpeg" });
    const pending: PendingLocalAttachment = {
      localId: "local:123",
      file: dummyFile,
      previewUrl: "blob:http://localhost/dummy"
    };

    act(() => {
      root?.render(
        <PendingAttachmentCard
          pending={pending}
          onRemove={onRemove}
          onEdit={onEdit}
        />
      );
    });

    const card = document.querySelector<HTMLElement>(".pending-attachment-card");
    expect(card).not.toBeNull();

    act(() => {
      card?.click();
    });

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onRemove).not.toHaveBeenCalled();
  });
});

describe("ImageEditorModal", () => {
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

  it("renders image editor modal with adjustment controls and tabs", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const dummyFile = new File(["dummy"], "photo.png", { type: "image/png" });
    const pending: PendingLocalAttachment = {
      localId: "local:456",
      file: dummyFile,
      previewUrl: "blob:http://localhost/photo"
    };

    act(() => {
      root?.render(
        <ImageEditorModal
          pending={pending}
          onClose={onClose}
          onSave={onSave}
        />
      );
    });

    expect(document.body.textContent).toContain("Edit Image");
    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".image-editor-tab"));
    const adjustmentsTab = tabs.find((t) => t.querySelector("svg.lucide-sliders"));
    expect(adjustmentsTab).not.toBeUndefined();
    act(() => {
      adjustmentsTab?.click();
    });
    expect(document.body.textContent).toContain("Brightness");
    expect(document.body.textContent).toContain("Contrast");
    expect(document.body.textContent).toContain("Gamma");

    // Click Crop tab
    const cropTab = tabs.find((t) => t.querySelector("svg.lucide-crop"));
    expect(cropTab).not.toBeUndefined();

    act(() => {
      cropTab?.click();
    });

    expect(document.body.textContent).toContain("Aspect Ratio:");

    // Click Draw tab
    const drawTab = tabs.find((t) => t.querySelector("svg.lucide-pencil"));
    expect(drawTab).not.toBeUndefined();

    act(() => {
      drawTab?.click();
    });

    expect(document.body.textContent).toContain("Color:");
    expect(document.body.textContent).toContain("Pen:");
    expect(document.body.textContent).toContain("Fine");
    expect(document.body.textContent).toContain("Brush Size");
  });
});
