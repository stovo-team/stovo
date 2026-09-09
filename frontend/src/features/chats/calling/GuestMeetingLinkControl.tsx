import { useState } from "react";
import { Link } from "lucide-react";
import { createGuestMeeting } from "../../../api/guestMeetings";

export function GuestMeetingLinkControl({ accessToken, chatId, enabled }: { accessToken: string | null; chatId: string | null; enabled: boolean }) {
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
      const meeting = await createGuestMeeting(memberToken, { chatId: sourceChatId, admissionMode: mode, expiresAt });
      setUrl(meeting.meetingUrl);
      await navigator.clipboard?.writeText(meeting.meetingUrl);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create guest link"); } finally { setLoading(false); }
  }
  return <div className="guest-link-control"><strong><Link size={16} /> Guest meeting link</strong><div className="guest-link-control-options"><label>Entry<select value={mode} onChange={(e) => setMode(e.target.value as "immediate" | "lobby")}><option value="immediate">Join immediately</option><option value="lobby">Host admission</option></select></label><label>Expires<select value={duration} onChange={(e) => setDuration(e.target.value)}><option value="1">1 hour</option><option value="24">24 hours</option><option value="168">7 days</option><option value="custom">Custom</option></select></label>{duration === "custom" && <label>Custom expiry<input type="datetime-local" value={customExpiry} onChange={(e) => setCustomExpiry(e.target.value)} /></label>}<button type="button" className="action-button subtle" onClick={() => void create()} disabled={loading}>{loading ? "Creating…" : "Create link"}</button></div>{url && <><code>{url}</code><button type="button" className="action-button subtle" onClick={() => void navigator.clipboard?.writeText(url)}>Copy link</button></>}{error && <p className="error-text">{error}</p>}</div>;
}
