import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CirclePlus, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { createPlan, getPlans, Plan, PlanDraft, PlanRSVP, rsvpPlan } from "../api/plans";
import { useAuth } from "../auth/AuthContext";
import AppNav from "./AppNav";

type View = "today" | "week" | "month";
const dayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const formatDay = (date: Date) => new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(date);
const formatTime = (value: string) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));

export default function PlansPage() {
  const { accessToken, currentUser } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("today");
  const [selectedDay, setSelectedDay] = useState(dayStart(new Date()));
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<PlanDraft>(() => ({ title: "", startsAt: new Date().toISOString().slice(0, 16), endsAt: new Date(Date.now() + 3_600_000).toISOString().slice(0, 16), allDay: false, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", attendeeIds: [] }));
  const canCreate = currentUser?.role !== "child";
  const range = useMemo(() => {
    if (view === "today") return [selectedDay, addDays(selectedDay, 1)] as const;
    if (view === "week") return [addDays(selectedDay, -selectedDay.getDay() + 1), addDays(selectedDay, 7 - selectedDay.getDay() + 1)] as const;
    return [new Date(selectedDay.getFullYear(), selectedDay.getMonth(), 1), new Date(selectedDay.getFullYear(), selectedDay.getMonth() + 1, 1)] as const;
  }, [selectedDay, view]);
  const load = useCallback(async () => { if (!accessToken) return; setLoading(true); setError(null); try { setPlans(await getPlans(accessToken, range[0], range[1])); } catch (err) { setError(err instanceof ApiError ? err.message : "Could not load plans"); } finally { setLoading(false); } }, [accessToken, range]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const raw = window.sessionStorage.getItem("stovo:plan-draft");
    if (!raw) return;
    window.sessionStorage.removeItem("stovo:plan-draft");
    try {
      const saved = JSON.parse(raw) as { title?: string; durationMinutes?: number; sourceChatId?: string };
      const start = new Date();
      const end = new Date(start.getTime() + (saved.durationMinutes ?? 60) * 60_000);
      setDraft((current) => ({ ...current, title: saved.title ?? current.title, startsAt: start.toISOString().slice(0, 16), endsAt: end.toISOString().slice(0, 16), sourceChatId: saved.sourceChatId }));
      setDialogOpen(true);
    } catch { /* discard malformed transient draft */ }
  }, []);
  const visiblePlans = plans.filter((plan) => plan.title.toLowerCase().includes(query.trim().toLowerCase()));
  async function submit(event: FormEvent) { event.preventDefault(); if (!accessToken) return; try { await createPlan(accessToken, { ...draft, startsAt: new Date(draft.startsAt).toISOString(), endsAt: new Date(draft.endsAt).toISOString() }); setDialogOpen(false); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : "Could not create plan"); } }
  async function rsvp(plan: Plan, status: PlanRSVP) { if (!accessToken) return; try { await rsvpPlan(accessToken, plan.id, status); await load(); } catch { setError("Could not update RSVP"); } }
  const calendarStart = addDays(selectedDay, (selectedDay.getDay() + 6) % 7 * -1);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(calendarStart, index));
  return <main className="app-shell app-frame plans-page"><AppNav /><section className="plans-layout" aria-busy={loading}>
    <aside className="plans-sidebar"><p className="eyebrow">Family plans</p><h1>Plans</h1><label className="plans-search"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a plan" aria-label="Find a plan" /></label><div className="plans-tabs">{(["today", "week", "month"] as View[]).map((item) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item === "week" ? "This week" : item[0].toUpperCase() + item.slice(1)}</button>)}</div><p className="plans-list-label">{view === "today" ? "Today" : "Upcoming"}</p>{visiblePlans.map((plan) => <button className="plans-sidebar-row" key={plan.id} onClick={() => setSelectedDay(dayStart(new Date(plan.startsAt)))}><time>{new Intl.DateTimeFormat(undefined,{weekday:"short",day:"numeric"}).format(new Date(plan.startsAt))}</time><span>{plan.title}</span></button>)}{!loading && visiblePlans.length === 0 && <p className="plans-muted">No plans in this range.</p>}</aside>
    <section className={`plans-content plans-content--${view}`}><header className="plans-header"><button aria-label="Previous" onClick={() => setSelectedDay(addDays(selectedDay, view === "month" ? -30 : -1))}><ChevronLeft /></button><h2>{view === "month" ? new Intl.DateTimeFormat(undefined,{month:"long",year:"numeric"}).format(selectedDay) : formatDay(selectedDay)}</h2><button aria-label="Next" onClick={() => setSelectedDay(addDays(selectedDay, view === "month" ? 30 : 1))}><ChevronRight /></button></header>{error && <p className="error-text" role="alert">{error}</p>}
    {view === "month" ? <div className="plans-month" role="grid">{Array.from({length:31},(_,index)=>addDays(new Date(selectedDay.getFullYear(),selectedDay.getMonth(),1),index)).filter((date)=>date.getMonth()===selectedDay.getMonth()).map((date)=><button key={date.toISOString()} className={sameDay(date,selectedDay)?"selected":""} onClick={()=>{setSelectedDay(date);setView("today");}}><time>{date.getDate()}</time>{plans.some((plan)=>sameDay(new Date(plan.startsAt),date))&&<i/>}</button>)}</div> : <div className="plans-agenda"><div className="plans-week-strip" aria-label="Week calendar">{weekDays.map((day)=><button className={sameDay(day,selectedDay)?"active":""} key={day.toISOString()} onClick={()=>setSelectedDay(day)}><small>{new Intl.DateTimeFormat(undefined,{weekday:"short"}).format(day)}</small>{day.getDate()}</button>)}</div>{loading ? <p className="plans-empty">Loading plans…</p> : visiblePlans.map((plan)=><article className="plan-row" key={plan.id}><time>{plan.allDay?"All day":formatTime(plan.startsAt)}</time><div><strong>{plan.title}</strong>{plan.location&&<small>{plan.location}</small>}{plan.sourceChatId&&<button className="plan-chat-link" onClick={()=>navigate(`/app/chats/${plan.sourceChatId}`)}>Open chat</button>}</div><div className="plan-rsvp"><span>{plan.attendees.filter((entry)=>entry.status==="going").length} going</span><button onClick={()=>void rsvp(plan,"going")}>Going</button><button onClick={()=>void rsvp(plan,"maybe")}>Maybe</button></div></article>)}</div>}
    {view === "today" && !loading && visiblePlans.length === 0 && <p className="plans-today-empty">No plans yet</p>}
    <div className="plans-composer"><span>Create a plan</span><button disabled={!canCreate} onClick={()=>setDialogOpen(true)} aria-label="Create plan"><CirclePlus /></button></div></section>
  </section>{dialogOpen && <div className="plans-dialog-backdrop" role="presentation" onMouseDown={()=>setDialogOpen(false)}><form className="plans-dialog" onSubmit={submit} onMouseDown={(event)=>event.stopPropagation()}><button type="button" className="plans-dialog-close" onClick={()=>setDialogOpen(false)} aria-label="Close"><X /></button><h2>New plan</h2><label>Title<input autoFocus required value={draft.title} onChange={(e)=>setDraft({...draft,title:e.target.value})}/></label><label>Starts<input required type="datetime-local" value={draft.startsAt} onChange={(e)=>setDraft({...draft,startsAt:e.target.value})}/></label><label>Ends<input required type="datetime-local" value={draft.endsAt} onChange={(e)=>setDraft({...draft,endsAt:e.target.value})}/></label><label>Location<input value={draft.location??""} onChange={(e)=>setDraft({...draft,location:e.target.value})}/></label><button type="submit">Create plan</button></form></div>}</main>;
}
