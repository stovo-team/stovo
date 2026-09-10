import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Check, Clock3, Copy, DoorOpen, Link } from "lucide-react";
import type { Chat } from "../../../api/chats";
import { sendMessage } from "../../../api/chats";
import { createGuestMeeting } from "../../../api/guestMeetings";
import { encryptMessageContent } from "../../../api/messageCrypto";
import { IconGoogleCalendar } from "../../../components/icons/IconGoogleCalendar";
import { GuestMeetingSelect } from "./GuestMeetingSelect";

export function GuestMeetingLinkControl({ accessToken, chatId, sourceChat, currentUserId, enabled, initialTitle = "", calendarStart, calendarEnd }: { accessToken: string | null; chatId: string | null; sourceChat?: Chat | null; currentUserId?: string; enabled: boolean; initialTitle?: string; calendarStart?: string; calendarEnd?: string }) {
  const [title, setTitle] = useState(initialTitle);
  const [mode, setMode] = useState<"immediate" | "lobby">("immediate");
  const [duration, setDuration] = useState("24");
  const [customExpiry, setCustomExpiry] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1_600);
    return () => window.clearTimeout(timeout);
  }, [copied]);
  if (!enabled || !accessToken || !chatId) return null;
  const memberToken = accessToken;
  const sourceChatId = chatId;
  async function create() {
    setLoading(true); setError(null);
    try {
      const expiresAt = duration === "custom" ? new Date(customExpiry).toISOString() : new Date(Date.now() + Number(duration) * 60 * 60 * 1000).toISOString();
      if (Number.isNaN(new Date(expiresAt).getTime()) || new Date(expiresAt) <= new Date()) throw new Error("Choose a future expiry date");
      if (!title.trim()) throw new Error("Enter a meeting name");
      const planned = calendarStart ? new Date(calendarStart) : null;
      const scheduledAt = planned && Number.isFinite(planned.getTime()) ? planned.toISOString() : undefined;
      const meeting = await createGuestMeeting(memberToken, { chatId: sourceChatId, title: title.trim(), scheduledAt, admissionMode: mode, expiresAt });
      setUrl(meeting.meetingUrl);
      if (sourceChat) {
        const timing = meeting.scheduledAt
          ? `Planned for ${new Date(meeting.scheduledAt).toLocaleString()}.`
          : "Starts when the host opens the meeting.";
        const entry = meeting.admissionMode === "immediate"
          ? "Anyone with this link can join."
          : "Guests wait for host approval before joining.";
        const announcement = `Guest meeting: ${meeting.title}\n${timing}\n${entry}\nJoin: ${meeting.meetingUrl}`;
        const encrypted = await encryptMessageContent(sourceChat, announcement, currentUserId);
        await sendMessage(memberToken, sourceChat.id, encrypted.content, [], null, null, encrypted.encryption);
      }
      await navigator.clipboard?.writeText(meeting.meetingUrl);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create guest link"); } finally { setLoading(false); }
  }
  const meetingDates = () => {
    const start = calendarStart ? new Date(calendarStart) : new Date();
    const end = calendarEnd ? new Date(calendarEnd) : duration === "custom" ? new Date(customExpiry) : new Date(Date.now() + Number(duration) * 60 * 60 * 1000);
    return { start, end };
  };
  const addToGoogleCalendar = () => {
    if (!url) return;
    const { start, end } = meetingDates();
    const utc = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const params = new URLSearchParams({ action: "TEMPLATE", text: title.trim(), details: `Join meeting: ${url}`, location: url, dates: `${utc(start)}/${utc(end)}` });
    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, "_blank", "noopener,noreferrer");
  };
  const addToPlans = () => {
    if (!url) return;
    window.sessionStorage.setItem("stovo:plan-draft", JSON.stringify({ title: title.trim(), notes: `Join meeting: ${url}`, sourceChatId }));
    navigate("/app/plans");
  };
  const copyLink = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch { setError("Could not copy the meeting link"); }
  };
  return <div className="guest-link-control">
    <label className="guest-link-field"><span>Meeting name</span><input autoFocus value={title} maxLength={120} placeholder="e.g. Design review" onChange={(e) => setTitle(e.target.value)} /></label>
    <div className="guest-link-settings">
      <label className="guest-link-field"><span><DoorOpen size={15} /> Guest entry</span><GuestMeetingSelect ariaLabel="Guest entry" value={mode} onChange={(value) => setMode(value as "immediate" | "lobby")} options={[{ value: "immediate", label: "Anyone with link" }, { value: "lobby", label: "Host approval" }]} /></label>
      <label className="guest-link-field"><span><Clock3 size={15} /> Link expires</span><GuestMeetingSelect ariaLabel="Link expires" value={duration} onChange={setDuration} options={[{ value: "1", label: "In 1 hour" }, { value: "24", label: "In 24 hours" }, { value: "168", label: "In 7 days" }, { value: "custom", label: "Choose date & time" }]} /></label>
    </div>
    {duration === "custom" && <label className="guest-link-field guest-link-custom-date"><span><Clock3 size={15} /> Expiry date and time</span><input type="datetime-local" value={customExpiry} onChange={(e) => setCustomExpiry(e.target.value)} /></label>}
    <button type="button" className="guest-link-create-button" onClick={() => void create()} disabled={loading}><Link size={17} />{loading ? "Creating meeting link…" : "Create meeting link"}</button>
    {url && <div className="guest-link-result"><button type="button" className={`icon-button subtle guest-link-copy-button${copied ? " copied" : ""}`} aria-label={copied ? "Meeting link copied" : "Copy meeting link"} onClick={() => void copyLink()}>{copied ? <Check size={18} /> : <Copy size={17} />}</button><div><strong>Link ready</strong><code>{url}</code></div><span className="visually-hidden" role="status" aria-live="polite">{copied ? "Meeting link copied" : ""}</span><div className="guest-link-result-actions"><button type="button" className="secondary-button guest-link-plan-button" onClick={addToPlans}><CalendarDays size={17} /> Add to Plans</button><button type="button" className="secondary-button guest-link-calendar-button" onClick={addToGoogleCalendar}><IconGoogleCalendar size={18} /> Add to Google Calendar</button></div></div>}
    {error && <p className="error-text">{error}</p>}
  </div>;
}
