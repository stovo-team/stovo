import React from "react";
import type { User } from "../../../api/auth";

export type GroupCallActiveBannerProps = {
  chatTitle?: string | null;
  activeCall: Record<string, any>;
  members: User[];
  onOpenPreJoin: () => void;
};

/**
  Persistent shrinked call bar displayed at the top of a group chat
  when an active group call is running and the user is not yet participating.
 */
export function GroupCallActiveBanner({
  chatTitle,
  activeCall,
  members,
  onOpenPreJoin,
}: GroupCallActiveBannerProps) {
  const participants = (activeCall.participants as Array<Record<string, any>>) || [];
  const activeCount = participants.filter(
    (p) => p.state === "connecting" || p.state === "in-call" || p.state === "joined"
  ).length;

  const countDisplay = activeCount > 0 ? `${activeCount} in call` : "Call in progress";
  const callType = activeCall.callType === "video" ? "Video Call" : "Audio Call";

  return (
    <div className="group-call-active-banner" role="region" aria-label="Group call in progress">
      <div className="group-call-banner-info">
        <span className="group-call-banner-pulse" aria-hidden="true" />
        <div className="group-call-banner-text">
          <span className="group-call-banner-title">
            Live {callType} · {countDisplay}
          </span>
          {chatTitle && <span className="group-call-banner-subtitle">{chatTitle}</span>}
        </div>
      </div>

      <button
        type="button"
        className="group-call-banner-join-btn"
        onClick={onOpenPreJoin}
        aria-label="Join group call"
      >
        <svg
          className="group-call-join-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* SVG Phone / Call-in Icon */}
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
        <span>Join</span>
      </button>
    </div>
  );
}
