import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useComposerAttachments } from "./useComposerAttachments";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

function AttachmentHarness() {
  const attachments = useComposerAttachments();
  return (
    <>
      <input data-testid="files" ref={attachments.attachmentInputRef} type="file" multiple onChange={attachments.handleFileSelect} />
      <input data-testid="gallery" ref={attachments.galleryAttachmentInputRef} type="file" multiple onChange={attachments.handleFileSelect} />
      <output>{attachments.pendingAttachments.map(({ file }) => file.name).join(",")}</output>
    </>
  );
}

function selectFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, "files", { configurable: true, value: files });
  act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("useComposerAttachments", () => {
  it("accumulates mixed photos, documents, and audio from repeated multi-file pickers", () => {
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview") }));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(<AttachmentHarness />));

    selectFiles(container.querySelector<HTMLInputElement>("[data-testid=files]")!, [
      new File(["photo"], "photo.png", { type: "image/png" }),
      new File(["document"], "diagram.svg", { type: "image/svg+xml" })
    ]);
    selectFiles(container.querySelector<HTMLInputElement>("[data-testid=gallery]")!, [
      new File(["song"], "song.mp3", { type: "audio/mpeg" }),
      new File(["report"], "report.pdf", { type: "application/pdf" })
    ]);

    expect(container.querySelector("output")?.textContent).toBe("photo.png,diagram.svg,song.mp3,report.pdf");
  });

  it("keeps the current queue when a picker is cancelled with no files", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(<AttachmentHarness />));

    selectFiles(container.querySelector<HTMLInputElement>("[data-testid=files]")!, [
      new File(["document"], "report.pdf", { type: "application/pdf" })
    ]);
    selectFiles(container.querySelector<HTMLInputElement>("[data-testid=gallery]")!, []);

    expect(container.querySelector("output")?.textContent).toBe("report.pdf");
  });
});
