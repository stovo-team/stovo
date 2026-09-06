import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, Clock3, MessageSquare, Trophy, Users, Zap } from "lucide-react";

import { FunAwards, ServerOverviewStats } from "../api/stats";
import { Chat, getChats } from "../api/chats";
import { getClusterPrefix } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { RealAvatar } from "../features/chats/sidebar/RealAvatar";
import { chatAvatarFallbackKind, chatAvatarFile } from "../features/chats/shared/chatPresentation";
import AppNav from "./AppNav";
import { BackButton } from "../components/BackButton";

const ranges = ["7d", "30d", "1y", "all"] as const;
type Range = (typeof ranges)[number];

function formatSeconds(seconds: number) {
  if (!seconds) return "—";
  return seconds < 60 ? `${Math.round(seconds)}s` : `${Math.round(seconds / 60)}m`;
}

export default function AdminStatsPage() {
  const { authRequest, currentUser, accessToken } = useAuth();
  const prefix = getClusterPrefix();
  // Start with the complete history. A new dashboard should not look empty just
  // because the most recent message falls outside the last 30 days.
  const [timeRange, setTimeRange] = useState<Range>("all");
  const [overview, setOverview] = useState<ServerOverviewStats | null>(null);
  const [awards, setAwards] = useState<FunAwards | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      authRequest<ServerOverviewStats>(`/api/v1/plugins/stats/overview?range=${timeRange}`),
      authRequest<FunAwards>("/api/v1/plugins/stats/fun-awards"),
      accessToken ? getChats(accessToken).catch(() => []) : Promise.resolve([])
    ])
      .then(([nextOverview, nextAwards, nextChats]) => {
        if (cancelled) return;
        setOverview(nextOverview);
        setAwards(nextAwards);
        setChats(nextChats);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load analytics");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accessToken, authRequest, currentUser?.id, timeRange]);

  // Older or empty statistics rows can be serialized as null by the API.
  // Keep the dashboard useful for a brand-new server instead of failing to render.
  const messagesByHour = overview?.messages_by_hour ?? [];
  const responseTimeBuckets = overview?.response_time_buckets ?? {
    under_1_min: 0,
    from_1_to_5_min: 0,
    from_5_to_30_min: 0,
    over_30_min: 0
  };
  const conversationStarters = overview?.top_conversation_starters ?? [];
  const activeChats = overview?.top_active_chats ?? [];
  const topEmojis = awards?.top_emojis ?? [];
  const chatsById = useMemo(() => new Map(chats.map((chat) => [chat.id, chat])), [chats]);
  const hasActivity = messagesByHour.some((count) => count > 0);
  const peakHour = useMemo(() => Math.max(...messagesByHour, 1), [messagesByHour]);
  const awardCards = awards ? [
    { label: "Night owl", icon: "🦉", winner: awards.night_owl },
    { label: "Early bird", icon: "🌅", winner: awards.early_bird },
    { label: "Quickest reply", icon: "⚡", winner: awards.lightning_responder },
    { label: "Icebreaker", icon: "👑", winner: awards.icebreaker_monarch },
    { label: "Novel writer", icon: "✍️", winner: awards.novel_writer },
    { label: "One-word wonder", icon: "💬", winner: awards.one_word_wonder },
    { label: "Reaction magnet", icon: "✨", winner: awards.reaction_magnet }
  ] : [];

  return <main className="app-shell app-frame admin-page admin-detail-page stats-page">
    <AppNav />
    <section className="page-surface admin-surface stats-surface">
      <header className="stats-header">
        <BackButton to={`${prefix}/app/settings`} className="stats-back" ariaLabel="Back to Settings" />
        <div><h1>Statistics dashboard</h1></div>
      </header>

      <div className="stats-toolbar" aria-label="Statistics range"><span>Showing</span><div role="group" className="stats-range-control">
        {ranges.map((range) => <button key={range} type="button" className={range === timeRange ? "is-active" : undefined} onClick={() => setTimeRange(range)}>{range === "all" ? "All time" : range.toUpperCase()}</button>)}
      </div></div>
      {loading && <div className="stats-state">Loading statistics…</div>}
      {error && !loading && <div className="stats-state is-error">{error}. Try refreshing the page.</div>}

      {!loading && !error && overview && <>
        <section className="stats-summary-grid" aria-label="Key statistics">
          <article className="stats-summary-card"><span className="stats-summary-icon"><MessageSquare size={17} /></span><span>Total messages</span><strong>{overview.total_messages.toLocaleString()}</strong><small>{overview.total_media.toLocaleString()} shared files and media</small></article>
          <article className="stats-summary-card"><span className="stats-summary-icon is-warm"><Clock3 size={17} /></span><span>Typical reply</span><strong>{formatSeconds(overview.avg_response_time_seconds)}</strong><small>{overview.fast_response_percent}% within one minute</small></article>
          <article className="stats-summary-card"><span className="stats-summary-icon is-pink"><Zap size={17} /></span><span>Conversations started</span><strong>{overview.total_conversations_started.toLocaleString()}</strong><small>after four hours of quiet</small></article>
          <article className="stats-summary-card"><span className="stats-summary-icon is-violet"><Activity size={17} /></span><span>Average session</span><strong>{Math.round(overview.avg_session_duration_minutes)}m</strong><small>continuous conversation time</small></article>
        </section>
        <section className="stats-content-grid">
          <article className="stats-card stats-card--activity"><div className="stats-card-heading"><div><span>When people talk</span><h2>Activity across the day</h2></div><small>Local server time</small></div>{hasActivity ? <><div className="stats-chart" aria-label="Messages by hour">
            {messagesByHour.map((count, hour) => <div className="stats-chart-column" key={hour}><span className="stats-chart-tooltip">{hour.toString().padStart(2, "0")}:00 · {count} messages</span>{count > 0 && <i style={{ height: `${Math.max((count / peakHour) * 100, 6)}%` }} />}</div>)}
          </div><div className="stats-chart-axis"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>11p</span></div></> : <p className="stats-chart-empty">No messages were recorded in this time range.</p>}</article>
          <article className="stats-card stats-card--replies"><div className="stats-card-heading"><div><span>Responsiveness</span><h2>Reply rhythm</h2></div></div><div className="stats-reply-list">
            {[["Under a minute", responseTimeBuckets.under_1_min, "is-fast"], ["1–5 minutes", responseTimeBuckets.from_1_to_5_min, "is-regular"], ["5–30 minutes", responseTimeBuckets.from_5_to_30_min, "is-casual"], ["Over 30 minutes", responseTimeBuckets.over_30_min, "is-slow"]].map(([label, count, tone]) => <div className="stats-reply-row" key={String(label)}><i className={String(tone)} /><span>{label}</span><strong>{Number(count).toLocaleString()}</strong></div>)}
          </div></article>
          <article className="stats-card"><div className="stats-card-heading"><div><span>Conversation starters</span><h2>They keep the chat moving</h2></div><Users size={18} /></div><div className="stats-leader-list">
            {conversationStarters.length ? conversationStarters.map((member, index) => <div className="stats-leader" key={member.user_id}><span className="stats-rank">{index + 1}</span><div><strong>{member.display_name}</strong><small>{member.starts_count} starts</small><i><b style={{ width: `${member.percentage}%` }} /></i></div><em>{member.percentage}%</em></div>) : <p className="stats-empty">A leader will appear as conversations begin.</p>}
          </div></article>
          <article className="stats-card"><div className="stats-card-heading"><div><span>Most active spaces</span><h2>Where the conversation lives</h2></div><BarChart3 size={18} /></div><div className="stats-chat-list">
            {activeChats.length ? activeChats.map((chat) => { const fullChat = chatsById.get(chat.chat_id); return <div className="stats-chat" key={chat.chat_id}>{fullChat ? <RealAvatar accessToken={accessToken} className="avatar stats-chat-avatar" fallbackKind={chatAvatarFallbackKind(fullChat)} file={chatAvatarFile(fullChat, currentUser?.id)} label={chat.title} /> : <span className="stats-chat-avatar stats-chat-avatar--fallback">{chat.type.slice(0, 1)}</span>}<strong>{chat.title}</strong><small>{chat.message_count.toLocaleString()} msgs</small></div>; }) : <p className="stats-empty">No chat activity in this period.</p>}
          </div></article>
        </section>
        {awards && <section className="stats-awards"><div className="stats-awards-heading"><div><span>Good company</span><h2>Community highlights</h2></div><Trophy size={20} /></div><div className="stats-award-grid">
          {awardCards.map(({ label, icon, winner }) => <article className="stats-award" key={label}><span>{icon}</span><div><small>{label}</small><strong>{winner.display_name || "Not decided yet"}</strong><p>{winner.value || winner.description}</p></div></article>)}
        </div><div className="stats-duo"><span>🤝</span><div><small>Dynamic duo</small><strong>{awards.dynamic_duo.user_1_name && awards.dynamic_duo.user_2_name ? `${awards.dynamic_duo.user_1_name} & ${awards.dynamic_duo.user_2_name}` : "Still waiting for a legendary duo"}</strong></div><p>{topEmojis.slice(0, 5).map((emoji) => emoji.emoji).join(" ") || "Keep reacting to reveal the server favourites."}</p></div></section>}
      </>}
    </section>
  </main>;
}
