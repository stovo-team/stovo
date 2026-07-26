import { FileSpreadsheet, FileText, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { downloadFileBlob, formatFileSize, saveFileToDisk, type FamilyFile } from "../api/files";

type PreviewKind = "docx" | "table" | "unsupported";

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

export function detectDocumentPreviewKind(file: FamilyFile): PreviewKind {
  const ext = extensionOf(file.originalName);
  const mime = file.mimeType.toLowerCase();
  if (
    mime.includes("wordprocessingml") ||
    ext === "docx"
  ) {
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
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  const html = (result.value || "<p>(Empty document)</p>")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return { html };
}

export function DocumentAttachmentPreview({
  accessToken,
  file,
}: {
  accessToken: string | null;
  file: FamilyFile;
}) {
  const kind = useMemo(() => detectDocumentPreviewKind(file), [file]);
  const [loading, setLoading] = useState(kind !== "unsupported");
  const [error, setError] = useState<string | null>(null);
  const [docx, setDocx] = useState<DocxPreview | null>(null);
  const [table, setTable] = useState<TablePreview | null>(null);

  useEffect(() => {
    if (!accessToken || kind === "unsupported") {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDocx(null);
    setTable(null);
    void downloadFileBlob(accessToken, file.id)
      .then(async (blob) => {
        if (cancelled) return;
        if (kind === "docx") {
          setDocx(await loadDocxPreview(blob));
        } else {
          setTable(await loadTablePreview(file, blob));
        }
      })
      .catch(() => {
        if (!cancelled) setError("Preview couldn’t load.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, file, kind]);

  const activeSheet = table?.sheets[table.activeSheet];

  return (
    <article className="document-preview-card" data-preview-kind={kind}>
      <header className="document-preview-header">
        {kind === "table" ? <FileSpreadsheet size={18} aria-hidden="true" /> : <FileText size={18} aria-hidden="true" />}
        <div className="document-preview-copy">
          <strong title={file.originalName}>{file.originalName}</strong>
          <span>{file.mimeType} / {formatFileSize(file.sizeBytes)}</span>
        </div>
        {accessToken && (
          <button type="button" className="document-preview-save" onClick={() => void saveFileToDisk(accessToken, file)}>
            Save
          </button>
        )}
      </header>

      {loading && (
        <div className="document-preview-status" role="status">
          <LoaderCircle size={16} className="document-preview-spinner" aria-hidden="true" />
          Loading preview…
        </div>
      )}
      {error && <div className="document-preview-error" role="alert">{error}</div>}

      {!loading && !error && kind === "docx" && docx && (
        <div
          className="document-preview-docx"
          dangerouslySetInnerHTML={{ __html: docx.html }}
        />
      )}

      {!loading && !error && kind === "table" && table && activeSheet && (
        <div className="document-preview-table-wrap">
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
                {activeSheet.rows.slice(0, 40).map((row, rowIndex) => (
                  <tr key={`r-${rowIndex}`}>
                    {row.slice(0, 20).map((cell, cellIndex) => {
                      const Tag = rowIndex === 0 ? "th" : "td";
                      return <Tag key={`c-${cellIndex}`}>{cell}</Tag>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {(activeSheet.rows.length > 40 || (activeSheet.rows[0]?.length ?? 0) > 20) && (
              <p className="document-preview-truncated">Showing first 40×20 cells. Save the file for the full sheet.</p>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
