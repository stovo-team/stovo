import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import { User } from "../api/auth";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { getMembers } from "../api/family";
import { createPlan, getPlans, Plan, PlanDraft, PlanRSVP, rsvpPlan } from "../api/plans";
import { useAuth } from "../auth/AuthContext";
import { RealAvatar } from "../features/chats/sidebar/RealAvatar";
import AppNav from "./AppNav";
import { useStrings } from "../i18n/LanguageContext";

type View = "today" | "week" | "month";
const dayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const formatDay = (date: Date) => new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(date);
const formatTime = (value: string) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));

const TODAY_TIME_SLOT_HOURS = 3;
export const TODAY_TIME_SLOTS = [0, 3, 6, 9, 12, 15, 18, 21] as const;

export function formatSlotTime(hour: number) {
  const date = new Date(2000, 0, 1, hour, 0);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function toLocalIso(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getDefaultPlanTimes() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 3_600_000);
  return {
    startsAt: toLocalIso(start),
    endsAt: toLocalIso(end)
  };
}

function renderPlanNotes(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, index) =>
    urlRegex.test(part) ? (
      <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="plan-note-link">
        {part}
      </a>
    ) : (
      <span key={index}>{part}</span>
    )
  );
}

export default function PlansPage() {
  const strings = useStrings();
  const { accessToken, currentUser } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("today");

  const [selectedDay, setSelectedDay] = useState(dayStart(new Date()));
  const [plans, setPlans] = useState<Plan[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [profilePreviewMemberId, setProfilePreviewMemberId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<PlanDraft>(() => {
    const defaults = getDefaultPlanTimes();
    return {
      title: "",
      notes: "",
      location: "",
      startsAt: defaults.startsAt,
      endsAt: defaults.endsAt,
      allDay: false,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      attendeeIds: []
    };
  });
  const canCreate = currentUser?.role !== "child";
  const range = useMemo(() => {
    if (view === "today") return [selectedDay, addDays(selectedDay, 1)] as const;
    if (view === "week") {
      const dayOffset = (selectedDay.getDay() + 6) % 7;
      const startOfWeek = addDays(selectedDay, -dayOffset);
      return [startOfWeek, addDays(startOfWeek, 7)] as const;
    }
    return [new Date(selectedDay.getFullYear(), selectedDay.getMonth(), 1), new Date(selectedDay.getFullYear(), selectedDay.getMonth() + 1, 1)] as const;
  }, [selectedDay, view]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      setPlans(await getPlans(accessToken, range[0], range[1]));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load plans");
    } finally {
      setLoading(false);
    }
  }, [accessToken, range]);

  const loadSilent = useCallback(async () => {
    if (!accessToken) return;
    try {
      const updated = await getPlans(accessToken, range[0], range[1]);
      setPlans(updated);
    } catch { /* preserve optimistic update on transient fail */ }
  }, [accessToken, range]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void getMembers(accessToken)
      .then((loadedMembers) => {
        if (!cancelled) setMembers(loadedMembers);
      })
      .catch(() => {
        if (!cancelled) setMembers(currentUser ? [currentUser] : []);
      });
    return () => { cancelled = true; };
  }, [accessToken, currentUser]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadSilent();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [loadSilent]);

  useEffect(() => {
    const raw = window.sessionStorage.getItem("stovo:plan-draft");
    if (!raw) return;
    window.sessionStorage.removeItem("stovo:plan-draft");
    try {
      const saved = JSON.parse(raw) as { title?: string; durationMinutes?: number; sourceChatId?: string };
      const start = new Date();
      start.setMinutes(0, 0, 0);
      start.setHours(start.getHours() + 1);
      const end = new Date(start.getTime() + (saved.durationMinutes ?? 60) * 60_000);
      setDraft((current) => ({
        ...current,
        title: saved.title ?? current.title,
        startsAt: toLocalIso(start),
        endsAt: toLocalIso(end),
        sourceChatId: saved.sourceChatId
      }));
      setDialogError(null);
      setDialogOpen(true);
    } catch { /* discard malformed transient draft */ }
  }, []);

  const visiblePlans = plans.filter((plan) => plan.title.toLowerCase().includes(query.trim().toLowerCase()));

  const handleStartsAtChange = (newStartIso: string) => {
    setDraft((current) => {
      const newStart = new Date(newStartIso).getTime();
      const prevStart = new Date(current.startsAt).getTime();
      const prevEnd = new Date(current.endsAt).getTime();
      if (isNaN(newStart)) return { ...current, startsAt: newStartIso };
      const duration = !isNaN(prevStart) && !isNaN(prevEnd) && prevEnd > prevStart ? prevEnd - prevStart : 3_600_000;
      const newEnd = new Date(newStart + duration);
      return { ...current, startsAt: newStartIso, endsAt: toLocalIso(newEnd) };
    });
  };

  const applyDurationMinutes = (minutes: number) => {
    setDraft((current) => {
      const start = new Date(current.startsAt).getTime();
      const base = isNaN(start) ? Date.now() : start;
      const end = new Date(base + minutes * 60_000);
      return { ...current, endsAt: toLocalIso(end), allDay: false };
    });
  };

  const openCreateModal = () => {
    const defaults = getDefaultPlanTimes();
    setDraft({
      title: "",
      notes: "",
      location: "",
      startsAt: defaults.startsAt,
      endsAt: defaults.endsAt,
      allDay: false,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      attendeeIds: []
    });
    setDialogError(null);
    setDialogOpen(true);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setDialogError(null);
    if (!draft.title.trim()) {
      setDialogError("Title is required");
      return;
    }
    const start = new Date(draft.startsAt).getTime();
    const end = new Date(draft.endsAt).getTime();
    if (isNaN(start) || isNaN(end) || start >= end) {
      setDialogError("A title and valid time range are required");
      return;
    }
    try {
      await createPlan(accessToken, {
        ...draft,
        startsAt: new Date(draft.startsAt).toISOString(),
        endsAt: new Date(draft.endsAt).toISOString()
      });
      setDialogOpen(false);
      setDialogError(null);
      await load();
    } catch (err) {
      setDialogError(err instanceof ApiError ? err.message : "Could not create plan");
    }
  }

  async function rsvp(plan: Plan, targetStatus: PlanRSVP) {
    if (!accessToken || !currentUser) return;

    setPlans((prevPlans) =>
      prevPlans.map((p) => {
        if (p.id !== plan.id) return p;
        const existing = (p.attendees || []).filter((a) => a.userId !== currentUser.id);
        return {
          ...p,
          attendees: [...existing, { userId: currentUser.id, status: targetStatus }]
        };
      })
    );

    try {
      const updated = await rsvpPlan(accessToken, plan.id, targetStatus);
      setPlans((prevPlans) => prevPlans.map((current) => current.id === updated.id ? updated : current));
    } catch {
      setError("Could not update RSVP");
      await loadSilent();
    }
  }

  const calendarStart = addDays(selectedDay, (selectedDay.getDay() + 6) % 7 * -1);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(calendarStart, index));
  const membersById = useMemo(() => {
    const result = new Map(members.map((member) => [member.id, member]));
    if (currentUser) result.set(currentUser.id, currentUser);
    return result;
  }, [currentUser, members]);

  const renderPlanCard = (plan: Plan, timeLabel: string) => {
    const myRsvp = plan.attendees?.find((entry) => entry.userId === currentUser?.id)?.status;
    const goingMembers = (plan.attendees ?? [])
      .filter((entry) => entry.status === "going")
      .map((entry) => membersById.get(entry.userId))
      .filter((member): member is User => Boolean(member));
    const creator = membersById.get(plan.createdBy);

    return (
      <article className="plan-row" key={plan.id}>
        <time>{timeLabel}</time>
        <div className="plan-card-content">
          <div>
            <strong>{plan.title}</strong>
            {plan.location && <small>{plan.location}</small>}
            {plan.notes && <div className="plan-notes">{renderPlanNotes(plan.notes)}</div>}
            <small className="plan-created-by">{strings.plans.createdBy(creator?.displayName ?? strings.plans.unknownMember)}</small>
            {plan.sourceChatId && (
              <button className="plan-chat-link" onClick={() => navigate(`/app/chats/${plan.sourceChatId}`)}>
                {strings.plans.openChat}
              </button>
            )}
          </div>
          <div className="plan-rsvp">
            <span className="plan-attendance-count">{strings.plans.goingCount(goingMembers.length)}</span>
            <div className="plan-rsvp-actions" aria-label={strings.plans.goingQuestion}>
              <span>{strings.plans.goingQuestion}</span>
              <button type="button" className={myRsvp === "going" ? "active" : ""} aria-pressed={myRsvp === "going"} onClick={() => void rsvp(plan, "going")}>
                {strings.plans.yes}
              </button>
              <button type="button" className={myRsvp === "declined" ? "active" : ""} aria-pressed={myRsvp === "declined"} onClick={() => void rsvp(plan, "declined")}>
                {strings.plans.no}
              </button>
            </div>
            {goingMembers.length > 0 && (
              <div className="plan-attendee-list" aria-label={strings.plans.goingCount(goingMembers.length)}>
                {goingMembers.slice(0, 6).map((member) => (
                  <div
                    className="plan-attendee"
                    key={member.id}
                    onMouseEnter={() => setProfilePreviewMemberId(member.id)}
                    onMouseLeave={() => setProfilePreviewMemberId(null)}
                  >
                    <button
                      type="button"
                      className="plan-attendee-button"
                      title={member.displayName}
                      aria-label={member.displayName}
                      aria-expanded={profilePreviewMemberId === member.id}
                      onFocus={() => setProfilePreviewMemberId(member.id)}
                      onBlur={() => setProfilePreviewMemberId(null)}
                      onClick={() => setProfilePreviewMemberId((current) => current === member.id ? null : member.id)}
                    >
                      <RealAvatar accessToken={accessToken} className="avatar plan-attendee-avatar" file={member.profilePhoto} label={member.displayName} />
                    </button>
                    {profilePreviewMemberId === member.id && (
                      <div className="plan-member-popover" role="tooltip">
                        <RealAvatar accessToken={accessToken} className="avatar plan-member-popover-avatar" file={member.profilePhoto} label={member.displayName} />
                        <span><strong>{member.displayName}</strong><small>@{member.username}</small></span>
                      </div>
                    )}
                  </div>
                ))}
                {goingMembers.length > 6 && <span className="plan-attendee-more">+{goingMembers.length - 6}</span>}
              </div>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <main className="app-shell app-frame plans-page">
      <AppNav />
      <section className="plans-layout" aria-busy={loading}>
        <aside className="plans-sidebar">
          <div className="plans-sidebar-header">
            <label className="plans-search">
              <Search size={17} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={strings.plans.searchPlaceholder} aria-label={strings.plans.searchPlaceholder} />
            </label>
            <div className="plans-tabs">
              {(["today", "week", "month"] as View[]).map((item) => (
                <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>
                  {item === "week" ? strings.plans.thisWeek : item === "today" ? strings.plans.today : strings.plans.month}
                </button>
              ))}
            </div>
            <p className="plans-list-label">{view === "today" ? strings.plans.today : strings.plans.upcoming}</p>
          </div>
          <div className="plans-sidebar-list">
            {visiblePlans.map((plan) => (
              <button className="plans-sidebar-row" key={plan.id} onClick={() => setSelectedDay(dayStart(new Date(plan.startsAt)))}>
                <time>{new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" }).format(new Date(plan.startsAt))}</time>
                <span>{plan.title}</span>
              </button>
            ))}
            {!loading && visiblePlans.length === 0 && <p className="plans-muted">{strings.plans.noPlansRange}</p>}
          </div>
        </aside>

        <section className={`plans-content plans-content--${view}`}>
          <header className="plans-header">
            <button aria-label="Previous" onClick={() => setSelectedDay(addDays(selectedDay, view === "month" ? -30 : view === "week" ? -7 : -1))}>
              <ChevronLeft />
            </button>
            <h2>{view === "month" ? new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(selectedDay) : formatDay(selectedDay)}</h2>
            <button aria-label="Next" onClick={() => setSelectedDay(addDays(selectedDay, view === "month" ? 30 : view === "week" ? 7 : 1))}>
              <ChevronRight />
            </button>
          </header>
          <nav className="plans-mobile-tabs" aria-label="Plan view">
            <button className={view === "today" ? "active" : ""} onClick={() => setView("today")}>{strings.plans.today}</button>
            <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>{strings.plans.thisWeek}</button>
            <button className={view === "month" ? "active" : ""} onClick={() => setView("month")}>{strings.plans.month}</button>
          </nav>
          {error && <p className="error-text" role="alert">{error}</p>}
          {view === "month" ? (
            <div className="plans-month" role="grid">
              {Array.from({ length: 31 }, (_, index) => addDays(new Date(selectedDay.getFullYear(), selectedDay.getMonth(), 1), index))
                .filter((date) => date.getMonth() === selectedDay.getMonth())
                .map((date) => (
                  <button key={date.toISOString()} className={sameDay(date, selectedDay) ? "selected" : ""} onClick={() => { setSelectedDay(date); setView("today"); }}>
                    <time>{date.getDate()}</time>
                    {plans.some((plan) => sameDay(new Date(plan.startsAt), date)) && <i />}
                  </button>
                ))}
            </div>
          ) : (
            <div className="plans-agenda">
              {loading && plans.length === 0 ? (
                <p className="plans-empty">{strings.plans.loadingPlans}</p>
              ) : view === "week" ? (
                <div className="plans-week-calendar" role="grid" aria-label={strings.plans.thisWeek}>
                  {weekDays.map((day) => {
                    const dayPlans = visiblePlans.filter((plan) => sameDay(new Date(plan.startsAt), day));
                    return (
                      <section className={`plans-week-day${sameDay(day, selectedDay) ? " active" : ""}`} key={day.toISOString()} role="gridcell">
                        <button type="button" className="plans-week-day-heading" onClick={() => setSelectedDay(day)}>
                          <small>{new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(day)}</small>
                          <strong>{day.getDate()}</strong>
                        </button>
                        <div className="plans-week-day-events">
                          {dayPlans.map((plan) => (
                            <button
                              type="button"
                              className="plans-week-event"
                              key={plan.id}
                              onClick={() => { setSelectedDay(day); setView("today"); }}
                              title={`${plan.allDay ? strings.plans.allDay : formatTime(plan.startsAt)} — ${plan.title}`}
                            >
                              <time>{plan.allDay ? strings.plans.allDay : formatTime(plan.startsAt)}</time>
                              <span>{plan.title}</span>
                            </button>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="plans-timeline" role="region" aria-label="Today schedule timeline">
                  {visiblePlans.filter((plan) => plan.allDay).length > 0 && (
                    <div className="plans-timeline-slot plans-timeline-slot--allday">
                      <div className="plans-timeline-time">
                        <span>{strings.plans.allDay}</span>
                      </div>
                      <div className="plans-timeline-content">
                        <div className="plans-timeline-line" />
                        <div className="plans-timeline-events">
                          {visiblePlans.filter((plan) => plan.allDay).map((plan) => renderPlanCard(plan, strings.plans.allDay))}
                        </div>
                      </div>
                    </div>
                  )}
                  {TODAY_TIME_SLOTS.map((hour) => {
                    const slotPlans = visiblePlans.filter((plan) => {
                      if (plan.allDay) return false;
                      const planHour = new Date(plan.startsAt).getHours();
                      return planHour >= hour && planHour < hour + TODAY_TIME_SLOT_HOURS;
                    });
                    return (
                      <div className="plans-timeline-slot" key={hour}>
                        <div className="plans-timeline-time">
                          <time dateTime={`${String(hour).padStart(2, "0")}:00`}>
                            {formatSlotTime(hour)}
                          </time>
                        </div>
                        <div className="plans-timeline-content">
                          <div className="plans-timeline-line" />
                          <div className="plans-timeline-events">
                            {slotPlans.map((plan) => renderPlanCard(plan, formatTime(plan.startsAt)))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <button type="button" className="plans-create-fab" disabled={!canCreate} onClick={openCreateModal} aria-label={strings.plans.createPlan}>
            <Plus size={28} aria-hidden="true" />
          </button>
        </section>
      </section>
      {dialogOpen && (
        <div
          className="modal-backdrop plans-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDialogOpen(false);
              setDialogError(null);
            }
          }}
        >
          <form
            className="messenger-modal modal-form plans-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-plan-title"
            onSubmit={submit}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="new-plan-title">{strings.plans.newPlan}</h2>
              <button
                type="button"
                className="icon-button subtle icon-button--plain"
                aria-label={strings.plans.close}
                onClick={() => {
                  setDialogOpen(false);
                  setDialogError(null);
                }}
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            {dialogError && <p className="error-text modal-error-text" role="alert">{dialogError}</p>}
            <label>
              {strings.plans.planTitle}
              <input
                autoFocus
                required
                value={draft.title}
                onChange={(e) => {
                  setDraft({ ...draft, title: e.target.value });
                  if (dialogError) setDialogError(null);
                }}
              />
            </label>
            <div className="plans-dialog-times">
              <label>
                {strings.plans.starts}
                <input
                  required
                  type="datetime-local"
                  value={draft.startsAt}
                  onChange={(e) => {
                    handleStartsAtChange(e.target.value);
                    if (dialogError) setDialogError(null);
                  }}
                />
              </label>
              <label>
                {strings.plans.ends}
                <input
                  required
                  type="datetime-local"
                  min={draft.startsAt}
                  value={draft.endsAt}
                  onChange={(e) => {
                    setDraft({ ...draft, endsAt: e.target.value });
                    if (dialogError) setDialogError(null);
                  }}
                />
              </label>
            </div>
            <div className="time-preset-chips" aria-label="Duration presets">
              <button type="button" onClick={() => applyDurationMinutes(30)}>30m</button>
              <button type="button" onClick={() => applyDurationMinutes(60)}>1h</button>
              <button type="button" onClick={() => applyDurationMinutes(120)}>2h</button>
              <button
                type="button"
                className={draft.allDay ? "active" : ""}
                onClick={() => setDraft((current) => ({ ...current, allDay: !current.allDay }))}
              >
                {strings.plans.allDay}
              </button>
            </div>
            <label>
              {strings.plans.location}
              <input
                value={draft.location ?? ""}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                placeholder={strings.plans.locationOptional}
              />
            </label>
            <label>
              {strings.plans.descriptionOrLink}
              <textarea
                rows={2}
                value={draft.notes ?? ""}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder={strings.plans.descriptionPlaceholder}
              />
            </label>
            <button type="submit" className="primary-button">
              {strings.plans.createPlan}
            </button>
          </form>
        </div>
      )}

    </main>
  );
}

