import React, { useState } from "react";
import { YearWithStovo } from "../api/stats";
import { X, ChevronLeft, ChevronRight, Sparkles, Trophy, Zap, Heart, MessageSquare, Calendar, Award } from "lucide-react";

interface Props {
  data: YearWithStovo | null;
  onClose: () => void;
}

export default function YearWithStovoModal({ data, onClose }: Props) {
  const [slide, setSlide] = useState(0);

  if (!data) return null;

  const totalSlides = 5;

  const nextSlide = () => setSlide((prev) => (prev + 1) % totalSlides);
  const prevSlide = () => setSlide((prev) => (prev - 1 + totalSlides) % totalSlides);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-purple-500/40 bg-gradient-to-br from-slate-950 via-purple-950 to-indigo-950 text-white shadow-2xl">
        {/* Background glow accents */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-pink-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Top bar */}
        <div className="relative z-10 flex items-center justify-between p-5 border-b border-purple-500/20">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-300 animate-spin-slow" />
            <span className="text-xs uppercase tracking-widest font-bold text-purple-300">
              Year with Stovo {data.year}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-purple-300 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Slide Body */}
        <div className="relative z-10 p-6 min-h-[380px] flex flex-col justify-between">
          {/* Slide 0: The Big Numbers */}
          {slide === 0 && (
            <div className="space-y-4 animate-fade-in">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                <MessageSquare className="w-3.5 h-3.5" /> Annual Milestones
              </span>
              <h2 className="text-3xl font-black tracking-tight text-white leading-tight">
                Together, your family exchanged{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-purple-300 to-indigo-300">
                  {data.total_messages.toLocaleString()} messages
                </span>
                !
              </h2>
              <p className="text-sm text-purple-200/80">
                Memories, laugh-out-loud moments, and daily check-ins on Stovo kept everyone connected all year long.
              </p>

              <div className="grid grid-cols-3 gap-2.5 pt-4">
                <div className="p-3 rounded-2xl bg-white/5 border border-purple-500/20 text-center">
                  <div className="text-xs text-purple-300 font-medium">Photos</div>
                  <div className="text-xl font-bold mt-1 text-white">{data.total_photos}</div>
                </div>
                <div className="p-3 rounded-2xl bg-white/5 border border-purple-500/20 text-center">
                  <div className="text-xs text-purple-300 font-medium">Voice Notes</div>
                  <div className="text-xl font-bold mt-1 text-white">{data.total_audio}</div>
                </div>
                <div className="p-3 rounded-2xl bg-white/5 border border-purple-500/20 text-center">
                  <div className="text-xs text-purple-300 font-medium">Files</div>
                  <div className="text-xl font-bold mt-1 text-white">{data.total_files}</div>
                </div>
              </div>
            </div>
          )}

          {/* Slide 1: Busiest Day */}
          {slide === 1 && (
            <div className="space-y-4 animate-fade-in">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <Calendar className="w-3.5 h-3.5" /> Busiest Day of the Year
              </span>
              <h2 className="text-3xl font-black text-white leading-tight">
                {data.busiest_day || "A Special Day"}, <br />
                <span className="text-amber-300">
                  {data.busiest_day_message_count} Messages in 24h!
                </span>
              </h2>
              <p className="text-sm text-purple-200/80">
                On this day, the family chat was absolutely buzzing with excitement, photos, and non-stop replies.
              </p>
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
                <span className="text-3xl">🔥</span>
                <div className="text-xs text-amber-200">
                  <strong>Chat was unstoppable:</strong> You exchanged more messages on this day than any other day in {data.year}!
                </div>
              </div>
            </div>
          )}

          {/* Slide 2: Personal Superpower */}
          {slide === 2 && (
            <div className="space-y-4 animate-fade-in">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <Trophy className="w-3.5 h-3.5" /> Your Personal Title
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white">
                You are{" "}
                <span className="text-emerald-300">
                  {data.personal_card.superpower_title}
                </span>
              </h2>
              <p className="text-sm text-purple-200/90 leading-relaxed">
                {data.personal_card.superpower_description}
              </p>

              <div className="p-3.5 rounded-2xl bg-white/5 border border-emerald-500/30 space-y-2 text-xs">
                <div className="flex justify-between text-purple-200">
                  <span>Messages Sent:</span>
                  <strong className="text-white">{data.personal_card.messages_sent}</strong>
                </div>
                {data.personal_card.avg_response_time_seconds > 0 && (
                  <div className="flex justify-between text-purple-200">
                    <span>Average Reply Speed:</span>
                    <strong className="text-emerald-300">{data.personal_card.avg_response_time_seconds}s</strong>
                  </div>
                )}
                {data.personal_card.top_chat_title && (
                  <div className="flex justify-between text-purple-200">
                    <span>Favorite Chat:</span>
                    <strong className="text-white">{data.personal_card.top_chat_title}</strong>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Slide 3: Icebreaker & Favorites */}
          {slide === 3 && (
            <div className="space-y-4 animate-fade-in">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-pink-500/20 text-pink-300 border border-pink-500/30">
                <Heart className="w-3.5 h-3.5" /> Community Highlights
              </span>
              <h2 className="text-2xl font-black text-white">
                The Glue of the Family
              </h2>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-3.5 rounded-2xl bg-white/5 border border-purple-500/20 space-y-1">
                  <div className="text-[11px] text-purple-300 font-medium">🚀 Icebreaker Monarch</div>
                  <div className="text-sm font-bold text-white truncate">
                    {data.top_conversation_starter_name || "Family Member"}
                  </div>
                  <div className="text-[10px] text-purple-300/80">
                    Started {data.top_conversation_starts} chats after quiet lulls
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/5 border border-purple-500/20 space-y-1 text-center">
                  <div className="text-[11px] text-purple-300 font-medium">Server Emoji</div>
                  <div className="text-3xl font-black">{data.top_emoji || "❤️"}</div>
                  <div className="text-[10px] text-purple-300/80">
                    Used {data.top_emoji_count} times
                  </div>
                </div>
              </div>

              {data.dynamic_duo.user_1_name && (
                <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between text-xs">
                  <div>
                    <div className="text-[10px] text-indigo-300 uppercase font-semibold">Dynamic Duo</div>
                    <div className="font-bold text-white">
                      {data.dynamic_duo.user_1_name} & {data.dynamic_duo.user_2_name}
                    </div>
                  </div>
                  <span className="text-sm">👯</span>
                </div>
              )}
            </div>
          )}

          {/* Slide 4: Shareable Card */}
          {slide === 4 && (
            <div className="space-y-4 text-center animate-fade-in">
              <div className="inline-block p-4 rounded-3xl bg-gradient-to-tr from-pink-500/20 via-purple-500/20 to-indigo-500/20 border border-purple-500/40 text-left space-y-3 w-full">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-purple-300">
                    ✨ Year with Stovo {data.year}
                  </span>
                  <span className="text-sm">💬</span>
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">
                    {data.personal_card.display_name} • {data.personal_card.superpower_title}
                  </h3>
                  <p className="text-xs text-purple-200 mt-0.5">
                    {data.personal_card.messages_sent} messages • {data.total_messages} server total
                  </p>
                </div>
                <div className="pt-2 border-t border-purple-500/20 flex justify-between text-[11px] text-purple-300">
                  <span>Server Emoji: {data.top_emoji}</span>
                  <span>Fastest Reply: {data.personal_card.avg_response_time_seconds}s</span>
                </div>
              </div>

              <p className="text-xs text-purple-300/80">
                Here's to another wonderful year together on Stovo! 🥂
              </p>
            </div>
          )}

          {/* Progress dots & controls */}
          <div className="pt-6 border-t border-purple-500/20 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalSlides }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSlide(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === slide ? "w-6 bg-white" : "w-2 bg-white/30 hover:bg-white/50"
                  }`}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={prevSlide}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                aria-label="Previous slide"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={nextSlide}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:brightness-110 text-white text-xs font-bold transition-all shadow-lg flex items-center gap-1"
              >
                {slide === totalSlides - 1 ? "Replay ↺" : "Next →"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
