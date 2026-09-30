/**
 * MeetingIntelligencePopover — Pattern A Intelligence Control Popover.
 *
 * Houses the three core meeting capabilities:
 *  1. AI Notes (start/stop, status chip, view notes)
 *  2. Meeting Recording (record/stop, REC timer, uploading badge)
 *  3. Live Captions & Real-Time AI Translation (toggle, target language dropdown/pills)
 */
import React, { useEffect, useRef } from "react";
import { Circle, FileText, Globe, LoaderCircle, Sparkles, Square, Video } from "lucide-react";
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
  // Orientation / Viewport
  isMobile?: boolean;
};

/** A transient, call-level confirmation for work that continues server-side. */
export function MeetingBackgroundToast({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="meeting-intel-background-toast" role="status" aria-live="polite">
      <span className="meeting-intel-background-toast-icon"><Sparkles size={17} aria-hidden="true" /></span>
      <span><strong>AI Notes are being prepared</strong><small>They’ll appear in this chat once ready.</small></span>
    </div>
  );
}

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
          <img src="/stovo-brain-color.svg" width={20} height={20} className="meeting-intel-logo" alt="" />
          <div className="meeting-intel-title-copy">
            <span className="meeting-intel-name">Stovo Intelligence</span>
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
                  aria-label={isNotesActive ? "Stop AI Notes" : isNotesProcessing ? "AI Notes processing" : "Start AI Notes"}
                >
                  {isNotesActive ? <Square size={13} fill="currentColor" aria-hidden="true" /> : isNotesProcessing ? <LoaderCircle size={16} aria-hidden="true" /> : <Circle size={14} fill="currentColor" aria-hidden="true" />}
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
              {isRecActive && <span className="meeting-intel-rec-timer">REC {recordingTimer}</span>}
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
                  aria-label={isRecActive ? "Stop Recording" : isRecStopping ? "Saving recording" : "Start Recording"}
                >
                  {isRecActive ? <Square size={13} fill="currentColor" aria-hidden="true" /> : isRecStopping ? <LoaderCircle size={16} aria-hidden="true" /> : <Circle size={14} fill="currentColor" aria-hidden="true" />}
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

        {/* Live captions stay in their recognized source language. Translation is a locked Premium feature. */}
        <div className="meeting-intel-card">
          <div className="meeting-intel-card-head">
            <div className="meeting-intel-card-icon meeting-intel-card-icon--captions">
              <Globe size={18} />
            </div>
            <div className="meeting-intel-card-info">
              <div className="meeting-intel-card-title">Live Captions</div>
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

          <div className="meeting-intel-card-subbar meeting-intel-premium-lock">
            <span>Caption translation</span>
            <span className="meeting-intel-restricted-badge" aria-label="Premium feature">Premium</span>
          </div>
        </div>
      </div>
    </div>
  );
}
export default MeetingIntelligencePopover;
