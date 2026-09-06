import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChatStats } from "../api/stats";
import { BarChart3, Clock3, Image, MessageCircle, Users, X, Zap } from "lucide-react";

interface Props {
  stats: ChatStats | null;
  chatTitle?: string;
  isLoading?: boolean;
  error?: string | null;
  onClose: () => void;
}

function formatResponseTime(seconds: number) {
  if (!seconds) return "No replies yet";
  return seconds < 60 ? `${Math.round(seconds)} sec` : `${Math.round(seconds / 60)} min`;
}

export default function ChatStatsDrawer({ stats, chatTitle, isLoading = false, error, onClose }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const messagesByHour = stats?.messages_by_hour ?? [];
  const maxHour = Math.max(...messagesByHour, 1);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return createPortal(<div className="chat-stats-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="chat-stats-drawer" role="dialog" aria-modal="true" aria-labelledby="chat-stats-title" tabIndex={-1}>
      <header className="chat-stats-header">
        <div><span className="chat-stats-eyebrow"><BarChart3 size={15} /> Statistics</span><h2 id="chat-stats-title">{chatTitle || "Chat"}</h2></div>
        <button ref={closeButtonRef} type="button" className="chat-stats-close" onClick={onClose} aria-label="Close statistics"><X size={20} /></button>
      </header>

      <div className="chat-stats-body" aria-busy={isLoading}>
        {isLoading && <p className="chat-stats-state">Loading statistics…</p>}
        {!isLoading && error && <p className="chat-stats-state is-error">{error}</p>}
        {!isLoading && !error && stats && <>
          <section className="chat-stats-metrics" aria-label="Chat totals">
            <Metric icon={<MessageCircle size={18} />} label="Messages" value={stats.total_messages.toLocaleString()} />
            <Metric icon={<Image size={18} />} label="Media" value={stats.total_media.toLocaleString()} tone="pink" />
            <Metric icon={<Users size={18} />} label="Members" value={stats.total_members.toLocaleString()} tone="blue" />
          </section>

          <section className="chat-stats-response" aria-label="Response time">
            <span className="chat-stats-response-icon"><Clock3 size={18} /></span>
            <div><small>Typical response time</small><strong>{formatResponseTime(stats.avg_response_time_seconds)}</strong></div>
            {stats.fastest_responder_name && <div className="chat-stats-fastest"><small>Quickest reply</small><strong><Zap size={14} /> {stats.fastest_responder_name}</strong></div>}
          </section>

          <section className="chat-stats-section">
            <div className="chat-stats-section-heading"><div><span>Activity</span><h3>Messages by hour</h3></div><small>Local time</small></div>
            <div className="chat-stats-chart" aria-label="Messages by hour">
              {messagesByHour.map((count, hour) => <div className="chat-stats-chart-column" key={hour} title={`${hour.toString().padStart(2, "0")}:00 — ${count} messages`}><i style={{ height: `${Math.max((count / maxHour) * 100, 4)}%` }} /></div>)}
            </div>
            <div className="chat-stats-axis"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11 PM</span></div>
          </section>

          <section className="chat-stats-section">
            <div className="chat-stats-section-heading"><div><span>People</span><h3>Most active members</h3></div></div>
            {stats.top_members.length ? <ol className="chat-stats-member-list">{stats.top_members.map((member, index) => <li key={member.user_id}><span>{index + 1}</span><strong>{member.display_name}</strong><small>{member.message_count.toLocaleString()} messages</small></li>)}</ol> : <p className="chat-stats-empty">No member activity yet.</p>}
          </section>
        </>}
      </div>
    </section>
  </div>, document.body);
}

function Metric({ icon, label, value, tone = "purple" }: { icon: React.ReactNode; label: string; value: string; tone?: "purple" | "pink" | "blue" }) {
  return <article className={`chat-stats-metric is-${tone}`}><span>{icon}</span><small>{label}</small><strong>{value}</strong></article>;
}
