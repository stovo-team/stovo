/**
 * LiveCaptionsOverlay — Subtitle overlay rendered over active call/meeting video.
 *
 * Shows real-time speech transcription with high
 * contrast, frosted glass backdrop, and speaker attribution.
 */
import React from "react";
import type { LiveCaptionItem } from "./useLiveCaptions";
import { useStrings } from "../../../i18n/LanguageContext";

export type LiveCaptionsOverlayProps = {
  isCaptionsEnabled: boolean;
  recentCaptions: LiveCaptionItem[];
  currentInterimCaption: string | null;
  speakerDisplayName?: string;
  className?: string;
};

export function LiveCaptionsOverlay({
  isCaptionsEnabled,
  recentCaptions,
  currentInterimCaption,
  speakerDisplayName = "You",
  className = "",
}: LiveCaptionsOverlayProps) {
  const copy = useStrings().sharedUi;
  if (!isCaptionsEnabled) return null;
  if (recentCaptions.length === 0 && !currentInterimCaption) return null;

  return (
    <div
      className={`live-captions-overlay ${className}`}
      role="region"
      aria-live="polite"
      aria-label={copy.liveCaptionsLabel}
    >
      <div className="live-captions-container">
        {recentCaptions.slice(-2).map((item) => (
          <div key={item.id} className="live-caption-bubble">
            <span className="live-caption-speaker">{item.speakerName}</span>
            <span className="live-caption-text">{item.originalText}</span>
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
