import { getApiUrl } from "./client";

export type GuestMeetingPreview = { title: string; scheduledAt?: string | null; admissionMode: "immediate" | "lobby"; expiresAt: string; guestCount: number; guestLimit: number; screenShareBitrateKbps?: number };
export type GuestMeetingStatus = { displayName: string; state: "waiting" | "admitted" | "blocked" };
export type GuestMeetingSession = { id: string; state: "waiting" | "admitted" };

export class GuestMeetingLinkError extends Error {
  constructor(message: string, readonly code?: string) { super(message); this.name = "GuestMeetingLinkError"; }
}

async function publicRequest<T>(token: string, path = "", init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getApiUrl()}/api/guest-meetings/public/${encodeURIComponent(token)}${path}`, {
    credentials: "include",
    headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    ...init
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new GuestMeetingLinkError(data?.message ?? "Meeting link is unavailable", data?.code);
  }
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}

export const previewGuestMeeting = (token: string) => publicRequest<GuestMeetingPreview>(token);
export const createGuestMeetingSession = (token: string, displayName: string) => publicRequest<GuestMeetingSession>(token, "/sessions", { method: "POST", body: JSON.stringify({ displayName }) });
export const leaveGuestMeetingSession = (token: string, sessionId: string) => publicRequest<void>(token, "/leave", { method: "POST", body: JSON.stringify({ sessionId }), keepalive: true });
export const getGuestMeetingStatus = (token: string) => publicRequest<GuestMeetingStatus>(token, "/status");
export const getGuestMeetingToken = (token: string) => publicRequest<{ url: string; token: string; roomName?: string }>(token, "/token", { method: "POST" });
export type GuestMeetingIntelligenceStatus = { notesState: string; notesDuration?: number; recordingState: string; recordingDuration?: number };
export const getGuestMeetingIntelligence = (token: string) => publicRequest<GuestMeetingIntelligenceStatus>(token, "/intelligence");

export type GuestMeetingCreated = { id: string; title: string; scheduledAt?: string | null; admissionMode: "immediate" | "lobby"; expiresAt: string; meetingUrl: string; guestLimit: number };
export async function createGuestMeeting(accessToken: string, input: { chatId: string; title: string; scheduledAt?: string; admissionMode: "immediate" | "lobby"; expiresAt: string }) {
  const response = await fetch(`${getApiUrl()}/api/guest-meetings`, { method: "POST", credentials: "include", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(input) });
  if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(data?.message ?? "Could not create guest meeting"); }
  return response.json() as Promise<GuestMeetingCreated>;
}
