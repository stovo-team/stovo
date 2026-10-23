import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAppStrings } from "../config/strings";

vi.mock("../i18n/LanguageContext", () => ({ useStrings: () => getAppStrings("ru") }));

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
});
