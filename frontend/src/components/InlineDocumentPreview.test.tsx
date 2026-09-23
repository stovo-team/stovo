import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as filesApi from "../api/files";
import type { FamilyFile } from "../api/files";
import { InlineDocumentPreview } from "./InlineDocumentPreview";
import type { TablePreview } from "./DocumentAttachmentPreview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

function makeFile(id: string): FamilyFile {
  return {
    id,
    familyId: "family-1",
    uploadedBy: "member-1",
    chatId: "chat-1",
    chatTitle: "Chat",
    chatType: "direct",
    originMessageId: "message-1",
    accessScope: "chat",
    storageProvider: "local",
    originalName: `${id}.csv`,
    mimeType: "text/csv",
    sizeBytes: 20,
    checksum: null,
    createdAt: "2026-09-22T00:00:00Z",
    deletedAt: null,
    isFavorite: false,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    act(() => root?.unmount());
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("InlineDocumentPreview", () => {
  it("does not show a spreadsheet parse result after its file has changed", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);
    document.body.appendChild(container);
    vi.spyOn(filesApi, "downloadFileBlob").mockResolvedValue(new Blob(["rows"]));
    const oldParse = deferred<TablePreview>();
    const newParse = deferred<TablePreview>();
    const loadTablePreview = vi.fn((file: FamilyFile) => file.id === "old-file" ? oldParse.promise : newParse.promise);
    const onResolvedSize = vi.fn();
    const props = (file: FamilyFile) => ({
      accessToken: "session-token",
      file,
      kind: "table" as const,
      onResolvedSize,
      loadTablePreview,
      renderPdf: () => null,
      renderDocx: () => null,
    });

    await act(async () => root.render(<InlineDocumentPreview {...props(makeFile("old-file"))} />));
    await act(async () => root.render(<InlineDocumentPreview {...props(makeFile("new-file"))} />));
    await act(async () => {
      newParse.resolve({ sheets: [{ name: "Sheet1", rows: [["new file"]] }], activeSheet: 0 });
      await Promise.resolve();
    });
    expect(container.textContent).toContain("new file");

    await act(async () => {
      oldParse.resolve({ sheets: [{ name: "Sheet1", rows: [["stale file"]] }], activeSheet: 0 });
      await Promise.resolve();
    });
    expect(container.textContent).toContain("new file");
    expect(container.textContent).not.toContain("stale file");
  });

  it("waits until near the viewport before downloading a document preview", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);
    document.body.appendChild(container);
    const download = vi.spyOn(filesApi, "downloadFileBlob").mockReturnValue(new Promise(() => undefined));
    let onIntersect: IntersectionObserverCallback | null = null;
    const observe = vi.fn();
    const disconnect = vi.fn();
    class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) { onIntersect = callback; }
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = () => [];
      root = null;
      rootMargin = "300px";
      thresholds = [0];
    }
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const file = makeFile("visible-file");

    await act(async () => root.render(
      <InlineDocumentPreview
        accessToken="session-token"
        file={file}
        kind="table"
        onResolvedSize={vi.fn()}
        loadTablePreview={async () => ({ sheets: [{ name: "Sheet1", rows: [] }], activeSheet: 0 })}
        renderPdf={() => null}
        renderDocx={() => null}
      />,
    ));

    expect(observe).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
    await act(async () => {
      onIntersect?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      await Promise.resolve();
    });
    expect(download).toHaveBeenCalledWith("session-token", "visible-file");
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
