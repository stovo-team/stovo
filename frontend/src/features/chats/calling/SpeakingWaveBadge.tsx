import React from "react";

export type SpeakingWaveBadgeProps = {
  className?: string;
  active?: boolean;
};

/**
 * Top-right corner animated wave badge indicating active speaking status over video or tiles.
 */
export function SpeakingWaveBadge({ className = "", active = true }: SpeakingWaveBadgeProps) {
  if (!active) return null;
  return (
    <div className={`speaking-wave-badge ${className}`} aria-hidden="true" title="Speaking">
      <span className="speaking-wave-bar" />
      <span className="speaking-wave-bar" />
      <span className="speaking-wave-bar" />
      <span className="speaking-wave-bar" />
    </div>
  );
}
