import { useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, MessageSquare, Sparkles, Trophy, X } from "lucide-react";

import { YearWithStovo } from "../api/stats";

interface Props {
  data: YearWithStovo | null;
  isLoading?: boolean;
  error?: string | null;
  onClose: () => void;
}

export default function YearWithStovoModal({ data, isLoading = false, error, onClose }: Props) {
  const [slide, setSlide] = useState(0);
  const slides = data ? [
    <><span className="wrapped-badge"><MessageSquare size={15} /> The big picture</span><h2>{data.total_messages.toLocaleString()} messages together</h2><p>Every message, photo, and check-in helped keep your family close this year.</p><div className="wrapped-metrics"><Metric label="Photos" value={data.total_photos} /><Metric label="Voice notes" value={data.total_audio} /><Metric label="Files" value={data.total_files} /></div></>,
    <><span className="wrapped-badge is-warm"><Calendar size={15} /> Busiest day</span><h2>{data.busiest_day || "Your busiest day"}</h2><p>{data.busiest_day_message_count.toLocaleString()} messages made this the liveliest day on Stovo.</p></>,
    <><span className="wrapped-badge is-green"><Trophy size={15} /> Your highlight</span><h2>{data.personal_card.superpower_title || "A valued family member"}</h2><p>{data.personal_card.superpower_description || `${data.personal_card.messages_sent.toLocaleString()} messages sent this year.`}</p><div className="wrapped-personal"><span>{data.personal_card.display_name || "You"}</span><strong>{data.personal_card.messages_sent.toLocaleString()} messages sent</strong>{data.personal_card.top_chat_title && <small>Most active in {data.personal_card.top_chat_title}</small>}</div></>,
    <><span className="wrapped-badge"><Sparkles size={15} /> Family favourites</span><h2>{data.top_emoji || "❤️"} was the year’s emoji</h2><p>{data.top_emoji_count.toLocaleString()} reactions and {data.total_conversations_started.toLocaleString()} conversation starts brought your chats to life.</p>{data.dynamic_duo.user_1_name && <div className="wrapped-personal"><span>Dynamic duo</span><strong>{data.dynamic_duo.user_1_name} &amp; {data.dynamic_duo.user_2_name}</strong></div>}</>
  ] : [];
  const lastSlide = slides.length - 1;

  return <div className="wrapped-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="wrapped-modal" role="dialog" aria-modal="true" aria-labelledby="wrapped-title">
      <header className="wrapped-header"><span><Sparkles size={17} /> Year with Stovo {data?.year ?? new Date().getFullYear()}</span><button type="button" onClick={onClose} aria-label="Close Year with Stovo"><X size={20} /></button></header>
      <div className="wrapped-body" aria-busy={isLoading}>
        {isLoading && <p className="wrapped-state">Preparing your year in review…</p>}
        {!isLoading && error && <p className="wrapped-state is-error">{error}</p>}
        {!isLoading && !error && data && <><div className="wrapped-slide" id="wrapped-title">{slides[slide]}</div><footer className="wrapped-footer"><div className="wrapped-dots">{slides.map((_, index) => <button key={index} type="button" className={index === slide ? "is-active" : undefined} onClick={() => setSlide(index)} aria-label={`Show highlight ${index + 1}`} />)}</div><div><button type="button" className="wrapped-nav" onClick={() => setSlide((current) => Math.max(0, current - 1))} disabled={slide === 0} aria-label="Previous highlight"><ChevronLeft size={18} /></button><button type="button" className="wrapped-next" onClick={() => setSlide((current) => current === lastSlide ? 0 : current + 1)}>{slide === lastSlide ? "Replay" : "Next"}<ChevronRight size={16} /></button></div></footer></>}
      </div>
    </section>
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div><span>{label}</span><strong>{value.toLocaleString()}</strong></div>;
}
