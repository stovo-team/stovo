/**
 * TranscriptPanel — displays the full AI call transcript with segments and summary.
 *
 * Appears as an overlay panel on the call UI. Only shown when
 * `isTranscriptPanelOpen` is true from useTranscription.
 */
import { X, FileText, CheckSquare, HelpCircle, Lightbulb, Download } from "lucide-react";
import type { TranscriptData, TranscriptSegment } from "./useTranscription";
import { useStrings } from "../../../i18n/LanguageContext";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function exportVTT(segments: TranscriptSegment[]): void {
  let vtt = "WEBVTT\n\n";
  segments.forEach((seg, i) => {
    vtt += `${i + 1}\n`;
    vtt += `${formatVTTTime(seg.startMs)} --> ${formatVTTTime(seg.endMs)}\n`;
    const text = seg.cleanedText ?? seg.exactText;
    vtt += `<${seg.participantName}> ${text}\n\n`;
  });
  const blob = new Blob([vtt], { type: "text/vtt" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "call-transcript.vtt";
  a.click();
  URL.revokeObjectURL(url);
}

function formatVTTTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const millis = ms % 1000;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

type TranscriptPanelProps = {
  data: TranscriptData | null;
  isLoading: boolean;
  onClose: () => void;
};

export function TranscriptPanel({ data, isLoading, onClose }: TranscriptPanelProps) {
  const copy = useStrings().auditUi;
  return (
    <div
      className="transcript-panel"
      role="dialog"
      aria-label={copy.transcriptTitle}
      aria-modal="false"
    >
      {/* Header */}
      <div className="transcript-panel__header">
        <div className="transcript-panel__title">
          <FileText size={16} aria-hidden />
          <span>{copy.aiTranscript}</span>
        </div>
        <div className="transcript-panel__header-actions">
          {data && data.segments.length > 0 && (
            <button
              type="button"
              className="transcript-panel__icon-btn"
              title={copy.exportVtt}
              aria-label={copy.exportTranscriptVtt}
              onClick={() => exportVTT(data.segments)}
            >
              <Download size={15} aria-hidden />
            </button>
          )}
          <button
            type="button"
            className="transcript-panel__icon-btn"
            title={copy.closeTranscript}
            aria-label={copy.closeTranscriptPanel}
            onClick={onClose}
          >
            <X size={15} aria-hidden />
          </button>
        </div>
      </div>

      <div className="transcript-panel__body">
        {isLoading && (
          <div className="transcript-panel__empty">
            <div className="transcript-panel__spinner" aria-label={copy.loadingTranscript} />
            <p>{copy.processingTranscript}</p>
          </div>
        )}

        {!isLoading && !data && (
          <div className="transcript-panel__empty">
            <FileText size={28} aria-hidden />
            <p>{copy.noTranscript}</p>
          </div>
        )}

        {!isLoading && data && (
          <>
            {/* Summary */}
            {data.summary && data.summary.summary && (
              <section className="transcript-panel__section">
                <h3 className="transcript-panel__section-title">
                  <Lightbulb size={14} aria-hidden />{copy.summary}</h3>
                <p className="transcript-panel__summary-text">{data.summary.summary}</p>
              </section>
            )}

            {/* Action items */}
            {data.summary && data.summary.actionItems.length > 0 && (
              <section className="transcript-panel__section">
                <h3 className="transcript-panel__section-title">
                  <CheckSquare size={14} aria-hidden />{copy.actionItems}</h3>
                <ul className="transcript-panel__list">
                  {data.summary.actionItems.map((item, i) => (
                    <li key={i} className="transcript-panel__list-item">
                      {item.text}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Open questions */}
            {data.summary && data.summary.openQuestions.length > 0 && (
              <section className="transcript-panel__section">
                <h3 className="transcript-panel__section-title">
                  <HelpCircle size={14} aria-hidden />{copy.openQuestions}</h3>
                <ul className="transcript-panel__list">
                  {data.summary.openQuestions.map((q, i) => (
                    <li key={i} className="transcript-panel__list-item">
                      {q.text}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Transcript segments */}
            {data.segments.length > 0 ? (
              <section className="transcript-panel__section">
                <h3 className="transcript-panel__section-title">
                  <FileText size={14} aria-hidden />{copy.fullTranscript}</h3>
                <div className="transcript-panel__segments">
                  {data.segments.map((seg) => (
                    <div key={seg.id} className="transcript-panel__segment">
                      <div className="transcript-panel__segment-meta">
                        <span className="transcript-panel__speaker">
                          {seg.participantName || seg.participantId}
                        </span>
                        <span className="transcript-panel__timestamp">
                          {formatMs(seg.startMs)}
                        </span>
                      </div>
                      <p className="transcript-panel__segment-text">
                        {seg.cleanedText ?? seg.exactText}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <div className="transcript-panel__empty">
                <p>{copy.noSpeechSegments}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
