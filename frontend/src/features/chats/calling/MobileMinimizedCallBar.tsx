import type { CallPhase } from "../shared/types";

export function MobileMinimizedCallBar({
  peerName,
  callPhase,
  callTimer,
  micMuted,
  onToggleMic,
  onEnd,
  onExpand,
  className = "",
}: {
  peerName: string;
  callPhase: CallPhase;
  callTimer: string;
  micMuted: boolean;
  onToggleMic: () => void;
  onEnd: () => void;
  onExpand: () => void;
  className?: string;
}) {
  const statusLabel =
    callPhase === "in-call"
      ? callTimer
      : callPhase === "outgoing"
        ? "Calling…"
        : "Connecting…";

  return (
    <div className={`mobile-call-strip ${className}`.trim()} role="status" aria-live="polite">
      <button
        type="button"
        className={`mobile-call-strip-btn${micMuted ? " is-muted" : ""}`}
        aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
        onClick={(event) => {
          event.stopPropagation();
          onToggleMic();
        }}
      >
        <span className="ms-icon ms-icon--22" aria-hidden={true}>
          {micMuted ? "mic_off" : "mic"}
        </span>
      </button>
      <button
        type="button"
        className="mobile-call-strip-main"
        aria-label="Restore call"
        onClick={onExpand}
      >
        <span className="mobile-call-bar-pulse" aria-hidden="true" />
        <span className="mobile-call-strip-label">
          {peerName} · {statusLabel}
        </span>
      </button>
      <button
        type="button"
        className="mobile-call-strip-btn mobile-call-strip-btn--end"
        aria-label="End call"
        onClick={(event) => {
          event.stopPropagation();
          onEnd();
        }}
      >
        <span className="ms-icon ms-icon--22" aria-hidden={true}>
          call_end
        </span>
      </button>
    </div>
  );
}
