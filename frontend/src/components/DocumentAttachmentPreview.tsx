import {
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  downloadFileBlob,
  formatFileSize,
  saveFileToDisk,
  type FamilyFile,
} from "../api/files";

export type DocumentPreviewKind = "pdf" | "docx" | "table" | "unsupported";

type TablePreview = {
  sheets: Array<{ name: string; rows: string[][] }>;
  activeSheet: number;
};

type DocxPreview = {
  html: string;
};

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

export function detectDocumentPreviewKind(file: FamilyFile): DocumentPreviewKind {
  const ext = extensionOf(file.originalName);
  const mime = file.mimeType.toLowerCase();
  if (mime === "application/pdf" || ext === "pdf") {
    return "pdf";
  }
  if (mime.includes("wordprocessingml") || ext === "docx") {
    return "docx";
  }
  if (
    mime.includes("spreadsheetml") ||
    mime === "application/vnd.ms-excel" ||
    mime === "text/csv" ||
    mime === "text/tab-separated-values" ||
    ["csv", "tsv", "xlsx", "xls"].includes(ext)
  ) {
    return "table";
  }
  return "unsupported";
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

async function loadDocxPreview(blob: Blob): Promise<DocxPreview> {
  const mammoth = await import("mammoth");
  const buffer = await blob.arrayBuffer();
  const result = await mammoth.convertToHtml(
    { arrayBuffer: buffer },
    {
      styleMap: [
        "p[style-name='Title'] => h1.docx-title:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
        "r[style-name='Strong'] => strong",
        "p[style-name='Quote'] => blockquote:fresh",
        "table => table.docx-table:fresh",
      ],
      includeDefaultStyleMap: true,
      convertImage: mammoth.images.imgElement((image) =>
        image.read("base64").then((imageBuffer) => ({
          src: `data:${image.contentType};base64,${imageBuffer}`,
        })),
      ),
    },
  );
  const html = (result.value || "<p>(Empty document)</p>")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return { html };
}

function kindLabel(kind: DocumentPreviewKind): string {
  if (kind === "pdf") return "PDF";
  if (kind === "docx") return "Document";
  if (kind === "table") return "Spreadsheet";
  return "File";
}

function KindIcon({ kind }: { kind: DocumentPreviewKind }) {
  if (kind === "table") return <FileSpreadsheet size={18} aria-hidden="true" />;
  return <FileText size={18} aria-hidden="true" />;
}

function PdfCanvasViewer({ blob }: { blob: Blob }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);

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
        // Vite resolves the worker as a static asset URL.
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const data = await blob.arrayBuffer();
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) {
          await doc.destroy();
          return;
        }
        setPageCount(doc.numPages);
        const maxPages = Math.min(doc.numPages, 40);
        for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
          if (cancelled) break;
          const page = await doc.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const width = Math.min(host.clientWidth || 720, 900);
          const scale = width / baseViewport.width;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.className = "document-viewer-pdf-page";
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) continue;
          await page.render({ canvasContext: context, viewport }).promise;
          if (!cancelled) host.appendChild(canvas);
        }
        if (!cancelled && doc.numPages > maxPages) {
          const note = document.createElement("p");
          note.className = "document-preview-truncated";
          note.textContent = `Showing first ${maxPages} of ${doc.numPages} pages. Save the file for the full PDF.`;
          host.appendChild(note);
        }
        await doc.destroy();
      } catch {
        if (!cancelled) setError("PDF couldn’t be rendered on this device.");
      }
    })();

    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, [blob]);

  return (
    <div className="document-viewer-pdf-host">
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
}: {
  accessToken: string | null;
  file: FamilyFile;
}) {
  const kind = useMemo(() => detectDocumentPreviewKind(file), [file]);
  const [viewerOpen, setViewerOpen] = useState(false);

  if (kind === "unsupported") {
    return null;
  }

  return (
    <>
      <article className="document-preview-card document-preview-card--compact" data-preview-kind={kind}>
        <header className="document-preview-header">
          <KindIcon kind={kind} />
          <div className="document-preview-copy">
            <strong title={file.originalName}>{file.originalName}</strong>
            <span>
              {kindLabel(kind)} · {formatFileSize(file.sizeBytes)}
            </span>
          </div>
          <div className="document-preview-actions">
            <button
              type="button"
              className="document-preview-open"
              onClick={() => setViewerOpen(true)}
            >
              Open
            </button>
            {accessToken && (
              <button
                type="button"
                className="document-preview-save"
                onClick={() => void saveFileToDisk(accessToken, file)}
              >
                Save
              </button>
            )}
          </div>
        </header>
      </article>
      {viewerOpen && accessToken && (
        <DocumentViewerModal
          accessToken={accessToken}
          file={file}
          kind={kind}
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
  onClose,
}: {
  accessToken: string;
  file: FamilyFile;
  kind: DocumentPreviewKind;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [docx, setDocx] = useState<DocxPreview | null>(null);
  const [table, setTable] = useState<TablePreview | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfBlob(null);
    setDocx(null);
    setTable(null);

    void downloadFileBlob(accessToken, file.id)
      .then(async (blob) => {
        if (cancelled) return;
        if (kind === "pdf") {
          setPdfBlob(
            blob.type === "application/pdf"
              ? blob
              : new Blob([blob], { type: "application/pdf" }),
          );
          return;
        }
        if (kind === "docx") {
          setDocx(await loadDocxPreview(blob));
          return;
        }
        setTable(await loadTablePreview(file, blob));
      })
      .catch(() => {
        if (!cancelled) setError("Document couldn’t load.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, file, kind]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const activeSheet = table?.sheets[table.activeSheet];

  return createPortal(
    <div className="document-viewer-backdrop" role="presentation" onClick={onClose}>
      <div
        className="document-viewer-modal"
        role="dialog"
        aria-modal="true"
        aria-label={file.originalName}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="document-viewer-header">
          <div className="document-viewer-title">
            <KindIcon kind={kind} />
            <div>
              <strong title={file.originalName}>{file.originalName}</strong>
              <span>
                {kindLabel(kind)} · {formatFileSize(file.sizeBytes)}
              </span>
            </div>
          </div>
          <div className="document-viewer-header-actions">
            <button type="button" onClick={() => void saveFileToDisk(accessToken, file)}>
              Save
            </button>
            <button type="button" className="document-viewer-close" aria-label="Close" onClick={onClose}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="document-viewer-body">
          {loading && (
            <div className="document-preview-status" role="status">
              <LoaderCircle size={18} className="document-preview-spinner" aria-hidden="true" />
              Loading document…
            </div>
          )}
          {error && (
            <div className="document-preview-error" role="alert">
              {error}
            </div>
          )}

          {!loading && !error && kind === "pdf" && pdfBlob && <PdfCanvasViewer blob={pdfBlob} />}

          {!loading && !error && kind === "docx" && docx && (
            <div
              className="document-viewer-docx"
              dangerouslySetInnerHTML={{ __html: docx.html }}
            />
          )}

          {!loading && !error && kind === "table" && table && activeSheet && (
            <div className="document-preview-table-wrap document-viewer-table-wrap">
              {table.sheets.length > 1 && (
                <div className="document-preview-sheet-tabs" role="tablist" aria-label="Sheets">
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
    </div>,
    document.body,
  );
}
