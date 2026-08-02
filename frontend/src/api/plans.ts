import { apiRequest } from "./client";

export type PlanRSVP = "going" | "maybe" | "declined";
export type PlanRecurrence = "daily" | "weekly" | "monthly" | null;

export interface PlanAttendee { userId: string; status: PlanRSVP; }
export interface Plan {
  id: string; familyId: string; title: string; notes?: string | null; location?: string | null;
  startsAt: string; endsAt: string; allDay: boolean; timeZone: string; recurrence?: PlanRecurrence;
  createdBy: string; sourceChatId?: string | null; revision: number; createdAt: string; updatedAt: string;
  attendees: PlanAttendee[];
}
export interface PlanDraft {
  title: string; notes?: string; location?: string; startsAt: string; endsAt: string; allDay: boolean;
  timeZone: string; recurrence?: PlanRecurrence; attendeeIds: string[]; sourceChatId?: string;
}

export function getPlans(accessToken: string, start: Date, end: Date) {
  return apiRequest<Plan[]>(`/api/plans?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`, { accessToken });
}
export function createPlan(accessToken: string, draft: PlanDraft) {
  return apiRequest<Plan>("/api/plans", { method: "POST", accessToken, body: draft });
}
export function rsvpPlan(accessToken: string, planId: string, status: PlanRSVP) {
  return apiRequest<Plan>(`/api/plans/${encodeURIComponent(planId)}/rsvp`, { method: "POST", accessToken, body: { status } });
}
