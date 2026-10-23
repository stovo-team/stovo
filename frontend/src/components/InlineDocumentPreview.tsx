import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { downloadFileBlob, type FamilyFile } from "../api/files";
import { documentKindLabel, isMarkdownDocument, type DocumentPreviewKind } from "./documentPreviewKind";
import type { TablePreview } from "./DocumentAttachmentPreview";
import { RichCanvasPreview } from "./RichCanvasPreview";
import { useStrings } from "../i18n/LanguageContext";

type InlineDocumentPreviewProps = {
  accessToken: string;
  file: FamilyFile;
  kind: DocumentPreviewKind;
  onResolvedSize: (sizeBytes: number) => void;
  loadTablePreview: (file: FamilyFile, blob: Blob) => Promise<TablePreview>;
  renderPdf: (blob: Blob) => ReactNode;
  renderDocx: (blob: Blob) => ReactNode;
};

export function InlineDocumentPreview({
  accessToken,
  file,
  kind,
  onResolvedSize,
  loadTablePreview,
  renderPdf,
  renderDocx,
}: InlineDocumentPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [shouldLoadPreview, setShouldLoadPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [table, setTable] = useState<TablePreview | null>(null);
  const activeSheet = table?.sheets[table.activeSheet];
  const copy = useStrings().sharedUi;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoadPreview(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldLoadPreview(true);
        observer.disconnect();
      }
    }, { rootMargin: "300px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoadPreview) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    setPdfBlob(null);
    setDocxBlob(null);
    setTextPreview(null);
    setTable(null);

    void downloadFileBlob(accessToken, file.id)
      .then(async (blob) => {
        if (cancelled) return;
        onResolvedSize(blob.size);
        if (kind === "pdf") {
          setPdfBlob(blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" }));
        } else if (kind === "docx") {
          setDocxBlob(blob);
        } else if (kind === "text") {
          const preview = await blob.text();
          if (!cancelled) setTextPreview(preview.slice(0, 8_000));
        } else {
          const preview = await loadTablePreview(file, blob);
          if (!cancelled) setTable(preview);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, file.id, file.originalName, file.mimeType, kind, loadTablePreview, onResolvedSize, shouldLoadPreview]);

  return (
    <div className="document-inline-preview" role="group" aria-label={copy.documentPreview(documentKindLabel(kind))} ref={hostRef}>
      {loading && shouldLoadPreview && (
        <div className="document-preview-status" role="status">
          <LoaderCircle size={18} className="document-preview-spinner" aria-hidden="true" />
          {copy.loadingPreview}
        </div>
      )}
      {loading && !shouldLoadPreview && <div className="document-inline-preview-placeholder" aria-hidden="true" />}
      {error && <div className="document-preview-error" role="alert">{copy.previewFailed}</div>}
      {!loading && !error && kind === "pdf" && pdfBlob && renderPdf(pdfBlob)}
      {!loading && !error && kind === "docx" && docxBlob && renderDocx(docxBlob)}
      {!loading && !error && kind === "text" && textPreview !== null && (
        isMarkdownDocument(file)
          ? <RichCanvasPreview
              canvas={{ title: file.originalName }}
              markdownContent={textPreview || "(Empty document)"}
              hideHeader
              className="document-inline-preview-canvas"
            />
          : <pre className="document-inline-preview-text">{textPreview || "(Empty document)"}</pre>
      )}
      {!loading && !error && kind === "table" && table && activeSheet && (
        <div className="document-preview-table-wrap">
          <div className="document-preview-table-scroll">
            <table className="document-preview-table">
              <tbody>
                {activeSheet.rows.slice(0, 8).map((row, rowIndex) => (
                  <tr key={`r-${rowIndex}`}>
                    {row.slice(0, 6).map((cell, cellIndex) => {
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
  );
}
