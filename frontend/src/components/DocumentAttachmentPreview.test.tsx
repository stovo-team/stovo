import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

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
const { renderDocxMock } = vi.hoisted(() => ({ renderDocxMock: vi.fn() }));

vi.mock("docx-preview", () => ({ renderAsync: renderDocxMock }), { virtual: true });

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

  it("detects text and Markdown documents from extension or MIME type", async () => {
    const { detectDocumentPreviewKind } = await import("./DocumentAttachmentPreview");
    expect(detectDocumentPreviewKind({ ...baseFile, originalName: "notes.txt", mimeType: "text/plain" })).toBe("text");
    expect(detectDocumentPreviewKind({ ...baseFile, originalName: "notes.md", mimeType: "text/markdown" })).toBe("text");
    expect(detectDocumentPreviewKind({ ...baseFile, originalName: "README", mimeType: "text/markdown" })).toBe("text");
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
  it("renders plain text and Markdown contents inline as text", async () => {
    const container = document.createElement("div");
    const root: Root = createRoot(container);
    vi.spyOn(filesApi, "downloadFileBlob").mockResolvedValue(new Blob(["# Agenda\nBring <notes> & questions"], { type: "text/markdown" }));
    const file: FamilyFile = {
      id: "inline-markdown-1",
      familyId: "family-1",
      uploadedBy: "member-1",
      chatId: "chat-1",
      chatTitle: "Chat",
      chatType: "direct",
      originMessageId: "message-1",
      accessScope: "chat",
      storageProvider: "local",
      originalName: "agenda.md",
      mimeType: "text/markdown",
      sizeBytes: 34,
      checksum: null,
      createdAt: "2026-09-22T00:00:00Z",
      deletedAt: null,
      isFavorite: false,
    };
    document.body.appendChild(container);
    try {
      await act(async () => {
        root.render(<DocumentAttachmentPreview accessToken="session-token" file={file} inlinePreview />);
      });
      expect(container.querySelector(".document-preview-text")?.textContent).toBe("# Agenda\nBring <notes> & questions");
      expect(container.querySelector(".document-preview-text")?.querySelector("img, a, script")).toBeNull();
      expect(container.querySelector(".document-preview-open")).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      clearMediaBlobCache();
      vi.restoreAllMocks();
    }
  });

  it("shows an inline preview in chat while keeping the full viewer available", async () => {
    const container = document.createElement("div");
    const root: Root = createRoot(container);
    vi.spyOn(filesApi, "downloadFileBlob").mockReturnValue(new Promise(() => undefined));
    const file: FamilyFile = {
      id: "inline-document-1",
      familyId: "family-1",
      uploadedBy: "member-1",
      chatId: "chat-1",
      chatTitle: "Chat",
      chatType: "direct",
      originMessageId: "message-1",
      accessScope: "chat",
      storageProvider: "local",
      originalName: "agenda.pdf",
      mimeType: "application/pdf",
      sizeBytes: 120_000,
      checksum: null,
      createdAt: "2026-09-22T00:00:00Z",
      deletedAt: null,
      isFavorite: false,
    };

    document.body.appendChild(container);
    try {
      await act(async () => {
        root.render(<DocumentAttachmentPreview accessToken="session-token" file={file} inlinePreview />);
      });

      expect(container.querySelector(".document-inline-preview")).not.toBeNull();
      expect(container.textContent).toContain("Loading preview…");
      expect(container.querySelector(".document-preview-open")).not.toBeNull();
      expect(filesApi.downloadFileBlob).toHaveBeenCalledWith("session-token", "inline-document-1");
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      clearMediaBlobCache();
      vi.restoreAllMocks();
    }
  });

  it("keeps the document open action available when an inline preview fails", async () => {
    const container = document.createElement("div");
    const root: Root = createRoot(container);
    vi.spyOn(filesApi, "downloadFileBlob").mockRejectedValue(new Error("offline"));
    const file: FamilyFile = {
      id: "unavailable-inline-document",
      familyId: "family-1",
      uploadedBy: "member-1",
      chatId: "chat-1",
      chatTitle: "Chat",
      chatType: "direct",
      originMessageId: "message-1",
      accessScope: "chat",
      storageProvider: "local",
      originalName: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 120_000,
      checksum: null,
      createdAt: "2026-09-22T00:00:00Z",
      deletedAt: null,
      isFavorite: false,
    };

    document.body.appendChild(container);
    try {
      await act(async () => {
        root.render(<DocumentAttachmentPreview accessToken="session-token" file={file} inlinePreview />);
      });

      expect(container.textContent).toContain("Preview couldn’t load.");
      expect(container.querySelector(".document-preview-open")).not.toBeNull();
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      clearMediaBlobCache();
      vi.restoreAllMocks();
    }
  });

  it("renders DOCX page formatting and inline emphasis from the source document", async () => {
    const container = document.createElement("div");
    const root: Root = createRoot(container);
    const blob = new Blob(["docx bytes"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    vi.spyOn(filesApi, "downloadFileBlob").mockResolvedValue(blob);
    renderDocxMock.mockImplementation(async (_data: Blob, body: HTMLElement) => {
      const page = document.createElement("section");
      page.className = "docx-page";
      page.innerHTML = '<h1 style="font-size: 28pt">PROFESSIONAL SUMMARY</h1><p><strong>Backend developer</strong> with experience.</p><ul><li>Production APIs</li></ul><a href="javascript:alert(1)">unsafe link</a><a href="https://example.com/resume">safe link</a>';
      body.appendChild(page);
    });

    document.body.appendChild(container);
    try {
      await act(async () => {
        root.render(
          <DocumentAttachmentPreview
            accessToken="session-token"
            file={{
              id: "formatted-docx",
              familyId: "family-1",
              uploadedBy: "member-1",
              chatId: "chat-1",
              chatTitle: "Chat",
              chatType: "direct",
              originMessageId: "message-1",
              accessScope: "chat",
              storageProvider: "local",
              originalName: "resume.docx",
              mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              sizeBytes: blob.size,
              checksum: null,
              createdAt: "2026-09-22T00:00:00Z",
              deletedAt: null,
              isFavorite: false,
          }}
          />,
        );
      });
      await act(async () => {
        container.querySelector<HTMLButtonElement>(".document-preview-open")?.click();
        await new Promise((resolve) => window.setTimeout(resolve, 20));
      });

      const docxPreview = document.querySelector<HTMLElement>(".document-viewer-docx");
      expect(docxPreview?.querySelector("h1")?.style.fontSize).toBe("28pt");
      expect(docxPreview?.querySelector("strong")?.textContent).toBe("Backend developer");
      expect(docxPreview?.querySelector("ul li")?.textContent).toBe("Production APIs");
      expect(docxPreview?.querySelector("a")?.hasAttribute("href")).toBe(false);
      expect(docxPreview?.querySelectorAll("a")[1]?.getAttribute("href")).toBe("https://example.com/resume");
      expect(renderDocxMock).toHaveBeenCalledOnce();
      expect(renderDocxMock).toHaveBeenCalledWith(
        blob,
        expect.any(HTMLElement),
        expect.any(HTMLElement),
        expect.objectContaining({ renderAltChunks: false, useBase64URL: true }),
      );
      expect(renderDocxMock.mock.calls[0]?.[1]).not.toBe(docxPreview);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      clearMediaBlobCache();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
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
});

