import React from "react";
import { ChatStats } from "../api/stats";
import { X, MessageCircle, Image, Users, Zap, Clock } from "lucide-react";

interface Props {
  stats: ChatStats | null;
  chatTitle?: string;
  onClose: () => void;
}

export default function ChatStatsDrawer({ stats, chatTitle, onClose }: Props) {
  if (!stats) return null;

  const maxHour = Math.max(...stats.messages_by_hour, 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]/50">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              <span className="text-primary">📊</span> Chat Insights
            </h3>
            <p className="text-xs text-[var(--muted-foreground)] truncate max-w-[280px]">
              {chatTitle || "Chat Statistics"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-3 rounded-xl bg-[var(--background)]/60 border border-[var(--border)]">
              <MessageCircle className="w-4 h-4 mx-auto text-primary mb-1" />
              <div className="text-xs text-[var(--muted-foreground)] font-medium">Messages</div>
              <div className="text-lg font-bold mt-0.5">{stats.total_messages.toLocaleString()}</div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--background)]/60 border border-[var(--border)]">
              <Image className="w-4 h-4 mx-auto text-pink-500 mb-1" />
              <div className="text-xs text-[var(--muted-foreground)] font-medium">Media</div>
              <div className="text-lg font-bold mt-0.5">{stats.total_media.toLocaleString()}</div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--background)]/60 border border-[var(--border)]">
              <Users className="w-4 h-4 mx-auto text-indigo-500 mb-1" />
              <div className="text-xs text-[var(--muted-foreground)] font-medium">Members</div>
              <div className="text-lg font-bold mt-0.5">{stats.total_members}</div>
            </div>
          </div>

          {/* Speed & Responsiveness */}
          <div className="p-3.5 rounded-xl bg-[var(--secondary)]/40 border border-[var(--border)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-500" /> Avg Response Time:
              </span>
              <strong className="text-amber-500 font-bold">
                {stats.avg_response_time_seconds > 0 ? `${stats.avg_response_time_seconds}s` : "Instant"}
              </strong>
            </div>

            {stats.fastest_responder_name && (
              <div className="flex items-center justify-between text-xs pt-1 border-t border-[var(--border)]">
                <span className="font-semibold flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-emerald-500" /> Fastest Responder:
                </span>
                <span className="text-emerald-500 font-medium">
                  {stats.fastest_responder_name} ({stats.fastest_responder_speed}s)
                </span>
              </div>
            )}
          </div>

          {/* Hourly distribution */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              Activity by Hour (24h)
            </h4>
            <div className="h-20 flex items-end gap-1 pt-2 pb-1 border-b border-[var(--border)]">
              {stats.messages_by_hour.map((cnt, hour) => {
                const heightPct = Math.round((cnt / maxHour) * 100);
                return (
                  <div
                    key={hour}
                    className="flex-1 bg-primary/30 hover:bg-primary transition-all rounded-t relative group"
                    style={{ height: `${Math.max(heightPct, 6)}%` }}
                    title={`${hour}:00 - ${cnt} messages`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-[var(--muted-foreground)]">
              <span>12 AM</span>
              <span>6 AM</span>
              <span>12 PM</span>
              <span>6 PM</span>
              <span>11 PM</span>
            </div>
          </div>

          {/* Top Members in this Chat */}
          {stats.top_members && stats.top_members.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                Most Active Members
              </h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {stats.top_members.map((m) => (
                  <div
                    key={m.user_id}
                    className="p-2 rounded-lg bg-[var(--background)]/40 border border-[var(--border)] flex items-center justify-between text-xs"
                  >
                    <span className="font-medium truncate max-w-[180px]">{m.display_name}</span>
                    <span className="text-[var(--muted-foreground)] font-semibold">
                      {m.message_count} msgs
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
