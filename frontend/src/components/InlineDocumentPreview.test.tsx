import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as filesApi from "../api/files";
import type { FamilyFile } from "../api/files";
import { LanguageProvider } from "../i18n/LanguageContext";
import { InlineDocumentPreview } from "./InlineDocumentPreview";
import { AttachmentCard } from "../features/chats/conversation/MessageAttachmentThumbs";
import type { TablePreview } from "./DocumentAttachmentPreview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const styles = readFileSync("src/styles.css", "utf8");

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

  it("renders Markdown as a canvas-style preview and treats document markup as text", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);
    document.body.appendChild(container);
    vi.spyOn(filesApi, "downloadFileBlob").mockResolvedValue(new Blob(["# Release notes\nA **formatted** intro.\nKeep&nbsp;spacing.\n![][image1]\n![cover](data:image/png;base64,AAAA)\n![unsafe](javascript:alert(1))\n&nbsp;\n<script>text only</script>"], { type: "text/plain" }));

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

    expect(container.querySelector(".document-inline-preview-canvas .canvas-md-h1")?.textContent).toBe("Release notes");
    expect(container.querySelector(".document-inline-preview-canvas strong")?.textContent).toBe("formatted");
    expect(container.querySelector(".document-inline-preview-canvas .canvas-md-image")?.textContent).toBe("Image: image1");
    expect(container.textContent).toContain("Keep\u00a0spacing.");
    expect(container.querySelector<HTMLImageElement>("img.canvas-md-image")?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
    expect(container.textContent).toContain("Image: unsafe");
    expect(container.querySelector('img[src^="javascript:"]')).toBeNull();
    expect(container.textContent).toContain("\u00a0");
    expect(container.textContent).not.toContain("&nbsp;");
    expect(container.querySelector(".document-inline-preview-canvas script")).toBeNull();
    expect(container.querySelector(".document-inline-preview-canvas")?.textContent).toContain("<script>text only</script>");
    expect(container.querySelector(".document-preview-open")).not.toBeNull();
  });

  it("preserves leading indentation so Markdown code blocks keep their formatting", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);
    document.body.appendChild(container);
    vi.spyOn(filesApi, "downloadFileBlob").mockResolvedValue(new Blob(["    const answer = 42;"], { type: "text/markdown" }));

    await act(async () => root.render(
      <LanguageProvider>
        <AttachmentCard
          accessToken="session-token"
          chatId="chat-1"
          file={makeFile("indented-markdown", "code.md", "text/markdown")}
          messageId="message-code"
        />
      </LanguageProvider>,
    ));

    expect(container.querySelector(".canvas-md-code-line")?.textContent).toBe("const answer = 42;");
  });

  it("shows the opening Markdown lines at canvas size and leaves later content out of the preview", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);
    document.body.appendChild(container);
    const markdown = ["# Intro", ...Array.from({ length: 40 }, (_, index) => `Opening detail ${index + 1}`)].join("\n");
    vi.spyOn(filesApi, "downloadFileBlob").mockResolvedValue(new Blob([markdown], { type: "text/markdown" }));

    await act(async () => root.render(
      <LanguageProvider>
        <AttachmentCard
          accessToken="session-token"
          chatId="chat-1"
          file={makeFile("long-markdown", "guide.md", "text/markdown")}
          messageId="message-3"
        />
      </LanguageProvider>,
    ));

    const renderedLines = Array.from(container.querySelectorAll(".document-inline-preview-canvas .canvas-md-p"));
    expect(container.querySelector(".canvas-md-h1")?.textContent).toBe("Intro");
    expect(renderedLines[0]?.textContent).toBe("Opening detail 1");
    expect(renderedLines.length).toBeLessThan(40);
    expect(container.textContent).not.toContain("Opening detail 40");
  });

  it("uses a clipped 16:9 preview viewport so document pages show their top instead of shrinking to fit", () => {
    const start = styles.indexOf(".document-inline-preview {");
    const end = styles.indexOf("\n}", start);
    const viewportRule = styles.slice(start, end + 2);

    expect(viewportRule).toContain("aspect-ratio: 16 / 9;");
    expect(viewportRule).toContain("overflow: hidden;");
    expect(viewportRule).toContain("min-width: 0;");
    expect(styles).toContain(".document-inline-preview-canvas");
  });

  it("passes the downloaded DOCX blob to the fidelity renderer", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);
    document.body.appendChild(container);
    const docxBlob = new Blob(["docx bytes"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    vi.spyOn(filesApi, "downloadFileBlob").mockResolvedValue(docxBlob);
    const renderDocx = vi.fn(() => <div className="docx-rendered">DOCX page</div>);

    await act(async () => root.render(
      <InlineDocumentPreview
        accessToken="session-token"
        file={makeFile("docx", "report.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
        kind="docx"
        onResolvedSize={vi.fn()}
        loadTablePreview={async () => ({ sheets: [{ name: "Sheet1", rows: [] }], activeSheet: 0 })}
        renderPdf={() => null}
        renderDocx={(blob) => <>{renderDocx(blob)}</>}
      />,
    ));

    expect(container.querySelector(".docx-rendered")?.textContent).toBe("DOCX page");
    expect(renderDocx).toHaveBeenCalledWith(docxBlob);
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
