import { useState } from "react";
import { CalendarPlus, Check, Clock3, Copy, DoorOpen, Link } from "lucide-react";
import { createGuestMeeting } from "../../../api/guestMeetings";

export function GuestMeetingLinkControl({ accessToken, chatId, enabled, initialTitle = "", calendarStart, calendarEnd }: { accessToken: string | null; chatId: string | null; enabled: boolean; initialTitle?: string; calendarStart?: string; calendarEnd?: string }) {
  const [title, setTitle] = useState(initialTitle);
  const [mode, setMode] = useState<"immediate" | "lobby">("immediate");
  const [duration, setDuration] = useState("24");
  const [customExpiry, setCustomExpiry] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (!enabled || !accessToken || !chatId) return null;
  const memberToken = accessToken;
  const sourceChatId = chatId;
  async function create() {
    setLoading(true); setError(null);
    try {
      const expiresAt = duration === "custom" ? new Date(customExpiry).toISOString() : new Date(Date.now() + Number(duration) * 60 * 60 * 1000).toISOString();
      if (Number.isNaN(new Date(expiresAt).getTime()) || new Date(expiresAt) <= new Date()) throw new Error("Choose a future expiry date");
      if (!title.trim()) throw new Error("Enter a meeting name");
      const meeting = await createGuestMeeting(memberToken, { chatId: sourceChatId, title: title.trim(), admissionMode: mode, expiresAt });
      setUrl(meeting.meetingUrl);
      await navigator.clipboard?.writeText(meeting.meetingUrl);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create guest link"); } finally { setLoading(false); }
  }
  const addToGoogleCalendar = () => {
    if (!url) return;
    const start = calendarStart ? new Date(calendarStart) : new Date();
    const end = calendarEnd ? new Date(calendarEnd) : duration === "custom" ? new Date(customExpiry) : new Date(Date.now() + Number(duration) * 60 * 60 * 1000);
    const utc = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const params = new URLSearchParams({ action: "TEMPLATE", text: title.trim(), details: `Join meeting: ${url}`, location: url, dates: `${utc(start)}/${utc(end)}` });
    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, "_blank", "noopener,noreferrer");
  };
  return <div className="guest-link-control">
    <label className="guest-link-field"><span>Meeting name</span><input autoFocus value={title} maxLength={120} placeholder="e.g. Design review" onChange={(e) => setTitle(e.target.value)} /></label>
    <div className="guest-link-settings">
      <label className="guest-link-field"><span><DoorOpen size={15} /> Guest entry</span><select value={mode} onChange={(e) => setMode(e.target.value as "immediate" | "lobby")}><option value="immediate">Anyone with link</option><option value="lobby">Host approval</option></select><small>{mode === "immediate" ? "Guests enter right away." : "Guests wait until you let them in."}</small></label>
      <label className="guest-link-field"><span><Clock3 size={15} /> Link expires</span><select value={duration} onChange={(e) => setDuration(e.target.value)}><option value="1">In 1 hour</option><option value="24">In 24 hours</option><option value="168">In 7 days</option><option value="custom">Choose date & time</option></select><small>Expired links cannot be used.</small></label>
    </div>
    {duration === "custom" && <label className="guest-link-field guest-link-custom-date"><span><Clock3 size={15} /> Expiry date and time</span><input type="datetime-local" value={customExpiry} onChange={(e) => setCustomExpiry(e.target.value)} /></label>}
    <button type="button" className="guest-link-create-button" onClick={() => void create()} disabled={loading}><Link size={17} />{loading ? "Creating meeting link…" : "Create meeting link"}</button>
    {url && <div className="guest-link-result"><span className="guest-link-result-icon"><Check size={17} /></span><div><strong>Link ready</strong><code>{url}</code></div><button type="button" className="icon-button subtle" aria-label="Copy meeting link" onClick={() => void navigator.clipboard?.writeText(url)}><Copy size={17} /></button><button type="button" className="secondary-button guest-link-calendar-button" onClick={addToGoogleCalendar}><CalendarPlus size={16} /> Add to Google Calendar</button></div>}
    {error && <p className="error-text">{error}</p>}
  </div>;
}
