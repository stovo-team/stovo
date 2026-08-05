export function MobileIncomingScreen({
  peerName,
  callType,
  onAccept,
  onDecline,
}: {
  peerName: string;
  callType: "audio" | "video";
  onAccept: () => void;
  onDecline: () => void;
}) {
  const initial = peerName ? peerName.charAt(0).toUpperCase() : "?";
  return (
    <div className="mobile-incoming-screen">
      <div className="mobile-incoming-avatar-wrap">
        <div className="mobile-incoming-ripple" />
        <div className="mobile-incoming-ripple" />
        <div className="mobile-incoming-ripple" />
        <div className="mobile-incoming-avatar">{initial}</div>
      </div>
      <div className="mobile-incoming-name">{peerName}</div>
      <div className="mobile-incoming-status">
        {callType === "video" ? "Incoming video call…" : "Incoming call…"}
      </div>
      <div className="mobile-incoming-actions">
        <div className="mobile-incoming-btn-wrap">
          <button type="button" className="mobile-call-btn" aria-label="Accept call" onClick={onAccept}>
            <svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
          </button>
          <span className="mobile-call-btn-label">Accept</span>
        </div>
        <div className="mobile-incoming-btn-wrap">
          <button type="button" className="mobile-call-btn decline" aria-label="Decline call" onClick={onDecline}>
            <svg viewBox="0 0 24 24" style={{ transform: "rotate(135deg)" }}><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
          </button>
          <span className="mobile-call-btn-label">Decline</span>
        </div>
      </div>
    </div>
  );
}
