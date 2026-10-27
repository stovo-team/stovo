import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, Clock3, MessageSquare, Trophy, Users, Zap } from "lucide-react";

import { FunAwards, ServerOverviewStats } from "../api/stats";
import { Chat, getChats } from "../api/chats";
import { getClusterPrefix } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { RealAvatar } from "../features/chats/sidebar/RealAvatar";
import { chatAvatarFallbackKind, chatAvatarFile, chatAvatarIdentity } from "../features/chats/shared/chatPresentation";
import AppNav from "./AppNav";
import { BackButton } from "../components/BackButton";
import { useStrings } from "../i18n/LanguageContext";

const ranges = ["7d", "30d", "1y", "all"] as const;
type Range = (typeof ranges)[number];

function formatSeconds(seconds: number) {
  if (!seconds) return "—";
  return seconds < 60 ? `${Math.round(seconds)}s` : `${Math.round(seconds / 60)}m`;
}

export default function AdminStatsPage() {
  const copy = useStrings().statistics;
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
    { label: copy.nightOwl, icon: "🦉", winner: awards.night_owl },
    { label: copy.earlyBird, icon: "🌅", winner: awards.early_bird },
    { label: copy.quickestReply, icon: "⚡", winner: awards.lightning_responder },
    { label: copy.icebreaker, icon: "👑", winner: awards.icebreaker_monarch },
    { label: copy.novelWriter, icon: "✍️", winner: awards.novel_writer },
    { label: copy.oneWordWonder, icon: "💬", winner: awards.one_word_wonder },
    { label: copy.reactionMagnet, icon: "✨", winner: awards.reaction_magnet }
  ] : [];

  return <main className="app-shell app-frame admin-page admin-detail-page stats-page">
    <AppNav />
    <section className="page-surface admin-surface stats-surface">
      <header className="stats-header">
        <BackButton to={`${prefix}/app/settings`} className="stats-back mobile-back-button" ariaLabel={copy.backSettings} />
        <div><h1>{copy.dashboard}</h1></div>
      </header>

      <div className="stats-toolbar" aria-label={copy.range}><span>{copy.showing}</span><div role="group" className="stats-range-control">
        {ranges.map((range) => <button key={range} type="button" className={range === timeRange ? "is-active" : undefined} onClick={() => setTimeRange(range)}>{range === "all" ? copy.allTime : range.toUpperCase()}</button>)}
      </div></div>
      {loading && <div className="stats-state">{copy.loading}</div>}
      {error && !loading && <div className="stats-state is-error">{error}. {copy.refreshHint}</div>}

      {!loading && !error && overview && <>
        <section className="stats-summary-grid" aria-label={copy.keyStats}>
          <article className="stats-summary-card"><span className="stats-summary-icon"><MessageSquare size={17} /></span><span>{copy.totalMessages}</span><strong>{overview.total_messages.toLocaleString()}</strong><small>{overview.total_media.toLocaleString()} {copy.sharedMedia}</small></article>
          <article className="stats-summary-card"><span className="stats-summary-icon is-warm"><Clock3 size={17} /></span><span>{copy.typicalReply}</span><strong>{formatSeconds(overview.avg_response_time_seconds)}</strong><small>{overview.fast_response_percent}{copy.withinMinute}</small></article>
          <article className="stats-summary-card"><span className="stats-summary-icon is-pink"><Zap size={17} /></span><span>{copy.conversationsStarted}</span><strong>{overview.total_conversations_started.toLocaleString()}</strong><small>{copy.quietHours}</small></article>
          <article className="stats-summary-card"><span className="stats-summary-icon is-violet"><Activity size={17} /></span><span>{copy.averageSession}</span><strong>{Math.round(overview.avg_session_duration_minutes)}m</strong><small>{copy.continuousTime}</small></article>
        </section>
        <section className="stats-content-grid">
          <article className="stats-card stats-card--activity"><div className="stats-card-heading"><div><span>{copy.whenPeopleTalk}</span><h2>{copy.activityDay}</h2></div><small>{copy.serverTime}</small></div>{hasActivity ? <><div className="stats-chart" aria-label={copy.messagesByHour}>
            {messagesByHour.map((count, hour) => <div className="stats-chart-column" key={hour}><span className="stats-chart-tooltip">{copy.hourTooltip(hour.toString().padStart(2, "0"), count)}</span>{count > 0 && <i style={{ height: `${Math.max((count / peakHour) * 100, 6)}%` }} />}</div>)}
          </div><div className="stats-chart-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div></> : <p className="stats-chart-empty">{copy.noMessages}</p>}</article>
          <article className="stats-card stats-card--replies"><div className="stats-card-heading"><div><span>{copy.responsiveness}</span><h2>{copy.replyRhythm}</h2></div></div><div className="stats-reply-list">
            {[[copy.underMinute, responseTimeBuckets.under_1_min, "is-fast"], [copy.oneToFive, responseTimeBuckets.from_1_to_5_min, "is-regular"], [copy.fiveToThirty, responseTimeBuckets.from_5_to_30_min, "is-casual"], [copy.overThirty, responseTimeBuckets.over_30_min, "is-slow"]].map(([label, count, tone]) => <div className="stats-reply-row" key={String(label)}><i className={String(tone)} /><span>{label}</span><strong>{Number(count).toLocaleString()}</strong></div>)}
          </div></article>
          <article className="stats-card"><div className="stats-card-heading"><div><span>{copy.conversationStarters}</span><h2>{copy.movingChat}</h2></div><Users size={18} /></div><div className="stats-leader-list">
            {conversationStarters.length ? conversationStarters.map((member, index) => <div className="stats-leader" key={member.user_id}><span className="stats-rank">{index + 1}</span><div><strong>{member.display_name}</strong><small>{copy.starts(member.starts_count)}</small><i><b style={{ width: `${member.percentage}%` }} /></i></div><em>{member.percentage}%</em></div>) : <p className="stats-empty">{copy.leaderEmpty}</p>}
          </div></article>
          <article className="stats-card"><div className="stats-card-heading"><div><span>{copy.activeSpaces}</span><h2>{copy.conversationLives}</h2></div><BarChart3 size={18} /></div><div className="stats-chat-list">
            {activeChats.length ? activeChats.map((chat) => { const fullChat = chatsById.get(chat.chat_id); const fallbackKind = chat.type === "voice" ? "voice" : chat.type === "channel" ? "channel" : chat.type === "family" ? "family" : chat.type === "archive" ? "archive" : chat.type === "group" ? "group" : "direct"; return <div className="stats-chat" key={chat.chat_id}>{<RealAvatar accessToken={accessToken} className="avatar stats-chat-avatar" fallbackKind={fullChat ? chatAvatarFallbackKind(fullChat) : fallbackKind} file={fullChat ? chatAvatarFile(fullChat, currentUser?.id) : null} label={chat.title} {...(fullChat ? chatAvatarIdentity(fullChat, currentUser?.id) : { entityId: chat.chat_id })} />}<strong>{chat.title}</strong><small>{copy.messagesShort(chat.message_count)}</small></div>; }) : <p className="stats-empty">{copy.noChatActivity}</p>}
          </div></article>
        </section>
        {awards && <section className="stats-awards"><div className="stats-awards-heading"><div><span>{copy.goodCompany}</span><h2>{copy.communityHighlights}</h2></div><Trophy size={20} /></div><div className="stats-award-grid">
          {awardCards.map(({ label, icon, winner }) => <article className="stats-award" key={label}><span>{icon}</span><div><small>{label}</small><strong>{winner.display_name || copy.notDecided}</strong><p>{winner.value || winner.description}</p></div></article>)}
        </div><div className="stats-duo"><span>🤝</span><div><small>{copy.dynamicDuo}</small><strong>{awards.dynamic_duo.user_1_name && awards.dynamic_duo.user_2_name ? `${awards.dynamic_duo.user_1_name} & ${awards.dynamic_duo.user_2_name}` : copy.waitingDuo}</strong></div><p>{topEmojis.slice(0, 5).map((emoji) => emoji.emoji).join(" ") || copy.revealFavorites}</p></div></section>}
      </>}
    </section>
  </main>;
}
