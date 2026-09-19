/**
 * MeetingIntelligencePopover — Pattern A Intelligence Control Popover.
 *
 * Houses the three core meeting capabilities:
 *  1. AI Notes (start/stop, status chip, view notes)
 *  2. Meeting Recording (record/stop, REC timer, uploading badge)
 *  3. Live Captions & Real-Time AI Translation (toggle, target language dropdown/pills)
 */
import React, { useEffect, useRef } from "react";
import { ChevronDown, FileText, Globe, Radio, Sparkles, StopCircle, Video, VideoOff } from "lucide-react";
import IconIntelligence from "../../../components/icons/IconIntelligence";
import { SUPPORTED_LANGUAGES } from "./useLiveCaptions";
import type { RecordingState } from "./useCallRecording";
import type { TranscriptState } from "./useTranscription";

export type MeetingIntelligencePopoverProps = {
  isOpen: boolean;
  onClose: () => void;
  // AI Notes
  notesState: TranscriptState;
  onToggleNotes: () => void;
  isNotesAllowed?: boolean;
  notesDisabledReason?: string;
  onOpenTranscriptPanel?: () => void;
  // Recording
  recordingState: RecordingState;
  recordingTimer: string;
  onToggleRecording: () => void;
  isRecordingAllowed?: boolean;
  recordingDisabledReason?: string;
  // Live Captions
  isCaptionsEnabled: boolean;
  onToggleCaptions: () => void;
  targetLanguage: string;
  onChangeTargetLanguage: (lang: string) => void;
  // Orientation / Viewport
  isMobile?: boolean;
};

export function MeetingIntelligencePopover({
  isOpen,
  onClose,
  notesState,
  onToggleNotes,
  isNotesAllowed = true,
  notesDisabledReason,
  onOpenTranscriptPanel,
  recordingState,
  recordingTimer,
  onToggleRecording,
  isRecordingAllowed = true,
  recordingDisabledReason,
  isCaptionsEnabled,
  onToggleCaptions,
  targetLanguage,
  onChangeTargetLanguage,
  isMobile = false,
}: MeetingIntelligencePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isNotesActive = notesState === "recording" || notesState === "starting";
  const isNotesProcessing = notesState === "stopping" || notesState === "processing";
  const isNotesReady = notesState === "ready";

  const isRecActive = recordingState === "recording" || recordingState === "starting";
  const isRecStopping = recordingState === "stopping" || recordingState === "uploading";

  return (
    <div
      ref={popoverRef}
      className={`meeting-intel-popover ${isMobile ? "meeting-intel-popover--mobile" : ""}`}
      role="dialog"
      aria-label="Meeting Intelligence Controls"
    >
      {/* Header */}
      <div className="meeting-intel-header">
        <div className="meeting-intel-title-row">
          <span className="meeting-intel-logo-wrap">
            <IconIntelligence size={20} className="meeting-intel-logo" />
          </span>
          <div className="meeting-intel-title-copy">
            <span className="meeting-intel-name">Stovo Intelligence</span>
            <span className="meeting-intel-subtitle">Meeting AI & Recording</span>
          </div>
        </div>
      </div>

      <div className="meeting-intel-content">
        {/* 1. AI Notes Section */}
        <div className={`meeting-intel-card ${isNotesActive ? "is-active" : ""}`}>
          <div className="meeting-intel-card-head">
            <div className="meeting-intel-card-icon meeting-intel-card-icon--notes">
              <FileText size={18} />
            </div>
            <div className="meeting-intel-card-info">
              <div className="meeting-intel-card-title">AI Notes</div>
              <div className="meeting-intel-card-desc">
                {isNotesActive
                  ? "Transcribing & summarizing call"
                  : isNotesProcessing
                  ? "Generating summary & tasks…"
                  : isNotesReady
                  ? "Summary ready to review"
                  : "Auto-generate notes & decisions"}
              </div>
            </div>
            <div className="meeting-intel-card-action">
              {isNotesAllowed ? (
                <button
                  type="button"
                  className={`meeting-intel-toggle-btn ${
                    isNotesActive ? "is-recording" : isNotesProcessing ? "is-processing" : ""
                  }`}
                  onClick={onToggleNotes}
                  disabled={isNotesProcessing}
                  aria-label={isNotesActive ? "Stop AI Notes" : "Start AI Notes"}
                >
                  {isNotesActive ? (
                    <>
                      <span className="meeting-intel-rec-dot" />
                      Stop
                    </>
                  ) : isNotesProcessing ? (
                    "Processing…"
                  ) : (
                    "Start"
                  )}
                </button>
              ) : (
                <span
                  className="meeting-intel-restricted-badge"
                  title={notesDisabledReason || "Host only"}
                >
                  Host only
                </span>
              )}
            </div>
          </div>
          {isNotesReady && onOpenTranscriptPanel && (
            <div className="meeting-intel-card-subbar">
              <button
                type="button"
                className="meeting-intel-view-notes-btn"
                onClick={() => {
                  onOpenTranscriptPanel();
                  onClose();
                }}
              >
                <Sparkles size={14} />
                View Generated Notes
              </button>
            </div>
          )}
        </div>

        {/* 2. Meeting Video Recording Section */}
        <div className={`meeting-intel-card ${isRecActive ? "is-active" : ""}`}>
          <div className="meeting-intel-card-head">
            <div className="meeting-intel-card-icon meeting-intel-card-icon--video">
              <Video size={18} />
            </div>
            <div className="meeting-intel-card-info">
              <div className="meeting-intel-card-title">Video Recording</div>
              <div className="meeting-intel-card-desc">
                {isRecActive ? (
                  <span className="meeting-intel-rec-timer">
                    <span className="meeting-intel-rec-dot" />
                    REC {recordingTimer}
                  </span>
                ) : isRecStopping ? (
                  "Saving video to chat…"
                ) : (
                  "Record video & save to chat"
                )}
              </div>
            </div>
            <div className="meeting-intel-card-action">
              {isRecordingAllowed ? (
                <button
                  type="button"
                  className={`meeting-intel-toggle-btn ${
                    isRecActive ? "is-recording" : isRecStopping ? "is-processing" : ""
                  }`}
                  onClick={onToggleRecording}
                  disabled={isRecStopping}
                  aria-label={isRecActive ? "Stop Recording" : "Start Recording"}
                >
                  {isRecActive ? (
                    <>
                      <StopCircle size={14} />
                      Stop
                    </>
                  ) : isRecStopping ? (
                    "Saving…"
                  ) : (
                    "Record"
                  )}
                </button>
              ) : (
                <span
                  className="meeting-intel-restricted-badge"
                  title={recordingDisabledReason || "Host only"}
                >
                  Host only
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 3. Live Captions & Real-Time AI Translation Section */}
        <div className={`meeting-intel-card ${isCaptionsEnabled ? "is-active" : ""}`}>
          <div className="meeting-intel-card-head">
            <div className="meeting-intel-card-icon meeting-intel-card-icon--captions">
              <Globe size={18} />
            </div>
            <div className="meeting-intel-card-info">
              <div className="meeting-intel-card-title">Live Captions & AI Translation</div>
              <div className="meeting-intel-card-desc">
                {isCaptionsEnabled ? "Subtitles translated in real time" : "Real-time translated subtitles"}
              </div>
            </div>
            <div className="meeting-intel-card-action">
              <label className="meeting-intel-switch">
                <input
                  type="checkbox"
                  checked={isCaptionsEnabled}
                  onChange={onToggleCaptions}
                  aria-label="Toggle Live Captions"
                />
                <span className="meeting-intel-switch-slider" />
              </label>
            </div>
          </div>

          {isCaptionsEnabled && (
            <div className="meeting-intel-card-lang-selector">
              <div className="meeting-intel-lang-label">
                <span>Translate to:</span>
              </div>
              <div className="meeting-intel-lang-select-wrap">
                <select
                  value={targetLanguage}
                  onChange={(e) => onChangeTargetLanguage(e.target.value)}
                  className="meeting-intel-lang-select"
                  aria-label="Select target caption language"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="meeting-intel-lang-arrow" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default MeetingIntelligencePopover;
