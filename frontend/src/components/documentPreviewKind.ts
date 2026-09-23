import type { FamilyFile } from "../api/files";

export type DocumentPreviewKind = "pdf" | "docx" | "table" | "text" | "unsupported";

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
  if (["csv", "tsv", "xlsx", "xls"].includes(ext)) return "table";
  if (["txt", "md", "markdown"].includes(ext)) return "text";
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
