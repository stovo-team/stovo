import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  applyPdfPageZoom,
  clampPdfZoom,
  nextPinchZoom,
  nextWheelZoom,
  PDF_MAX_ZOOM,
  PDF_MIN_ZOOM,
  touchDistance,
} from "./pdfViewerZoom";
import {
  DocumentAttachmentPreview,
  getPdfRenderLimits,
  sanitizeDocxHtml,
} from "./DocumentAttachmentPreview";
import { clearMediaBlobCache } from "../mediaBlobCache";
import * as filesApi from "../api/files";
import type { FamilyFile } from "../api/files";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const styles = readFileSync("src/styles.css", "utf8");
const { renderDocxMock, navigateMock, createCanvasMock, appendCanvasDocumentUpdateMock, getChatsMock } = vi.hoisted(() => ({
  renderDocxMock: vi.fn(),
  navigateMock: vi.fn(),
  createCanvasMock: vi.fn(),
  appendCanvasDocumentUpdateMock: vi.fn(),
  getChatsMock: vi.fn(),
}));

vi.mock("docx-preview", () => ({ renderAsync: renderDocxMock }), { virtual: true });
vi.mock("../api/canvas", async (importOriginal) => ({
  ...await importOriginal<typeof import("../api/canvas")>(),
  createCanvas: createCanvasMock,
  appendCanvasDocumentUpdate: appendCanvasDocumentUpdateMock,
}));
vi.mock("../api/chats", async (importOriginal) => ({
  ...await importOriginal<typeof import("../api/chats")>(),
  getChats: getChatsMock,
}));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-router-dom")>(),
  useNavigate: () => navigateMock,
}));

function rule(selector: string): string {
  const start = styles.indexOf(`${selector} {`);
  if (start < 0) return "";
  const end = styles.indexOf("\n}", start);
  return styles.slice(start, end + 2);
}

describe("PDF viewer zoom helpers", () => {
  it("clamps zoom between min and max", () => {
    expect(clampPdfZoom(0.1)).toBe(PDF_MIN_ZOOM);
    expect(clampPdfZoom(99)).toBe(PDF_MAX_ZOOM);
    expect(clampPdfZoom(1.5)).toBe(1.5);
    expect(clampPdfZoom(Number.NaN)).toBe(1);
  });

  it("computes pinch distance between two touch points", () => {
    expect(touchDistance({ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 })).toBe(5);
  });

  it("scales zoom from a pinch distance ratio", () => {
    expect(nextPinchZoom(1, 100, 200)).toBe(2);
    expect(nextPinchZoom(2, 200, 100)).toBe(1);
    expect(nextPinchZoom(1, 100, 1000)).toBe(PDF_MAX_ZOOM);
    expect(nextPinchZoom(1, 0, 100)).toBe(1);
  });

  it("zooms with ctrl/meta wheel deltas", () => {
    expect(nextWheelZoom(1, -100)).toBeGreaterThan(1);
    expect(nextWheelZoom(1, 100)).toBeLessThan(1);
    expect(nextWheelZoom(1, -1000)).toBe(PDF_MAX_ZOOM);
    expect(nextWheelZoom(1, 1000)).toBe(PDF_MIN_ZOOM);
  });

  it("applies zoom by scaling canvas CSS size from base dimensions", () => {
    const host = document.createElement("div");
    const canvas = document.createElement("canvas");
    canvas.className = "document-viewer-pdf-page";
    canvas.dataset.baseWidth = "200";
    canvas.dataset.baseHeight = "300";
    host.appendChild(canvas);

    applyPdfPageZoom(host, 2);

    expect(canvas.style.width).toBe("400px");
    expect(canvas.style.height).toBe("600px");
  });
});

describe("PDF viewer render limits", () => {
  it("keeps mobile PDF previews within a device-safe page and pixel budget", () => {
    expect(getPdfRenderLimits(80, 3, true)).toEqual({ maxPages: 12, dpr: 1.5 });
    expect(getPdfRenderLimits(8, 1, true)).toEqual({ maxPages: 8, dpr: 1 });
  });

  it("keeps the fuller preview budget on unconstrained devices", () => {
    expect(getPdfRenderLimits(80, 3, false)).toEqual({ maxPages: 40, dpr: 2 });
  });
});

describe("detectDocumentPreviewKind", () => {
  const baseFile = {
    id: "f1",
    familyId: "fam1",
    uploadedBy: "u1",
    chatId: null,
    chatTitle: null,
    chatType: null,
    originMessageId: null,
    accessScope: "family" as const,
    storageProvider: "local" as const,
    originalName: "file.bin",
    mimeType: "application/octet-stream",
    sizeBytes: 1024,
    checksum: null,
    createdAt: "2026-09-08T00:00:00Z",
    deletedAt: null,
    isFavorite: false,
  };

  it("detects PDF from mimeType and extension", async () => {
    const { detectDocumentPreviewKind } = await import("./DocumentAttachmentPreview");
    expect(detectDocumentPreviewKind({ ...baseFile, originalName: "report.pdf", mimeType: "application/pdf" })).toBe("pdf");
    expect(detectDocumentPreviewKind({ ...baseFile, originalName: "DOCUMENT.PDF", mimeType: "" })).toBe("pdf");
    expect(detectDocumentPreviewKind({ ...baseFile, originalName: "report", mimeType: "application/pdf" })).toBe("pdf");
  });

  it("detects DOCX from mimeType and extension", async () => {
    const { detectDocumentPreviewKind } = await import("./DocumentAttachmentPreview");
    expect(detectDocumentPreviewKind({ ...baseFile, originalName: "resume.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })).toBe("docx");
    expect(detectDocumentPreviewKind({ ...baseFile, originalName: "doc.docx", mimeType: "" })).toBe("docx");
    expect(detectDocumentPreviewKind({ ...baseFile, originalName: "signed.docx", mimeType: "application/pdf" })).toBe("docx");
  });

  it("detects tables (xlsx, xls, csv, tsv)", async () => {
    const { detectDocumentPreviewKind } = await import("./DocumentAttachmentPreview");
    expect(detectDocumentPreviewKind({ ...baseFile, originalName: "data.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })).toBe("table");
    expect(detectDocumentPreviewKind({ ...baseFile, originalName: "old.xls", mimeType: "application/vnd.ms-excel" })).toBe("table");
    expect(detectDocumentPreviewKind({ ...baseFile, originalName: "export.csv", mimeType: "text/csv" })).toBe("table");
    expect(detectDocumentPreviewKind({ ...baseFile, originalName: "export.tsv", mimeType: "text/tab-separated-values" })).toBe("table");
  });

  it("detects Markdown and plain text documents", async () => {
    const { detectDocumentPreviewKind } = await import("./DocumentAttachmentPreview");
    expect(detectDocumentPreviewKind({ ...baseFile, originalName: "notes.md", mimeType: "text/markdown" })).toBe("text");
    expect(detectDocumentPreviewKind({ ...baseFile, originalName: "readme.markdown", mimeType: "" })).toBe("text");
    expect(detectDocumentPreviewKind({ ...baseFile, originalName: "notes.txt", mimeType: "text/plain" })).toBe("text");
  });

  it("returns unsupported for other formats and handles empty values safely", async () => {
    const { detectDocumentPreviewKind } = await import("./DocumentAttachmentPreview");
    expect(detectDocumentPreviewKind({ ...baseFile, originalName: "photo.jpg", mimeType: "image/jpeg" })).toBe("unsupported");
    expect(detectDocumentPreviewKind({ ...baseFile, originalName: "", mimeType: "" })).toBe("unsupported");
  });
});

describe("sanitizeDocxHtml", () => {
  it("removes executable markup and unsafe URL schemes while retaining document structure", () => {
    const html = sanitizeDocxHtml(
      '<p onclick="alert(1)">Hello <strong>world</strong><script>alert(1)</script></p><a href="javascript:alert(1)">bad</a><img src="data:image/svg+xml;base64,PHN2Zz4=" onerror="alert(1)"><img src="data:image/png;base64,AAAA">'
    );
    const host = document.createElement("div");
    host.innerHTML = html;

    expect(host.textContent).toContain("Hello worldalert(1)bad");
    expect(host.querySelector("script")).toBeNull();
    expect(host.querySelector("p")?.getAttribute("onclick")).toBeNull();
    expect(host.querySelector("a")?.hasAttribute("href")).toBe(false);
    expect(host.querySelectorAll("img")).toHaveLength(2);
    expect(host.querySelectorAll("img")[0]?.hasAttribute("src")).toBe(false);
    expect(host.querySelectorAll("img")[1]?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
  });
});

describe("document attachment cards in chat", () => {
  it("renders Markdown as formatted document content instead of raw source", async () => {
    const container = document.createElement("div");
    const root: Root = createRoot(container);
    vi.spyOn(filesApi, "downloadFileBlob").mockResolvedValue(new Blob(["# Project plan\n\n**Ready**"], { type: "text/markdown" }));
    const file: FamilyFile = {
      id: "markdown-preview", familyId: "family-1", uploadedBy: "member-1", chatId: "chat-1",
      chatTitle: "Chat", chatType: "direct", originMessageId: "message-1", accessScope: "chat",
      storageProvider: "local", originalName: "plan.md", mimeType: "text/markdown", sizeBytes: 27,
      checksum: null, createdAt: "2026-09-22T00:00:00Z", deletedAt: null, isFavorite: false,
    };
    document.body.appendChild(container);
    try {
      await act(async () => root.render(<DocumentAttachmentPreview accessToken="token" file={file} />));
      await act(async () => {
        container.querySelector<HTMLButtonElement>(".document-preview-open")?.click();
        await new Promise((resolve) => window.setTimeout(resolve, 20));
      });

      expect(document.querySelector(".document-viewer-markdown h1")?.textContent).toBe("Project plan");
      expect(document.querySelector(".document-viewer-markdown strong")?.textContent).toBe("Ready");
      expect(document.querySelector(".document-viewer-text")).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      clearMediaBlobCache();
      vi.restoreAllMocks();
    }
  });

  it("converts Markdown into an editable Canvas and opens that Canvas after saving", async () => {
    const container = document.createElement("div");
    const root: Root = createRoot(container);
    const markdown = "# Project plan\n\n- First step";
    vi.spyOn(filesApi, "downloadFileBlob").mockResolvedValue(new Blob([markdown], { type: "text/markdown" }));
    createCanvasMock.mockResolvedValue({ id: "canvas-1" });
    appendCanvasDocumentUpdateMock.mockResolvedValue({});
    const file: FamilyFile = {
      id: "markdown-convert", familyId: "family-1", uploadedBy: "member-1", chatId: "chat-1",
      chatTitle: "Chat", chatType: "direct", originMessageId: "message-1", accessScope: "chat",
      storageProvider: "local", originalName: "plan.md", mimeType: "text/markdown", sizeBytes: markdown.length,
      checksum: null, createdAt: "2026-09-22T00:00:00Z", deletedAt: null, isFavorite: false,
    };
    document.body.appendChild(container);
    try {
      await act(async () => root.render(<DocumentAttachmentPreview accessToken="token" file={file} />));
      await act(async () => {
        container.querySelector<HTMLButtonElement>(".document-preview-open")?.click();
        await new Promise((resolve) => window.setTimeout(resolve, 20));
      });
      const convert = document.querySelector<HTMLButtonElement>(".document-viewer-convert-canvas");
      expect(convert).not.toBeNull();

      await act(async () => {
        convert?.click();
        await new Promise((resolve) => window.setTimeout(resolve, 20));
      });

      expect(createCanvasMock).toHaveBeenCalledWith("token", "chat-1", "plan");
      expect(appendCanvasDocumentUpdateMock).toHaveBeenCalledWith("token", "canvas-1", expect.any(String));
      expect(navigateMock).toHaveBeenCalledWith("/app/canvas/canvas-1");
      const encodedUpdate = appendCanvasDocumentUpdateMock.mock.calls[0]?.[2] as string;
      const update = Uint8Array.from(atob(encodedUpdate), (character) => character.charCodeAt(0));
      const canvasDoc = new Y.Doc();
      Y.applyUpdate(canvasDoc, update);
      const block = canvasDoc.getArray<Y.Map<unknown>>("blocks").get(0);
      expect(block?.get("kind")).toBe("markdown");
      expect((block?.get("content") as Y.Text).toString()).toBe(markdown);
      canvasDoc.destroy();
      expect(convert?.disabled).toBe(true);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      clearMediaBlobCache();
      vi.restoreAllMocks();
      createCanvasMock.mockReset();
      appendCanvasDocumentUpdateMock.mockReset();
      navigateMock.mockReset();
    }
  });

  it("lets a standalone Markdown file choose a chat before creating its Canvas", async () => {
    const container = document.createElement("div");
    const root: Root = createRoot(container);
    vi.spyOn(filesApi, "downloadFileBlob").mockResolvedValue(new Blob(["# Standalone"]));
    getChatsMock.mockResolvedValue([{ id: "chat-destination", title: "Project chat" }]);
    createCanvasMock.mockResolvedValue({ id: "canvas-standalone" });
    appendCanvasDocumentUpdateMock.mockResolvedValue({});
    const file: FamilyFile = {
      id: "markdown-without-chat", familyId: "family-1", uploadedBy: "member-1", chatId: null,
      chatTitle: null, chatType: null, originMessageId: null, accessScope: "family",
      storageProvider: "local", originalName: "standalone.md", mimeType: "text/markdown", sizeBytes: 11,
      checksum: null, createdAt: "2026-09-22T00:00:00Z", deletedAt: null, isFavorite: false,
    };
    document.body.appendChild(container);
    try {
      await act(async () => root.render(<DocumentAttachmentPreview accessToken="token" file={file} />));
      await act(async () => {
        container.querySelector<HTMLButtonElement>(".document-preview-open")?.click();
        await new Promise((resolve) => window.setTimeout(resolve, 20));
      });

      const convertButton = document.querySelector<HTMLButtonElement>(".document-viewer-convert-canvas");
      expect(convertButton?.disabled).toBe(false);
      await act(async () => {
        convertButton?.click();
        await Promise.resolve();
      });
      expect(getChatsMock).toHaveBeenCalledWith("token");
      const chatSelect = document.querySelector<HTMLSelectElement>(".document-viewer-canvas-chat");
      expect(chatSelect?.options[1]?.textContent).toBe("Project chat");
      await act(async () => {
        if (chatSelect) {
          chatSelect.value = "chat-destination";
          chatSelect.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
      await act(async () => {
        document.querySelector<HTMLButtonElement>(".document-viewer-convert-canvas")?.click();
        await new Promise((resolve) => window.setTimeout(resolve, 20));
      });
      expect(createCanvasMock).toHaveBeenCalledWith("token", "chat-destination", "standalone");
      expect(navigateMock).toHaveBeenCalledWith("/app/canvas/canvas-standalone");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      clearMediaBlobCache();
      vi.restoreAllMocks();
      createCanvasMock.mockReset();
    }
  });

  it("keeps the preview open and does not navigate when Canvas document seeding fails", async () => {
    const container = document.createElement("div");
    const root: Root = createRoot(container);
    vi.spyOn(filesApi, "downloadFileBlob").mockResolvedValue(new Blob(["# Recovery"]));
    createCanvasMock.mockResolvedValue({ id: "canvas-seed-failure" });
    appendCanvasDocumentUpdateMock.mockRejectedValue(new Error("Canvas save failed"));
    const file: FamilyFile = {
      id: "markdown-seed-failure", familyId: "family-1", uploadedBy: "member-1", chatId: "chat-1",
      chatTitle: "Chat", chatType: "direct", originMessageId: "message-1", accessScope: "chat",
      storageProvider: "local", originalName: "recovery.md", mimeType: "text/markdown", sizeBytes: 10,
      checksum: null, createdAt: "2026-09-22T00:00:00Z", deletedAt: null, isFavorite: false,
    };
    document.body.appendChild(container);
    try {
      await act(async () => root.render(<DocumentAttachmentPreview accessToken="token" file={file} />));
      await act(async () => {
        container.querySelector<HTMLButtonElement>(".document-preview-open")?.click();
        await new Promise((resolve) => window.setTimeout(resolve, 20));
      });
      await act(async () => {
        document.querySelector<HTMLButtonElement>(".document-viewer-convert-canvas")?.click();
        await new Promise((resolve) => window.setTimeout(resolve, 20));
      });

      expect(document.querySelector('[role="alert"]')?.textContent).toBe("Canvas save failed");
      expect(navigateMock).not.toHaveBeenCalled();
      expect(document.querySelector<HTMLButtonElement>('[role="alert"] button')?.textContent).toBe("Open Canvas");
      expect(document.querySelector<HTMLButtonElement>(".document-viewer-convert-canvas")?.disabled).toBe(true);
      await act(async () => document.querySelector<HTMLButtonElement>('[role="alert"] button')?.click());
      expect(navigateMock).toHaveBeenCalledWith("/app/canvas/canvas-seed-failure");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      clearMediaBlobCache();
      vi.restoreAllMocks();
    }
  });

  it("caps the full text viewer content for large documents", async () => {
    const container = document.createElement("div");
    const root: Root = createRoot(container);
    const source = "x".repeat(100_001);
    vi.spyOn(Blob.prototype, "text").mockImplementation(function (this: Blob) {
      expect(this.size).toBe(100_000);
      return Promise.resolve("x".repeat(this.size));
    });
    vi.spyOn(filesApi, "downloadFileBlob").mockResolvedValue(new Blob([source], { type: "text/plain" }));
    const file: FamilyFile = {
      id: "large-text-document", familyId: "family-1", uploadedBy: "member-1", chatId: "chat-1",
      chatTitle: "Chat", chatType: "direct", originMessageId: "message-1", accessScope: "chat",
      storageProvider: "local", originalName: "notes.txt", mimeType: "text/plain", sizeBytes: source.length,
      checksum: null, createdAt: "2026-09-22T00:00:00Z", deletedAt: null, isFavorite: false,
    };
    document.body.appendChild(container);
    try {
      await act(async () => root.render(<DocumentAttachmentPreview accessToken="token" file={file} />));
      await act(async () => {
        container.querySelector<HTMLButtonElement>(".document-preview-open")?.click();
        await new Promise((resolve) => window.setTimeout(resolve, 20));
      });

      expect(document.querySelector(".document-viewer-text")?.textContent).toHaveLength(100_000);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      clearMediaBlobCache();
      vi.restoreAllMocks();
    }
  });

  it("preserves DOCX formatting and removes unsafe links in the full viewer", async () => {
    const container = document.createElement("div");
    const root: Root = createRoot(container);
    const blob = new Blob(["docx bytes"]);
    vi.spyOn(filesApi, "downloadFileBlob").mockResolvedValue(blob);
    renderDocxMock.mockImplementation(async (_data: Blob, body: HTMLElement) => {
      const page = document.createElement("section");
      page.innerHTML = '<h1 style="font-size: 28pt">SUMMARY</h1><p><strong>Backend developer</strong></p><ul><li>Production APIs</li></ul><a href="javascript:alert(1)">unsafe</a><a href="https://example.com">safe</a>';
      body.appendChild(page);
    });
    const file: FamilyFile = {
      id: "docx", familyId: "family", uploadedBy: "member", chatId: "chat", chatTitle: "Chat",
      chatType: "direct", originMessageId: "message", accessScope: "chat", storageProvider: "local",
      originalName: "resume.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: blob.size, checksum: null, createdAt: "2026-09-22T00:00:00Z", deletedAt: null, isFavorite: false,
    };
    document.body.appendChild(container);
    try {
      await act(async () => root.render(<DocumentAttachmentPreview accessToken="token" file={file} />));
      await act(async () => {
        container.querySelector<HTMLButtonElement>(".document-preview-open")?.click();
        await new Promise((resolve) => window.setTimeout(resolve, 20));
      });
      const preview = document.querySelector<HTMLElement>(".document-viewer-docx");
      expect(preview?.querySelector("h1")?.style.fontSize).toBe("28pt");
      expect(preview?.querySelector("strong")?.textContent).toBe("Backend developer");
      expect(preview?.querySelector("ul li")?.textContent).toBe("Production APIs");
      expect(preview?.querySelector("a")?.hasAttribute("href")).toBe(false);
      expect(preview?.querySelectorAll("a")[1]?.getAttribute("href")).toBe("https://example.com");
      expect(renderDocxMock).toHaveBeenCalledWith(blob, expect.any(HTMLElement), expect.any(HTMLElement),
        expect.objectContaining({ renderAltChunks: false, useBase64URL: true }));
      expect(renderDocxMock.mock.calls[0]?.[1]).not.toBe(preview);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      clearMediaBlobCache();
      vi.restoreAllMocks();
      renderDocxMock.mockReset();
    }
  });

  it("keeps the document viewer close control fully circular", () => {
    const closeButtonStart = styles.lastIndexOf(".document-viewer-close {");
    const closeButton = styles.slice(closeButtonStart, styles.indexOf("\n}", closeButtonStart) + 2);

    expect(closeButton).toContain("aspect-ratio: 1 / 1;");
    expect(closeButton).toContain("flex: 0 0 38px;");
    expect(closeButton).toContain("padding: 0;");
  });

  it("keeps the outgoing bubble snug to its document card on narrow screens instead of leaving a wide right gutter", () => {
    const documentBubble = rule(".message-bubble:has(.document-preview-card)");
    const compactDocumentBubble = rule(":root[data-density=\"compact\"] .message-bubble:has(.document-preview-card)");

    // The document card itself is capped at 420px. Match that cap on the
    // surrounding message bubble, and leave only the small visual inset the
    // attachment needs rather than the generic text-message padding.
    expect(documentBubble).toContain("max-width: min(420px, calc(100vw - 48px));");
    expect(documentBubble).toContain("width: min(420px, calc(100vw - 48px));");
    expect(documentBubble).toContain("padding-inline: 6px;");

    // Compact density has a later, more-specific generic bubble padding rule.
    // Preserve the attachment inset instead of restoring the wide text bubble.
    expect(compactDocumentBubble).toContain("padding-inline: 6px;");
  });

  it("opens a viewer and starts downloading a previewable document when Open is pressed", async () => {
    const container = document.createElement("div");
    const root: Root = createRoot(container);
    const previewRequest = new Promise<Response>(() => undefined);
    const fetchSpy = vi.fn(() => previewRequest);
    vi.stubGlobal("fetch", fetchSpy);

    const file: FamilyFile = {
      id: "document-1",
      familyId: "family-1",
      uploadedBy: "member-1",
      chatId: "chat-1",
      chatTitle: "Chat",
      chatType: "direct",
      originMessageId: "message-1",
      accessScope: "chat",
      storageProvider: "local",
      originalName: "insurance.pdf",
      mimeType: "application/pdf",
      sizeBytes: 97_000,
      checksum: null,
      createdAt: "2026-09-22T00:00:00Z",
      deletedAt: null,
      isFavorite: false,
    };

    document.body.appendChild(container);
    try {
      await act(async () => {
        root.render(<DocumentAttachmentPreview accessToken="session-token" file={file} />);
      });

      const open = container.querySelector<HTMLButtonElement>(".document-preview-open");
      expect(open).not.toBeNull();

      await act(async () => {
        open?.click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      expect(document.body.textContent).toContain("Loading document…");
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/files/document-1/download"),
        expect.objectContaining({
          credentials: "include",
          headers: { Authorization: "Bearer session-token" },
        }),
      );
    } finally {
      await act(async () => root.unmount());
      container.remove();
      clearMediaBlobCache();
      vi.unstubAllGlobals();
    }
  });

  it("uses the downloaded document size when stored metadata is zero", async () => {
    const container = document.createElement("div");
    const root: Root = createRoot(container);
    vi.spyOn(filesApi, "downloadFileBlob").mockResolvedValue(new Blob(["x".repeat(2048)]));

    const file: FamilyFile = {
      id: "document-with-stale-metadata",
      familyId: "family-1",
      uploadedBy: "member-1",
      chatId: "chat-1",
      chatTitle: "Chat",
      chatType: "direct",
      originMessageId: "message-1",
      accessScope: "chat",
      storageProvider: "local",
      originalName: "signed.csv",
      mimeType: "application/pdf",
      sizeBytes: 0,
      checksum: null,
      createdAt: "2026-09-22T00:00:00Z",
      deletedAt: null,
      isFavorite: false,
    };

    document.body.appendChild(container);
    try {
      await act(async () => root.render(<DocumentAttachmentPreview accessToken="session-token" file={file} />));
      await act(async () => {
        container.querySelector<HTMLButtonElement>(".document-preview-open")?.click();
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      });

      expect(container.textContent).toContain("Spreadsheet · 2.0 KB");
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Spreadsheet · 2.0 KB");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      clearMediaBlobCache();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it("uses cookie-authenticated preview resolution when Open is pressed without an access token", async () => {
    const container = document.createElement("div");
    const root: Root = createRoot(container);
    const previewRequest = new Promise<Response>(() => undefined);
    const fetchSpy = vi.fn(() => previewRequest);
    vi.stubGlobal("fetch", fetchSpy);

    const file: FamilyFile = {
      id: "document-cookie-auth",
      familyId: "family-1",
      uploadedBy: "member-1",
      chatId: "chat-1",
      chatTitle: "Chat",
      chatType: "direct",
      originMessageId: "message-1",
      accessScope: "chat",
      storageProvider: "local",
      originalName: "insurance.pdf",
      mimeType: "application/pdf",
      sizeBytes: 97_000,
      checksum: null,
      createdAt: "2026-09-22T00:00:00Z",
      deletedAt: null,
      isFavorite: false,
    };

    document.body.appendChild(container);
    try {
      await act(async () => {
        root.render(<DocumentAttachmentPreview accessToken={null} file={file} />);
      });

      const open = container.querySelector<HTMLButtonElement>(".document-preview-open");
      expect(open).not.toBeNull();

      await act(async () => {
        open?.click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      expect(document.body.textContent).toContain("Loading document…");
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/files/document-cookie-auth/download"),
        expect.objectContaining({
          credentials: "include",
          headers: {},
        }),
      );
    } finally {
      await act(async () => root.unmount());
      container.remove();
      clearMediaBlobCache();
      vi.unstubAllGlobals();
    }
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  clearMediaBlobCache();
  vi.unstubAllGlobals();
  createCanvasMock.mockReset();
  appendCanvasDocumentUpdateMock.mockReset();
  getChatsMock.mockReset();
  navigateMock.mockReset();
});

