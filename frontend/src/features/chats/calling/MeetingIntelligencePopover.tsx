/**
 * MeetingIntelligencePopover — Pattern A Intelligence Control Popover.
 *
 * Houses the three core meeting capabilities:
 *  1. AI Notes (start/stop, status chip, view notes)
 *  2. Meeting Recording (record/stop, REC timer, uploading badge)
 *  3. Live Captions, disabled as a Premium feature
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Circle, FileText, Globe, Sparkles, Square, Video } from "lucide-react";
import type { RecordingState } from "./useCallRecording";
import type { TranscriptState } from "./useTranscription";

export type MeetingIntelligencePopoverProps = {
  isOpen: boolean;
  onClose: () => void;
  anchorElement?: HTMLElement | null;
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
  inlineMenu?: boolean;
};

/** A transient, call-level confirmation for work that continues server-side. */
export function MeetingBackgroundToast({ message, onDismiss }: { message: string | null; onDismiss: (message: null) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDismiss(null);
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  if (!visible || !message) return null;
  return (
    <div className="meeting-intel-background-toast" role="status" aria-live="polite">
      <span className="meeting-intel-background-toast-icon"><Sparkles size={17} aria-hidden="true" /></span>
      <span><strong>{message}</strong><small>The result will appear in this chat when ready.</small></span>
    </div>
  );
}

export function MeetingIntelligencePopover({
  isOpen,
  onClose,
  anchorElement,
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
  isMobile = false,
  inlineMenu = false,
}: MeetingIntelligencePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const [anchoredPosition, setAnchoredPosition] = useState<{ left: number; top: number } | null>(null);
  const [backgroundToastMessage, setBackgroundToastMessage] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(!inlineMenu);
  const backgroundToast = <MeetingBackgroundToast message={backgroundToastMessage} onDismiss={setBackgroundToastMessage} />;

  const handleToggleNotes = () => {
    if (notesState === "recording") {
      setBackgroundToastMessage("AI Notes are being prepared");
      onClose();
    }
    onToggleNotes();
  };

  const handleToggleRecording = () => {
    if (recordingState === "recording") {
      setBackgroundToastMessage("Recording is being processed");
      onClose();
    }
    onToggleRecording();
  };

  useLayoutEffect(() => {
    if (!isOpen || inlineMenu) {
      setAnchoredPosition(null);
      return;
    }

    const placePopover = () => {
      const popover = popoverRef.current;
      const anchorContainer = popover?.closest<HTMLElement>(".call-ctrl-wrap, .voice-more-menu-anchor");
      const anchor = anchorElement ?? anchorRef.current ??
        anchorContainer?.querySelector<HTMLElement>(":scope > button") ??
        popover?.parentElement;
      if (!popover || !anchor) return;
      anchorRef.current = anchor;

      const anchorRect = anchor.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
      const gutter = 16;
      const width = popoverRect.width || Math.min(336, Math.max(0, viewportWidth - gutter * 2));
      const height = popoverRect.height || 300;
      const maxLeft = Math.max(gutter, viewportWidth - width - gutter);
      const left = Math.min(maxLeft, Math.max(gutter, anchorRect.left + (anchorRect.width - width) / 2));
      const above = anchorRect.top - height - 12;
      const below = anchorRect.bottom + 12;
      const top = !isMobile
        ? Math.max(gutter, above)
        : above >= gutter
          ? above
          : Math.min(Math.max(gutter, below), Math.max(gutter, viewportHeight - height - gutter));

      setAnchoredPosition((previous) => previous?.left === left && previous.top === top ? previous : { left, top });
    };

    placePopover();
    window.addEventListener("resize", placePopover);
    window.addEventListener("scroll", placePopover, true);
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(placePopover) : null;
    if (popoverRef.current) resizeObserver?.observe(popoverRef.current);
    if (anchorRef.current) resizeObserver?.observe(anchorRef.current);

    return () => {
      window.removeEventListener("resize", placePopover);
      window.removeEventListener("scroll", placePopover, true);
      resizeObserver?.disconnect();
    };
  }, [anchorElement, inlineMenu, isMobile, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (inlineMenu) return;
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

  if (!isOpen) return backgroundToast;

  const isNotesActive = notesState === "recording" || notesState === "starting";
  const isNotesProcessing = notesState === "stopping" || notesState === "processing";
  const isNotesReady = notesState === "ready";

  const isRecActive = recordingState === "recording" || recordingState === "starting";
  const isRecStopping = recordingState === "stopping" || recordingState === "uploading";

  const popover = (
    <div
      ref={popoverRef}
      className={`meeting-intel-popover ${isMobile ? "meeting-intel-popover--mobile" : ""}${inlineMenu ? " meeting-intel-popover--inline-menu" : ""}${anchoredPosition ? " meeting-intel-popover--anchored" : ""}`}
      style={anchoredPosition ? { position: "fixed", left: anchoredPosition.left, top: anchoredPosition.top, transform: "none" } : undefined}
      role={inlineMenu ? "group" : "dialog"}
      aria-label={inlineMenu ? "Meeting features" : "Meeting Intelligence Controls"}
    >
      {/* Header */}
      <div className="meeting-intel-header">
        {inlineMenu ? (
        <button type="button" className="meeting-intel-inline-toggle" aria-label="Stovo Intelligence" aria-expanded={isExpanded} onClick={() => setIsExpanded((expanded) => !expanded)}>
          <img src="/stovo-brain-color.svg" width={20} height={20} className="meeting-intel-logo" alt="" />
          <span className="meeting-intel-name">Stovo Intelligence</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        ) : (
        <div className="meeting-intel-title-row">
          <img src="/stovo-brain-color.svg" width={20} height={20} className="meeting-intel-logo" alt="" />
          <div className="meeting-intel-title-copy">
            <span className="meeting-intel-name">Stovo Intelligence</span>
          </div>
        </div>
        )}
      </div>

      {isExpanded && <div className="meeting-intel-content">
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
                  onClick={handleToggleNotes}
                  disabled={isNotesProcessing}
                  aria-label={isNotesActive ? "Stop AI Notes" : isNotesProcessing ? "AI Notes processing" : "Start AI Notes"}
                >
                  {isNotesActive ? <Square size={14} fill="currentColor" aria-hidden="true" /> : isNotesProcessing ? <Check size={16} aria-hidden="true" /> : <Circle size={17} fill="currentColor" aria-hidden="true" />}
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
                  onClick={handleToggleRecording}
                  disabled={isRecStopping}
                  aria-label={isRecActive ? "Stop Recording" : isRecStopping ? "Saving recording" : "Start Recording"}
                >
                  {isRecActive ? <Square size={14} fill="currentColor" aria-hidden="true" /> : isRecStopping ? <Check size={16} aria-hidden="true" /> : <Circle size={17} fill="currentColor" aria-hidden="true" />}
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

        {/* Live Captions are currently unavailable as a Premium feature. */}
        <div className="meeting-intel-card" aria-disabled="true">
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
                  defaultChecked={false}
                  disabled
                  aria-label="Live Captions unavailable"
                />
                <span className="meeting-intel-switch-slider" />
              </label>
              <span className="meeting-intel-restricted-badge" aria-label="Premium feature">Premium</span>
            </div>
          </div>
        </div>
      </div>}
    </div>
  );

  return (
    <>
      {backgroundToast}
      {anchoredPosition && !inlineMenu ? createPortal(popover, document.body) : popover}
    </>
  );
}
export default MeetingIntelligencePopover;
