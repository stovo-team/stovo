import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAppStrings } from "../config/strings";

vi.mock("../i18n/LanguageContext", () => ({ useStrings: () => getAppStrings("ru") }));

import { PendingAttachmentCard } from "../features/chats/composer/PendingAttachmentCard";
import { ImageEditorModal } from "./ImageEditorModal";
import type { PendingLocalAttachment } from "../features/chats/shared/types";
import { readCssSource } from "../test/cssSource";

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

    expect(document.body.textContent).toContain("Изменить изображение");
    const adjustmentsTab = document.querySelector<HTMLButtonElement>('[aria-label="Настроить изображение"]');
    expect(adjustmentsTab).not.toBeNull();
    act(() => {
      adjustmentsTab?.click();
    });
    expect(document.body.textContent).toContain("Яркость");
    expect(document.body.textContent).toContain("Контрастность");
    expect(document.body.textContent).toContain("Гамма");

    // Click Crop tab
    const cropTab = document.querySelector<HTMLButtonElement>('[aria-label="Обрезать изображение"]');
    expect(cropTab).not.toBeNull();

    act(() => {
      cropTab?.click();
    });

    expect(document.body.textContent).toContain("Соотношение сторон:");
    expect(document.querySelector(".image-editor-crop-overlay")).not.toBeNull();
    expect(document.querySelector(".image-editor-crop-controls input[type=range]")).toBeNull();
    expect(document.querySelector(".image-editor-rotate")).not.toBeNull();
    expect(document.querySelector(".image-editor-footer")).toBeNull();

    // Click Draw tab
    const drawTab = document.querySelector<HTMLButtonElement>('[aria-label="Рисовать на изображении"]');
    expect(drawTab).not.toBeNull();

    act(() => {
      drawTab?.click();
    });

    expect(document.body.textContent).toContain("Цвет:");
    expect(document.body.textContent).toContain("Перо:");
    expect(document.body.textContent).toContain("Тонкое");
    expect(document.body.textContent).toContain("Размер кисти");
  });
  it("exports the selected square crop with the expected pixel coordinates", async () => {
    const image = { naturalWidth: 400, naturalHeight: 200, width: 400, height: 200, onload: null as null | (() => void), crossOrigin: "", src: "" };
    vi.stubGlobal("Image", vi.fn(function () { return image; }));
    const drawImage = vi.fn();
    const context = { clearRect: vi.fn(), drawImage, filter: "none" };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["cropped"], { type: "image/png" })));
    const onSave = vi.fn();
    try {
      act(() => root?.render(<ImageEditorModal pending={{ localId: "crop", file: new File(["original"], "photo.png", { type: "image/png" }), previewUrl: "blob:photo" }} onClose={vi.fn()} onSave={onSave} />));
      act(() => image.onload?.());
      act(() => document.querySelector<HTMLButtonElement>('[aria-label="Обрезать изображение"]')?.click());
      const square = Array.from(document.querySelectorAll<HTMLButtonElement>(".crop-ratio-btn")).find((button) => button.textContent === "1:1");
      act(() => square?.click());
      const overlay = document.querySelector<HTMLElement>(".image-editor-crop-overlay");
      expect(overlay?.style.left).toBe("25%");
      expect(overlay?.style.width).toBe("50%");
      await act(async () => { document.querySelector<HTMLButtonElement>(".image-editor-close-btn")?.click(); });
      expect(drawImage).toHaveBeenCalledWith(image, 100, 0, 200, 200, 0, 0, 200, 200);
      expect(onSave).toHaveBeenCalledOnce();
      expect(onSave.mock.calls[0][0]).toMatchObject({ name: "photo.png", type: "image/png" });
    } finally {
      getContext.mockRestore();
      toBlob.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("renders selection button in header when onToggleSelect is provided", () => {
    const onToggleSelect = vi.fn();
    const pending: PendingLocalAttachment = {
      localId: "local:789",
      file: new File(["dummy"], "photo.png", { type: "image/png" }),
      previewUrl: "blob:http://localhost/photo"
    };

    act(() => {
      root?.render(
        <ImageEditorModal
          pending={pending}
          onClose={vi.fn()}
          onSave={vi.fn()}
          isSelected={false}
          onToggleSelect={onToggleSelect}
        />
      );
    });

    const selectBtn = document.querySelector<HTMLButtonElement>(".image-editor-select-btn");
    expect(selectBtn).not.toBeNull();
    expect(selectBtn?.classList.contains("checked")).toBe(false);

    act(() => {
      selectBtn?.click();
    });
    expect(onToggleSelect).toHaveBeenCalledTimes(1);

    act(() => {
      root?.render(
        <ImageEditorModal
          pending={pending}
          onClose={vi.fn()}
          onSave={vi.fn()}
          isSelected={true}
          onToggleSelect={onToggleSelect}
        />
      );
    });

    expect(selectBtn?.classList.contains("checked")).toBe(true);
  });

  it("styles crop ratios in a single scrollable row without wrapping", () => {
    const styles = readCssSource("src/styles.css");
    const cropRatiosMatch = styles.match(/\.crop-ratios\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(cropRatiosMatch).toContain("flex-wrap: nowrap;");
    expect(cropRatiosMatch).toContain("overflow-x: auto;");
  });
});
