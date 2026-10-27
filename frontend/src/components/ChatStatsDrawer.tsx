import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChatStats } from "../api/stats";
import { BarChart3, Clock3, Image, MessageCircle, Users, Zap } from "lucide-react";
import { useResolvedLanguage, useStrings } from "../i18n/LanguageContext";
import { PopupDialog, PopupCloseButton } from "./ui/Popup";

interface Props {
  stats: ChatStats | null;
  chatTitle?: string;
  isLoading?: boolean;
  error?: string | null;
  onClose: () => void;
}

export default function ChatStatsDrawer({ stats, chatTitle, isLoading = false, error, onClose }: Props) {
  const copy = useStrings().chatStats;
  const locale = useResolvedLanguage();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const messagesByHour = stats?.messages_by_hour ?? [];
  const topMembers = stats?.top_members ?? [];
  const maxHour = Math.max(...messagesByHour, 1);
  const formatHour = (hour: number) => new Date(Date.UTC(2020, 0, 1, hour)).toLocaleTimeString(locale, { hour: "numeric", timeZone: "UTC" });
  const formatResponseTime = (seconds: number) => !seconds ? copy.noReplies : seconds < 60
    ? copy.seconds(Math.round(seconds))
    : copy.minutes(Math.round(seconds / 60));

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  return createPortal(<PopupDialog className="chat-stats-drawer" ariaLabelledBy="chat-stats-title" onClose={onClose} closeOnBackdrop closeOnEscape backdropClassName="chat-stats-overlay" size="xl" showCloseButton={false}>
      <header className="chat-stats-header">
        <div><span className="chat-stats-eyebrow"><BarChart3 size={15} /> {copy.title}</span><h2 id="chat-stats-title">{chatTitle || copy.chat}</h2></div>
        <PopupCloseButton ref={closeButtonRef} onClick={onClose} ariaLabel={copy.close} />
      </header>

      <div className="chat-stats-body" aria-busy={isLoading}>
        {isLoading && <p className="chat-stats-state">{copy.loading}</p>}
        {!isLoading && error && <p className="chat-stats-state is-error">{error}</p>}
        {!isLoading && !error && stats && <>
          <section className="chat-stats-metrics" aria-label={copy.chatTotals}>
            <Metric icon={<MessageCircle size={18} />} label={copy.messages} value={stats.total_messages.toLocaleString(locale)} />
            <Metric icon={<Image size={18} />} label={copy.media} value={stats.total_media.toLocaleString(locale)} tone="pink" />
            <Metric icon={<Users size={18} />} label={copy.members} value={stats.total_members.toLocaleString(locale)} tone="blue" />
          </section>

          <section className="chat-stats-response" aria-label={copy.responseTime}>
            <span className="chat-stats-response-icon"><Clock3 size={18} /></span>
            <div><small>{copy.typicalResponse}</small><strong>{formatResponseTime(stats.avg_response_time_seconds)}</strong></div>
            {stats.fastest_responder_name && <div className="chat-stats-fastest"><small>{copy.quickestReply}</small><strong><Zap size={14} /> {stats.fastest_responder_name}</strong></div>}
          </section>

          <section className="chat-stats-section">
            <div className="chat-stats-section-heading"><div><span>{copy.activity}</span><h3>{copy.messagesByHour}</h3></div><small>{copy.localTime}</small></div>
            <div className="chat-stats-chart" aria-label={copy.messagesByHour}>
              {messagesByHour.map((count, hour) => <div className="chat-stats-chart-column" key={hour} title={copy.hourCount(formatHour(hour), count)}><i style={{ height: `${Math.max((count / maxHour) * 100, 4)}%` }} /></div>)}
            </div>
            <div className="chat-stats-axis"><span>{formatHour(0)}</span><span>{formatHour(6)}</span><span>{formatHour(12)}</span><span>{formatHour(18)}</span><span>{formatHour(23)}</span></div>
          </section>

          <section className="chat-stats-section">
            <div className="chat-stats-section-heading"><div><span>{copy.people}</span><h3>{copy.mostActive}</h3></div></div>
            {topMembers.length ? <ol className="chat-stats-member-list">{topMembers.map((member, index) => <li key={member.user_id}><span>{index + 1}</span><strong>{member.display_name}</strong><small>{copy.messageCount(member.message_count, locale)}</small></li>)}</ol> : <p className="chat-stats-empty">{copy.noActivity}</p>}
          </section>
        </>}
      </div>
  </PopupDialog>, document.body);
}

function Metric({ icon, label, value, tone = "purple" }: { icon: React.ReactNode; label: string; value: string; tone?: "purple" | "pink" | "blue" }) {
  return <article className={`chat-stats-metric is-${tone}`}><span>{icon}</span><small>{label}</small><strong>{value}</strong></article>;
}
