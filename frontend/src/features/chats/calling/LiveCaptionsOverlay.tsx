/**
 * LiveCaptionsOverlay — Subtitle overlay rendered over active call/meeting video.
 *
 * Shows real-time speech transcription and live translated subtitles with high
 * contrast, frosted glass backdrop, and speaker attribution.
 */
import React from "react";
import type { LiveCaptionItem } from "./useLiveCaptions";

export type LiveCaptionsOverlayProps = {
  isCaptionsEnabled: boolean;
  recentCaptions: LiveCaptionItem[];
  currentInterimCaption: string | null;
  targetLanguage: string;
  speakerDisplayName?: string;
  className?: string;
};

export function LiveCaptionsOverlay({
  isCaptionsEnabled,
  recentCaptions,
  currentInterimCaption,
  targetLanguage,
  speakerDisplayName = "You",
  className = "",
}: LiveCaptionsOverlayProps) {
  if (!isCaptionsEnabled) return null;
  if (recentCaptions.length === 0 && !currentInterimCaption) return null;

  return (
    <div
      className={`live-captions-overlay ${className}`}
      role="region"
      aria-live="polite"
      aria-label="Live captions"
    >
      <div className="live-captions-container">
        {recentCaptions.slice(-2).map((item) => (
          <div key={item.id} className="live-caption-bubble">
            <span className="live-caption-speaker">{item.speakerName}</span>
            <span className="live-caption-text">{item.translatedText}</span>
          </div>
        ))}
        {currentInterimCaption && (
          <div className="live-caption-bubble live-caption-bubble--interim">
            <span className="live-caption-speaker">{speakerDisplayName}</span>
            <span className="live-caption-text">
              {currentInterimCaption}
              <span className="live-caption-cursor" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
