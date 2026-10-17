import { ArrowRight, Download, ExternalLink, LoaderCircle } from "lucide-react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { InlineDocumentPreview } from "./InlineDocumentPreview";
import { DocxDocumentPreview } from "./DocxDocumentPreview";
import {
  downloadFileBlob,
  formatFileSize,
  saveFileToDisk,
  type FamilyFile,
} from "../api/files";
import {
  applyPdfPageZoom,
  getPdfRenderLimits,
  nextPinchZoom,
  nextWheelZoom,
  touchDistance,
} from "./pdfViewerZoom";
import { detectDocumentPreviewKind, DocumentKindIcon, documentKindLabel, isMarkdownDocument, type DocumentPreviewKind } from "./documentPreviewKind";
import { useMarkdownCanvasConversion } from "./useMarkdownCanvasConversion";
import { useStrings } from "../i18n/LanguageContext";
import { PopupBackdrop, PopupCloseButton } from "./ui/Popup";

function normalizeDocumentMarkdown(source: string): string {
  return source
    .replace(/(?:&nbsp;\s*){2,}/giu, "\n")
    .replace(/\u00a0{2,}/gu, "\n")
    .replace(/!\[([^\]]*)\](?!\s*(?:\(|\[))\s*/gu, "$1\n")
    .replace(/\r\n?/gu, "\n");
}

function isSafeDocumentImageSource(source: string): boolean {
  if (!source.trim()) return false;
  try {
    const url = new URL(source, window.location.origin);
    if (url.origin === window.location.origin && ["http:", "https:"].includes(url.protocol)) return true;
    return /^data:image\/(?:png|gif|jpe?g|webp);base64,/i.test(source);
  } catch {
    return false;
  }
}

function renderDocumentMarkdown(source: string): string {
  const markdownHtml = marked.parse(normalizeDocumentMarkdown(source), { async: false });
  const sanitizedHtml = DOMPurify.sanitize(markdownHtml, {
    FORBID_ATTR: ["srcset", "style"],
    FORBID_TAGS: ["audio", "embed", "iframe", "object", "source", "style", "video"],
    USE_PROFILES: { html: true },
  });
  const template = document.createElement("template");
  template.innerHTML = sanitizedHtml;
  for (const image of Array.from(template.content.querySelectorAll<HTMLImageElement>("img"))) {
    if (!isSafeDocumentImageSource(image.getAttribute("src") || "")) {
      image.replaceWith(document.createTextNode(image.alt || ""));
    }
  }
  return template.innerHTML;
}

export { detectDocumentPreviewKind } from "./documentPreviewKind";

export type { DocumentPreviewKind } from "./documentPreviewKind";
export { getPdfRenderLimits } from "./pdfViewerZoom";

export type TablePreview = {
  sheets: Array<{ name: string; rows: string[][] }>;
  activeSheet: number;
};

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

function parseDelimitedText(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n" || (ch === "\r" && next === "\n")) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (ch === "\r") i += 1;
      continue;
    }
    if (ch === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => value.trim().length > 0));
}

async function loadTablePreview(file: FamilyFile, blob: Blob): Promise<TablePreview> {
  const ext = extensionOf(file.originalName);
  if (ext === "csv" || file.mimeType === "text/csv") {
    const text = await blob.text();
    return { sheets: [{ name: "Sheet1", rows: parseDelimitedText(text, ",") }], activeSheet: 0 };
  }
  if (ext === "tsv" || file.mimeType === "text/tab-separated-values") {
    const text = await blob.text();
    return { sheets: [{ name: "Sheet1", rows: parseDelimitedText(text, "\t") }], activeSheet: 0 };
  }

  const XLSX = await import("xlsx");
  const buffer = await blob.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const rows = (XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
    }) as unknown[][]).map((row) => row.map((cell) => String(cell ?? "")));
    return { name, rows };
  });
  return { sheets: sheets.length > 0 ? sheets : [{ name: "Sheet1", rows: [] }], activeSheet: 0 };
}

export { sanitizeDocxHtml } from "./DocxDocumentPreview";

function pdfJsAssetUrl(path: string): string {
  return new URL(`/pdfjs/${path}`, window.location.origin).toString();
}

function PdfCanvasViewer({ blob, pageLimit }: { blob: Blob; pageLimit?: number }) {
  const copy = useStrings().auditUi;
  const hostRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    zoomRef.current = zoom;
    const host = hostRef.current;
    if (host) applyPdfPageZoom(host, zoom);
  }, [zoom, pageCount]);

  useEffect(() => {
    setZoom(1);
    zoomRef.current = 1;
  }, [blob]);

  useEffect(() => {
    const gestureHost = gestureRef.current;
    if (!gestureHost) return;

    let pinch: { startDistance: number; startZoom: number } | null = null;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        pinch = {
          startDistance: touchDistance(event.touches[0], event.touches[1]),
          startZoom: zoomRef.current,
        };
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !pinch) return;
      // Prevent browser page-zoom / scroll fighting while pinching.
      event.preventDefault();
      const distance = touchDistance(event.touches[0], event.touches[1]);
      setZoom(nextPinchZoom(pinch.startZoom, pinch.startDistance, distance));
    };

    const endPinch = () => {
      pinch = null;
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) endPinch();
    };

    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      setZoom((current) => nextWheelZoom(current, event.deltaY));
    };

    gestureHost.addEventListener("touchstart", onTouchStart, { passive: true });
    gestureHost.addEventListener("touchmove", onTouchMove, { passive: false });
    gestureHost.addEventListener("touchend", onTouchEnd);
    gestureHost.addEventListener("touchcancel", endPinch);
    gestureHost.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      gestureHost.removeEventListener("touchstart", onTouchStart);
      gestureHost.removeEventListener("touchmove", onTouchMove);
      gestureHost.removeEventListener("touchend", onTouchEnd);
      gestureHost.removeEventListener("touchcancel", endPinch);
      gestureHost.removeEventListener("wheel", onWheel);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    host.replaceChildren();
    setError(null);
    setPageCount(0);

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        // Vite resolves the worker as a static asset URL via import ... ?url.
        const resolvedWorkerSrc =
          pdfWorkerSrc ||
          new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        pdfjs.GlobalWorkerOptions.workerSrc = resolvedWorkerSrc;
        // PDF.js is most reliable across desktop and mobile browsers when it
        // receives an owned byte buffer rather than a Blob/ArrayBuffer view.
        // In particular this avoids detached-buffer failures after the worker
        // takes ownership of the source data.
        const data = new Uint8Array(await blob.arrayBuffer());
        const loadingTask = pdfjs.getDocument({
          data,
          cMapUrl: pdfJsAssetUrl("cmaps/"),
          cMapPacked: true,
          standardFontDataUrl: pdfJsAssetUrl("standard_fonts/"),
        });
        const doc = await loadingTask.promise;
        if (cancelled) {
          await doc.destroy();
          return;
        }
        setPageCount(doc.numPages);
        const deviceMemory = (navigator as Navigator & { deviceMemory?: number })
          .deviceMemory;
        const isConstrainedDevice =
          /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
          (deviceMemory !== undefined && deviceMemory <= 4);
        const limits = getPdfRenderLimits(
          doc.numPages,
          window.devicePixelRatio || 1,
          isConstrainedDevice,
        );
        const maxPages = pageLimit === undefined ? limits.maxPages : Math.min(limits.maxPages, pageLimit);
        const { dpr } = limits;
        const currentZoom = zoomRef.current;
        for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
          if (cancelled) break;
          const page = await doc.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          // The host has 12px gutters on both sides. Render within its content
          // box so an unzoomed page never causes horizontal overflow.
          const cssWidth = Math.min(Math.max((host.clientWidth || 744) - 24, 1), 900);
          const scale = (cssWidth / baseViewport.width) * dpr;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.className = "document-viewer-pdf-page";
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const baseCssWidth = Math.floor(viewport.width / dpr);
          const baseCssHeight = Math.floor(viewport.height / dpr);
          canvas.dataset.baseWidth = String(baseCssWidth);
          canvas.dataset.baseHeight = String(baseCssHeight);
          canvas.style.width = `${baseCssWidth * currentZoom}px`;
          canvas.style.height = `${baseCssHeight * currentZoom}px`;
          const context = canvas.getContext("2d");
          if (!context) continue;
          await page.render({ canvasContext: context, viewport }).promise;
          if (!cancelled) host.appendChild(canvas);
        }
        if (!cancelled && doc.numPages > maxPages) {
          const note = document.createElement("p");
          note.className = "document-preview-truncated";
          note.textContent = copy.pdfTruncated(maxPages, doc.numPages);
          host.appendChild(note);
        }
        await doc.destroy();
      } catch (err) {
        console.error("Failed to render PDF preview:", err);
        if (!cancelled) setError(copy.pdfUnavailable);
      }
    })();

    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, [blob]);

  return (
    <div
      className="document-viewer-pdf-host"
      ref={gestureRef}
      data-pdf-zoom={zoom.toFixed(2)}
    >
      {error && (
        <div className="document-preview-error" role="alert">
          {error}
        </div>
      )}
      <div ref={hostRef} className="document-viewer-pdf-pages" data-page-count={pageCount} />
    </div>
  );
}

/** Compact attachment card — opens a full viewer on demand. */
export function DocumentAttachmentPreview({
  accessToken,
  file,
  hideActions = false,
  inlinePreview = false,
}: {
  accessToken: string | null;
  file: FamilyFile;
  hideActions?: boolean; inlinePreview?: boolean;
}) {
  const copy = useStrings().auditUi;
  const kind = useMemo(() => detectDocumentPreviewKind(file), [file]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [resolvedSizeBytes, setResolvedSizeBytes] = useState<number | null>(null);

  useEffect(() => {
    setResolvedSizeBytes(null);
  }, [file.id]);

  if (kind === "unsupported") {
    return null;
  }

  return (
    <>
      <article
        className={`document-preview-card document-preview-card--compact${inlinePreview ? " document-preview-card--inline" : ""}`}
        data-preview-kind={kind}
        onClick={() => setViewerOpen(true)}
      >
        {!(inlinePreview && hideActions) && (
          <header className="document-preview-header">
            <DocumentKindIcon kind={kind} />
            <div className="document-preview-copy">
              <strong title={file.originalName}>{file.originalName}</strong>
              <span>
                {documentKindLabel(kind)} · {formatFileSize(resolvedSizeBytes ?? file.sizeBytes)}
              </span>
            </div>
            {!hideActions && (
              <div className="document-preview-actions">
                <button
                  type="button"
                  className="document-preview-open"
                  aria-label={copy.openFile(file.originalName)}
                  title={copy.open}
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewerOpen(true);
                  }}
                >
                  <ExternalLink size={16} aria-hidden="true" />
                </button>
                {accessToken && (
                  <button
                    type="button"
                    className="document-preview-save"
                    aria-label={copy.saveFile(file.originalName)}
                    title={copy.save}
                    onClick={(e) => {
                      e.stopPropagation();
                      void saveFileToDisk(accessToken, file);
                    }}
                  >
                    <Download size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </header>
        )}
        {inlinePreview && (
          <InlineDocumentPreview
            accessToken={accessToken ?? ""}
            file={file}
            kind={kind}
            onResolvedSize={setResolvedSizeBytes}
            loadTablePreview={loadTablePreview}
            renderPdf={(blob) => <PdfCanvasViewer blob={blob} pageLimit={1} />}
            renderDocx={(blob) => (
              <div className="document-inline-preview-docx">
                <DocxDocumentPreview blob={blob} fitToWidth />
              </div>
            )}
          />
        )}
      </article>
      {viewerOpen && (
        <DocumentViewerModal
          accessToken={accessToken ?? ""}
          file={file}
          kind={kind}
          resolvedSizeBytes={resolvedSizeBytes}
          onResolvedSize={setResolvedSizeBytes}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  );
}

export function DocumentViewerModal({
  accessToken,
  file,
  kind,
  resolvedSizeBytes,
  onResolvedSize,
  onClose,
}: {
  accessToken: string;
  file: FamilyFile;
  kind: DocumentPreviewKind;
  resolvedSizeBytes: number | null;
  onResolvedSize: (sizeBytes: number) => void;
  onClose: () => void;
}) {
  const copy = useStrings().auditUi;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [table, setTable] = useState<TablePreview | null>(null);
  const isMarkdown = isMarkdownDocument(file);
  const {
    isConverting, isLoadingChatChoices, conversionError, createdCanvasId,
    chatChoices, chosenChatId, setChosenChatId, convertToCanvas, openCreatedCanvas,
  } = useMarkdownCanvasConversion({ accessToken, file, markdown: isMarkdown ? textContent : null });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfBlob(null);
    setDocxBlob(null);
    setTextContent(null);
    setTable(null);

    void downloadFileBlob(accessToken, file.id)
      .then(async (blob) => {
        if (cancelled) return;
        onResolvedSize(blob.size);
        if (kind === "pdf") {
          setPdfBlob(
            blob.type === "application/pdf"
              ? blob
              : new Blob([blob], { type: "application/pdf" }),
          );
          return;
        }
        if (kind === "docx") {
          setDocxBlob(blob);
          return;
        }
        if (kind === "text") {
          setTextContent(await (isMarkdownDocument(file) ? blob : blob.slice(0, 100_000)).text());
          return;
        }
        setTable(await loadTablePreview(file, blob));
      })
      .catch(() => {
        if (!cancelled) setError(copy.documentLoadFailed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, file, kind, onResolvedSize]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const activeSheet = table?.sheets[table.activeSheet];

  return createPortal(
    <PopupBackdrop className="document-viewer-backdrop" onClick={onClose}>
      <div
        className={`document-viewer-modal document-viewer-modal--${kind}`}
        role="dialog"
        aria-modal="true"
        aria-label={file.originalName}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="document-viewer-header">
          <div className="document-viewer-title">
            <DocumentKindIcon kind={kind} />
            <div>
              <strong title={file.originalName}>{file.originalName}</strong>
              <span>
                {documentKindLabel(kind)} · {formatFileSize(resolvedSizeBytes ?? file.sizeBytes)}
              </span>
            </div>
          </div>
          <div className="document-viewer-header-actions">
            {isMarkdown && (
              <button
                type="button"
                className="document-viewer-convert-canvas"
                disabled={!accessToken || loading || textContent === null || isConverting || isLoadingChatChoices || Boolean(createdCanvasId) || (!file.chatId && Boolean(chatChoices?.length) && !chosenChatId)}
                onClick={() => void convertToCanvas()}
              >
                {isConverting ? copy.converting : isLoadingChatChoices ? copy.loadingChats : !file.chatId && !chosenChatId ? copy.chooseChat : copy.convertCanvas}
                {!isConverting && !isLoadingChatChoices && <ArrowRight size={15} aria-hidden="true" />}
              </button>
            )}
            <button type="button" onClick={() => void saveFileToDisk(accessToken, file)}>{copy.save}</button>
            <PopupCloseButton className="document-viewer-close" ariaLabel={copy.close} onClick={onClose} />
          </div>
        </header>

        <div className="document-viewer-body">
          {!loading && !error && isMarkdown && chatChoices && !file.chatId && (
            <label className="document-viewer-canvas-chat-picker">
              <span>{copy.saveCanvasInChat}</span>
              <select className="document-viewer-canvas-chat" value={chosenChatId} onChange={(event) => setChosenChatId(event.target.value)}>
                <option value="">{copy.selectChat}</option>
                {chatChoices.map((chat) => <option key={chat.id} value={chat.id}>{chat.title || copy.untitledChat}</option>)}
              </select>
            </label>
          )}
          {loading && (
            <div className="document-preview-status" role="status">
              <LoaderCircle size={18} className="document-preview-spinner" aria-hidden="true" />
              {copy.loadingDocument}
            </div>
          )}
          {error && (
            <div className="document-preview-error" role="alert">
              {error}
            </div>
          )}

          {!loading && !error && kind === "pdf" && pdfBlob && <PdfCanvasViewer blob={pdfBlob} />}

          {!loading && !error && kind === "docx" && docxBlob && <DocxDocumentPreview blob={docxBlob} />}

          {!loading && !error && conversionError && (
            <div className="document-preview-error" role="alert">
              {conversionError}
              {createdCanvasId && <button type="button" onClick={openCreatedCanvas}>{copy.openCanvas}</button>}
            </div>
          )}

          {!loading && !error && kind === "text" && textContent !== null && isMarkdown && (
            <article className="document-viewer-markdown" dangerouslySetInnerHTML={{ __html: renderDocumentMarkdown(textContent || copy.emptyDocument) }} />
          )}

          {!loading && !error && kind === "text" && textContent !== null && !isMarkdown && (
            <pre className="document-viewer-text">{textContent || copy.emptyDocument}</pre>
          )}

          {!loading && !error && kind === "table" && table && activeSheet && (
            <div className="document-preview-table-wrap document-viewer-table-wrap">
              {table.sheets.length > 1 && (
                <div className="document-preview-sheet-tabs" role="tablist" aria-label={copy.sheets}>
                  {table.sheets.map((sheet, index) => (
                    <button
                      key={sheet.name}
                      type="button"
                      role="tab"
                      aria-selected={index === table.activeSheet}
                      className={index === table.activeSheet ? "is-active" : ""}
                      onClick={() => setTable({ ...table, activeSheet: index })}
                    >
                      {sheet.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="document-preview-table-scroll">
                <table className="document-preview-table">
                  <tbody>
                    {activeSheet.rows.map((row, rowIndex) => (
                      <tr key={`r-${rowIndex}`}>
                        {row.map((cell, cellIndex) => {
                          const Tag = rowIndex === 0 ? "th" : "td";
                          return <Tag key={`c-${cellIndex}`}>{cell}</Tag>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </PopupBackdrop>,
    document.body,
  );
}
