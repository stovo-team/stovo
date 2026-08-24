import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ImageLightbox from "./ImageLightbox";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ImageLightbox", () => {
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

  it("renders download button as icon-only without text and renders share button", () => {
    const handleDownload = vi.fn();
    const handleClose = vi.fn();

    act(() => {
      root?.render(
        <ImageLightbox
          imageUrl="test.jpg"
          title="Test Image"
          onClose={handleClose}
          onDownload={handleDownload}
        />
      );
    });

    const downloadBtn = document.querySelector<HTMLButtonElement>(".image-lightbox-download");
    expect(downloadBtn).not.toBeNull();
    expect(downloadBtn?.textContent).toBe("");
    expect(downloadBtn?.getAttribute("aria-label")).toBe("Download");

    const shareBtn = document.querySelector<HTMLButtonElement>(".image-lightbox-share");
    expect(shareBtn).not.toBeNull();
    expect(shareBtn?.getAttribute("aria-label")).toBe("Share media");
  });

  it("calls onShare when share button is clicked", () => {
    const handleShare = vi.fn();
    const handleClose = vi.fn();

    act(() => {
      root?.render(
        <ImageLightbox
          imageUrl="test.jpg"
          title="Test Image"
          onClose={handleClose}
          onShare={handleShare}
        />
      );
    });

    const shareBtn = document.querySelector<HTMLButtonElement>(".image-lightbox-share");
    expect(shareBtn).not.toBeNull();

    act(() => {
      shareBtn?.click();
    });

    expect(handleShare).toHaveBeenCalledTimes(1);
  });

  it("renders the pencil editor control only when editing is available", () => {
    const handleEdit = vi.fn();

    act(() => {
      root?.render(
        <ImageLightbox
          imageUrl="test.jpg"
          title="Test Image"
          onClose={vi.fn()}
          onEdit={handleEdit}
        />
      );
    });

    const editBtn = document.querySelector<HTMLButtonElement>(".image-lightbox-edit");
    expect(editBtn?.getAttribute("aria-label")).toBe("Edit photo");
    act(() => editBtn?.click());
    expect(handleEdit).toHaveBeenCalledTimes(1);
  });
});
