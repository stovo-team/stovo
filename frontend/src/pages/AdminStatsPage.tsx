import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import AppNav from "./AppNav";
import { ServerOverviewStats, FunAwards, YearWithStovo } from "../api/stats";
import YearWithStovoModal from "../components/YearWithStovoModal";
import {
  BarChart3,
  Clock,
  MessageSquare,
  Sparkles,
  Trophy,
  Users,
  Zap,
  TrendingUp,
  Image,
  Award,
  Calendar,
  Flame
} from "lucide-react";

export default function AdminStatsPage() {
  const { authRequest, currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<"useful" | "fun">("useful");
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "1y" | "all">("all");

  const [overview, setOverview] = useState<ServerOverviewStats | null>(null);
  const [funAwards, setFunAwards] = useState<FunAwards | null>(null);
  const [wrappedData, setWrappedData] = useState<YearWithStovo | null>(null);
  const [isWrappedOpen, setIsWrappedOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      authRequest<ServerOverviewStats>(`/api/v1/plugins/stats/overview?range=${timeRange}`),
      authRequest<FunAwards>("/api/v1/plugins/stats/fun-awards"),
      authRequest<YearWithStovo>(`/api/v1/plugins/stats/wrapped/${new Date().getFullYear()}?userId=${currentUser?.id || ""}`)
    ])
      .then(([statsRes, funRes, wrappedRes]) => {
        if (!cancelled) {
          setOverview(statsRes);
          setFunAwards(funRes);
          setWrappedData(wrappedRes);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || "Could not load statistics");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authRequest, timeRange, currentUser?.id]);

  const maxHourMsg = overview ? Math.max(...overview.messages_by_hour, 1) : 1;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <main className="app-shell app-frame admin-page">
      <AppNav />

      <section className="page-surface p-4 sm:p-6 space-y-6 max-w-5xl mx-auto overflow-y-auto">
        {/* Header with Title & Year with Stovo Button */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-[var(--foreground)] flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-primary/10 text-primary">
                <BarChart3 className="w-5 h-5" />
              </span>
              Server Statistics & Insights
            </h1>
            <p className="text-xs sm:text-sm text-[var(--muted-foreground)]">
              Real-time server metrics, conversation patterns, and community awards.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsWrappedOpen(true)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 text-white text-xs sm:text-sm font-bold shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            Year with Stovo
          </button>
        </div>

        {/* Tab & Range Selector Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--card)] p-2 rounded-2xl border border-[var(--border)]">
          {/* Main Tabs */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab("useful")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "useful"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              ⚡ Useful Metrics
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("fun")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "fun"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              🎉 Fun & Awards
            </button>
          </div>

          {/* Time Range Filter (Useful Tab Only) */}
          {activeTab === "useful" && (
            <div className="flex gap-1 bg-[var(--background)] p-1 rounded-xl border border-[var(--border)] text-xs">
              {(["7d", "30d", "1y", "all"] as const).map((rng) => (
                <button
                  key={rng}
                  type="button"
                  onClick={() => setTimeRange(rng)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    timeRange === rng
                      ? "bg-[var(--card)] text-[var(--foreground)] font-bold shadow-sm"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {rng === "all" ? "All Time" : rng.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="p-12 text-center text-sm text-[var(--muted-foreground)] animate-pulse">
            Loading analytics and server statistics...
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* TAB 1: USEFUL / OPERATIONAL METRICS */}
        {!loading && !error && activeTab === "useful" && overview && (
          <div className="space-y-6 animate-fade-in">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] space-y-1 shadow-sm">
                <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] font-medium">
                  <span>Total Messages</span>
                  <MessageSquare className="w-4 h-4 text-primary" />
                </div>
                <div className="text-2xl font-black text-[var(--foreground)]">
                  {overview.total_messages.toLocaleString()}
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-1">
                  <span>{overview.total_media} media attachments</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] space-y-1 shadow-sm">
                <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] font-medium">
                  <span>Avg Response Time</span>
                  <Clock className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-2xl font-black text-[var(--foreground)]">
                  {overview.avg_response_time_seconds > 0
                    ? `${overview.avg_response_time_seconds}s`
                    : "—"}
                </div>
                <div className="text-[11px] text-emerald-500 font-medium">
                  ⚡ {overview.fast_response_percent}% under 1 min
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] space-y-1 shadow-sm">
                <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] font-medium">
                  <span>Chats Started</span>
                  <Zap className="w-4 h-4 text-pink-500" />
                </div>
                <div className="text-2xl font-black text-[var(--foreground)]">
                  {overview.total_conversations_started.toLocaleString()}
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  After silent gaps (&gt;4h)
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] space-y-1 shadow-sm">
                <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] font-medium">
                  <span>Avg Session Duration</span>
                  <TrendingUp className="w-4 h-4 text-indigo-500" />
                </div>
                <div className="text-2xl font-black text-[var(--foreground)]">
                  {overview.avg_session_duration_minutes}m
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  Continuous chatter sessions
                </div>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Hourly Activity Heatmap / Bar Chart */}
              <div className="lg:col-span-2 p-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-primary" /> Peak Activity Times (24 Hours)
                  </h3>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    Local Server Time
                  </span>
                </div>

                <div className="h-36 flex items-end gap-1.5 pt-4 pb-1 border-b border-[var(--border)]">
                  {overview.messages_by_hour.map((cnt, hr) => {
                    const heightPct = Math.round((cnt / maxHourMsg) * 100);
                    return (
                      <div
                        key={hr}
                        className="flex-1 bg-primary/30 hover:bg-primary rounded-t transition-all relative group cursor-pointer"
                        style={{ height: `${Math.max(heightPct, 4)}%` }}
                      >
                        <div className="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 bg-[var(--background)] text-[var(--foreground)] text-[10px] font-bold px-1.5 py-0.5 rounded border border-[var(--border)] shadow z-20 whitespace-nowrap">
                          {hr}:00 — {cnt} msgs
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between text-[10px] text-[var(--muted-foreground)]">
                  <span>12 AM</span>
                  <span>4 AM</span>
                  <span>8 AM</span>
                  <span>12 PM</span>
                  <span>4 PM</span>
                  <span>8 PM</span>
                  <span>11 PM</span>
                </div>
              </div>

              {/* Conversation Starters ("Icebreaker Monarchs") */}
              <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] space-y-3 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)] flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-pink-500" /> Conversation Starters
                </h3>
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  Who breaks the silence and gets family chatting:
                </p>

                <div className="space-y-3 pt-1">
                  {overview.top_conversation_starters && overview.top_conversation_starters.length > 0 ? (
                    overview.top_conversation_starters.map((starter, idx) => (
                      <div key={starter.user_id} className="space-y-1">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="truncate max-w-[160px]">
                            {idx === 0 ? "👑 " : ""}{starter.display_name}
                          </span>
                          <span className="text-[var(--muted-foreground)]">
                            {starter.starts_count} starts ({starter.percentage}%)
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-[var(--secondary)] overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full"
                            style={{ width: `${starter.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-[var(--muted-foreground)] py-4 text-center">
                      No conversation start records yet.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Row: Response Latency & Active Chats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Response Time Distribution */}
              <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] space-y-3 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)] flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" /> Reply Speed Breakdown
                </h3>
                <div className="grid grid-cols-2 gap-2.5 text-xs pt-1">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-emerald-500 font-bold">&lt; 1 Minute</div>
                    <div className="text-lg font-black text-[var(--foreground)] mt-1">
                      {overview.response_time_buckets.under_1_min}
                    </div>
                    <div className="text-[10px] text-[var(--muted-foreground)]">Instant replies</div>
                  </div>

                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                    <div className="text-blue-500 font-bold">1 - 5 Minutes</div>
                    <div className="text-lg font-black text-[var(--foreground)] mt-1">
                      {overview.response_time_buckets.from_1_to_5_min}
                    </div>
                    <div className="text-[10px] text-[var(--muted-foreground)]">Active chatting</div>
                  </div>

                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <div className="text-amber-500 font-bold">5 - 30 Minutes</div>
                    <div className="text-lg font-black text-[var(--foreground)] mt-1">
                      {overview.response_time_buckets.from_5_to_30_min}
                    </div>
                    <div className="text-[10px] text-[var(--muted-foreground)]">Casual replies</div>
                  </div>

                  <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                    <div className="text-purple-500 font-bold">&gt; 30 Minutes</div>
                    <div className="text-lg font-black text-[var(--foreground)] mt-1">
                      {overview.response_time_buckets.over_30_min}
                    </div>
                    <div className="text-[10px] text-[var(--muted-foreground)]">Delayed check-ins</div>
                  </div>
                </div>
              </div>

              {/* Top Active Chats */}
              <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] space-y-3 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)] flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-500" /> Busiest Channels & Direct Chats
                </h3>
                <div className="space-y-2 pt-1">
                  {overview.top_active_chats && overview.top_active_chats.length > 0 ? (
                    overview.top_active_chats.map((chat) => (
                      <div
                        key={chat.chat_id}
                        className="p-3 rounded-xl bg-[var(--background)] border border-[var(--border)] flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="p-1 rounded-lg bg-[var(--secondary)] text-primary font-bold text-[10px]">
                            {chat.type.toUpperCase()}
                          </span>
                          <span className="font-semibold text-[var(--foreground)] truncate">
                            {chat.title}
                          </span>
                        </div>
                        <span className="font-bold text-primary whitespace-nowrap">
                          {chat.message_count} msgs
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-[var(--muted-foreground)] py-4 text-center">
                      No active chats recorded.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: FUN & COMMUNITY AWARDS */}
        {!loading && !error && activeTab === "fun" && funAwards && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {/* Night Owl */}
              <div className="p-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 space-y-3 relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-3xl">🦉</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400">
                      Award
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-[var(--foreground)] mt-2">The Night Owl</h4>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                    {funAwards.night_owl.description}
                  </p>
                </div>
                <div className="pt-2 border-t border-indigo-500/20 flex items-center justify-between text-xs">
                  <span className="font-bold text-indigo-400">
                    {funAwards.night_owl.display_name || "Nobody yet"}
                  </span>
                  <span className="text-[var(--muted-foreground)]">
                    {funAwards.night_owl.value || "0 msgs"}
                  </span>
                </div>
              </div>

              {/* Early Bird */}
              <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-3 relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-3xl">🌅</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                      Award
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-[var(--foreground)] mt-2">The Early Bird</h4>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                    {funAwards.early_bird.description}
                  </p>
                </div>
                <div className="pt-2 border-t border-amber-500/20 flex items-center justify-between text-xs">
                  <span className="font-bold text-amber-400">
                    {funAwards.early_bird.display_name || "Nobody yet"}
                  </span>
                  <span className="text-[var(--muted-foreground)]">
                    {funAwards.early_bird.value || "0 msgs"}
                  </span>
                </div>
              </div>

              {/* Lightning Responder */}
              <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-3 relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-3xl">⚡</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                      Award
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-[var(--foreground)] mt-2">Lightning Responder</h4>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                    {funAwards.lightning_responder.description}
                  </p>
                </div>
                <div className="pt-2 border-t border-emerald-500/20 flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-400">
                    {funAwards.lightning_responder.display_name || "Nobody yet"}
                  </span>
                  <span className="text-[var(--muted-foreground)]">
                    {funAwards.lightning_responder.value || "—"}
                  </span>
                </div>
              </div>

              {/* Icebreaker Monarch */}
              <div className="p-4 rounded-2xl border border-pink-500/30 bg-pink-500/5 space-y-3 relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-3xl">🚀</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-400">
                      Award
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-[var(--foreground)] mt-2">Icebreaker Monarch</h4>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                    {funAwards.icebreaker_monarch.description}
                  </p>
                </div>
                <div className="pt-2 border-t border-pink-500/20 flex items-center justify-between text-xs">
                  <span className="font-bold text-pink-400">
                    {funAwards.icebreaker_monarch.display_name || "Nobody yet"}
                  </span>
                  <span className="text-[var(--muted-foreground)]">
                    {funAwards.icebreaker_monarch.value || "0 starts"}
                  </span>
                </div>
              </div>

              {/* Novel Writer */}
              <div className="p-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 space-y-3 relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-3xl">📜</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400">
                      Award
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-[var(--foreground)] mt-2">Novel Writer</h4>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                    {funAwards.novel_writer.description}
                  </p>
                </div>
                <div className="pt-2 border-t border-cyan-500/20 flex items-center justify-between text-xs">
                  <span className="font-bold text-cyan-400">
                    {funAwards.novel_writer.display_name || "Nobody yet"}
                  </span>
                  <span className="text-[var(--muted-foreground)]">
                    {funAwards.novel_writer.value || "—"}
                  </span>
                </div>
              </div>

              {/* Reaction Magnet */}
              <div className="p-4 rounded-2xl border border-purple-500/30 bg-purple-500/5 space-y-3 relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-3xl">👑</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                      Award
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-[var(--foreground)] mt-2">Reaction Magnet</h4>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                    {funAwards.reaction_magnet.description}
                  </p>
                </div>
                <div className="pt-2 border-t border-purple-500/20 flex items-center justify-between text-xs">
                  <span className="font-bold text-purple-400">
                    {funAwards.reaction_magnet.display_name || "Nobody yet"}
                  </span>
                  <span className="text-[var(--muted-foreground)]">
                    {funAwards.reaction_magnet.value || "0 reactions"}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Row: Dynamic Duo & Top Emojis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Dynamic Duo */}
              <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] space-y-3 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)] flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-primary" /> Dynamic Duo of the Server
                </h3>
                <p className="text-xs text-[var(--muted-foreground)]">
                  The two family members who exchange the most rapid back-and-forth messages:
                </p>
                {funAwards.dynamic_duo.user_1_name ? (
                  <div className="p-4 rounded-xl bg-gradient-to-r from-pink-500/10 to-indigo-500/10 border border-purple-500/30 flex items-center justify-between">
                    <div>
                      <div className="text-base font-black text-[var(--foreground)]">
                        {funAwards.dynamic_duo.user_1_name} &amp; {funAwards.dynamic_duo.user_2_name}
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
                        Exchanged {funAwards.dynamic_duo.thread_count} consecutive replies together!
                      </div>
                    </div>
                    <span className="text-3xl">👯</span>
                  </div>
                ) : (
                  <div className="text-xs text-[var(--muted-foreground)] py-4 text-center">
                    Keep chatting to unlock your server's Dynamic Duo!
                  </div>
                )}
              </div>

              {/* Top Reaction Emojis */}
              <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] space-y-3 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)] flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-rose-500" /> Top Reaction Emojis
                </h3>
                <div className="flex flex-wrap gap-2.5 pt-1">
                  {funAwards.top_emojis && funAwards.top_emojis.length > 0 ? (
                    funAwards.top_emojis.map((te, index) => (
                      <div
                        key={te.emoji}
                        className="px-3.5 py-2 rounded-xl bg-[var(--background)] border border-[var(--border)] flex items-center gap-2 text-xs"
                      >
                        <span className="text-xl">{te.emoji}</span>
                        <div>
                          <div className="font-bold text-[var(--foreground)]">{te.count} times</div>
                          <div className="text-[10px] text-[var(--muted-foreground)]">#{index + 1}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-[var(--muted-foreground)] py-4 text-center">
                      No reactions registered yet. React with emojis to start the podium!
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Year with Stovo Retrospective Modal */}
      {isWrappedOpen && (
        <YearWithStovoModal
          data={wrappedData}
          onClose={() => setIsWrappedOpen(false)}
        />
      )}
    </main>
  );
}
