import type { FamilyFile } from "../api/files";
import { FileSpreadsheet, FileText } from "lucide-react";
import { createElement } from "react";

export type DocumentPreviewKind = "pdf" | "docx" | "table" | "text" | "unsupported";

export function documentKindLabel(kind: DocumentPreviewKind): string {
  if (kind === "pdf") return "PDF";
  if (kind === "docx") return "Document";
  if (kind === "table") return "Spreadsheet";
  if (kind === "text") return "Text document";
  return "File";
}

export function DocumentKindIcon({ kind }: { kind: DocumentPreviewKind }) {
  if (kind === "table") return createElement(FileSpreadsheet, { size: 18, "aria-hidden": true });
  return createElement(FileText, { size: 18, "aria-hidden": true });
}

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

export function detectDocumentPreviewKind(file: FamilyFile): DocumentPreviewKind {
  const ext = extensionOf(file.originalName || "");
  const mime = (file.mimeType || "").toLowerCase();
  // The filename survives older uploads and import/copy workflows more
  // reliably than MIME metadata. When they disagree, route by a known
  // document extension so (for example) DOCX bytes are not sent to PDF.js.
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (["md", "markdown", "txt"].includes(ext)) return "text";
  if (["csv", "tsv", "xlsx", "xls"].includes(ext)) return "table";
  if (mime === "application/pdf") return "pdf";
  if (mime.includes("wordprocessingml")) return "docx";
  if (mime === "text/plain" || mime === "text/markdown") return "text";
  if (
    mime.includes("spreadsheetml") ||
    mime === "application/vnd.ms-excel" ||
    mime === "text/csv" ||
    mime === "text/tab-separated-values"
  ) {
    return "table";
  }
  return "unsupported";
}
