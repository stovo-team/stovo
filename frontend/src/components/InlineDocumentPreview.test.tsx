import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as filesApi from "../api/files";
import type { FamilyFile } from "../api/files";
import { LanguageProvider } from "../i18n/LanguageContext";
import { InlineDocumentPreview } from "./InlineDocumentPreview";
import { AttachmentCard } from "../features/chats/conversation/MessageAttachmentThumbs";
import type { TablePreview } from "./DocumentAttachmentPreview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

function makeFile(id: string, name = `${id}.pdf`, mimeType = "application/pdf"): FamilyFile {
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
    originalName: name,
    mimeType,
    sizeBytes: 120,
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

describe("inline document previews in chat", () => {
  it("renders a preview row without opening a modal and retains Open and Save", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);
    document.body.appendChild(container);
    const download = vi.spyOn(filesApi, "downloadFileBlob").mockReturnValue(new Promise(() => undefined));

    await act(async () => root.render(
      <LanguageProvider>
        <AttachmentCard
          accessToken="session-token"
          chatId="chat-1"
          file={makeFile("chat-pdf")}
          messageId="message-1"
        />
      </LanguageProvider>,
    ));

    expect(container.querySelector(".document-inline-preview")).not.toBeNull();
    expect(container.textContent).toContain("Loading preview…");
    expect(container.querySelector(".document-preview-open")).not.toBeNull();
    expect(container.querySelector(".document-preview-save")).not.toBeNull();
    expect(download).toHaveBeenCalledWith("session-token", "chat-pdf");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("renders Markdown as safe plain text in the chat attachment", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);
    document.body.appendChild(container);
    vi.spyOn(filesApi, "downloadFileBlob").mockResolvedValue(new Blob(["# Release notes\n<script>text only</script>"], { type: "text/plain" }));

    await act(async () => root.render(
      <LanguageProvider>
        <AttachmentCard
          accessToken="session-token"
          chatId="chat-1"
          file={makeFile("chat-markdown", "release-notes.md", "text/markdown")}
          messageId="message-2"
        />
      </LanguageProvider>,
    ));

    expect(container.querySelector(".document-inline-preview-text")?.textContent).toContain("# Release notes");
    expect(container.querySelector(".document-inline-preview-text script")).toBeNull();
    expect(container.querySelector(".document-preview-open")).not.toBeNull();
  });

  it("keeps Open available when an inline preview download fails", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);
    document.body.appendChild(container);
    vi.spyOn(filesApi, "downloadFileBlob").mockRejectedValue(new Error("offline"));

    await act(async () => root.render(
      <InlineDocumentPreview
        accessToken="session-token"
        file={makeFile("unavailable")}
        kind="pdf"
        onResolvedSize={vi.fn()}
        loadTablePreview={async () => ({ sheets: [{ name: "Sheet1", rows: [] }], activeSheet: 0 })}
        loadDocxPreview={async () => ""}
        renderPdf={() => null}
        renderDocx={() => null}
      />,
    ));

    expect(container.textContent).toContain("Preview couldn’t load.");
  });

  it("does not show a spreadsheet parse result after its file changes", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);
    document.body.appendChild(container);
    vi.spyOn(filesApi, "downloadFileBlob").mockResolvedValue(new Blob(["rows"]));
    const oldParse = deferred<TablePreview>();
    const newParse = deferred<TablePreview>();
    const loadTablePreview = vi.fn((file: FamilyFile) => file.id === "old" ? oldParse.promise : newParse.promise);
    const onResolvedSize = vi.fn();
    const props = (file: FamilyFile) => ({
      accessToken: "session-token",
      file,
      kind: "table" as const,
      onResolvedSize,
      loadTablePreview,
      loadDocxPreview: async () => "",
      renderPdf: () => null,
      renderDocx: () => null,
    });

    await act(async () => root.render(<InlineDocumentPreview {...props(makeFile("old", "old.csv", "text/csv"))} />));
    await act(async () => root.render(<InlineDocumentPreview {...props(makeFile("new", "new.csv", "text/csv"))} />));
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

  it("waits until near the viewport before downloading a preview", async () => {
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

    await act(async () => root.render(
      <InlineDocumentPreview
        accessToken="session-token"
        file={makeFile("near", "near.csv", "text/csv")}
        kind="table"
        onResolvedSize={vi.fn()}
        loadTablePreview={async () => ({ sheets: [{ name: "Sheet1", rows: [] }], activeSheet: 0 })}
        loadDocxPreview={async () => ""}
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
    expect(download).toHaveBeenCalledWith("session-token", "near");
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
