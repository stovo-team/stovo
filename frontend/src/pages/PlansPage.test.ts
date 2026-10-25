import { readCssSource } from "../test/cssSource";
import { describe, expect, it } from "vitest";
import { getPlanTitle, normalizePlanDateRange } from "./PlansPage";

function getWeekRange(selectedDay: Date) {
  const dayOffset = (selectedDay.getDay() + 6) % 7;
  const startOfWeek = new Date(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate() - dayOffset);
  const endOfWeek = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + 7);
  return [startOfWeek, endOfWeek] as const;
}

describe("PlansPage week range logic", () => {
  it("replaces malformed plan dates with a valid one-hour range", () => {
    const fallback = new Date("2026-09-10T10:00:00.000Z");
    const plan = normalizePlanDateRange({
      id: "plan-1", familyId: "family-1", title: "Guest call", startsAt: "not-a-date", endsAt: "",
      allDay: false, timeZone: "UTC", createdBy: "user-1", revision: 1,
      createdAt: "not-a-date", updatedAt: "2026-09-10T10:00:00.000Z", attendees: []
    }, fallback);

    expect(plan.startsAt).toBe("2026-09-10T10:00:00.000Z");
    expect(plan.endsAt).toBe("2026-09-10T11:00:00.000Z");
  });

  it("correctly starts week on Monday for Thursday", () => {
    // Thursday Aug 6, 2026
    const date = new Date(2026, 7, 6);
    const [start, end] = getWeekRange(date);
    expect(start.getDate()).toBe(3); // Monday Aug 3
    expect(end.getDate()).toBe(10); // Monday Aug 10
  });

  it("correctly handles Sunday as day 7 of current week", () => {
    // Sunday Aug 9, 2026
    const date = new Date(2026, 7, 9);
    const [start, end] = getWeekRange(date);
    expect(start.getDate()).toBe(3); // Monday Aug 3
    expect(end.getDate()).toBe(10); // Monday Aug 10
  });

  it("correctly handles Monday as day 1 of current week", () => {
    // Monday Aug 3, 2026
    const date = new Date(2026, 7, 3);
    const [start, end] = getWeekRange(date);
    expect(start.getDate()).toBe(3); // Monday Aug 3
    expect(end.getDate()).toBe(10); // Monday Aug 10
  });

  it("includes AppNav navigation in the main page structure and handles background refetching", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "src/pages/PlansPage.tsx"), "utf8");
    expect(source).toContain("<AppNav />");
    expect(source).toContain('document.addEventListener("visibilitychange", handleVisibility)');
    expect(source).toContain('window.addEventListener("focus", handleVisibility)');
    expect(source).toContain("loading && plans.length === 0");
  });

  it("does not crash when a legacy plan response has no title", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "src/pages/PlansPage.tsx"), "utf8");

    expect(source).toContain("getPlanTitle(plan).toLowerCase()");
    expect(getPlanTitle({ title: "" })).toBe("Event");
    expect(getPlanTitle({ title: "  " })).toBe("Event");
    expect(getPlanTitle({ title: "Guest call" })).toBe("Guest call");
  });

  it("defines 3-hour step intervals for the today timeline", async () => {
    const { TODAY_TIME_SLOTS, formatSlotTime } = await import("./plansTimeline");
    expect(TODAY_TIME_SLOTS).toEqual([0, 3, 6, 9, 12, 15, 18, 21]);
    expect(typeof formatSlotTime(0)).toBe("string");
    expect(typeof formatSlotTime(3)).toBe("string");
    expect(typeof formatSlotTime(6)).toBe("string");
    expect(typeof formatSlotTime(9)).toBe("string");
    expect(typeof formatSlotTime(12)).toBe("string");
    expect(typeof formatSlotTime(15)).toBe("string");
    expect(typeof formatSlotTime(18)).toBe("string");
    expect(typeof formatSlotTime(21)).toBe("string");
  });

  it("renders Google Calendar style timeline with time markers and lines", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "src/pages/PlansPage.tsx"), "utf8");
    const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));

    expect(source).toContain('className="plans-timeline"');
    expect(source).toContain('className="plans-timeline-slot"');
    expect(source).toContain('className="plans-timeline-time"');
    expect(source).toContain('className="plans-timeline-content"');
    expect(source).toContain('className="plans-timeline-line"');
    expect(source).toContain('className="plans-timeline-events"');

    expect(styles).toContain(".plans-timeline");
    expect(styles).toContain(".plans-timeline-slot");
    expect(styles).toContain(".plans-timeline-time");
    expect(styles).toContain(".plans-timeline-content");
  });

  it("keeps the collapsed plans sidebar opener at full opacity on hover", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));

    expect(styles).toMatch(/\.plans-layout--sidebar-collapsed \.plans-sidebar-collapse:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--accent-primary\);[^}]*border-color:\s*var\(--accent-primary\);[^}]*color:\s*var\(--text-on-accent, var\(--color-palette-f2074b6cef37\)\);[^}]*opacity:\s*1;[^}]*box-shadow:\s*0 0 0 2px color-mix\(in srgb, var\(--accent-primary\) 24%, transparent\);/);
  });

  it("keeps a 12px resize track between the desktop sidebar and main content", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));

    expect(styles).toMatch(/\.plans-layout\s*\{[^}]*grid-template-columns:\s*minmax\(220px, var\(--plans-sidebar-width, 300px\)\) 12px minmax\(0, 1fr\)/);
    expect(styles).toMatch(/\.plans-sidebar-resizer\s*\{[^}]*cursor:\s*col-resize;[^}]*touch-action:\s*none/);
  });

  it("styles the plan description textarea like the dialog fields", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));

    expect(styles).toContain(".plans-dialog textarea {");
    expect(styles).toContain(".plans-dialog textarea:focus-visible {");
  });

  it("renders timed three-day and week grids with compact attendance controls", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "src/pages/PlansPage.tsx"), "utf8");
    const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));

    expect(source).toContain('className={`plans-calendar plans-calendar--${days.length}`}');
    expect(source).toContain("renderTimedCalendar(view === \"threeDays\" ? threeDayRange : weekDays)");
    expect(source).toContain("threeDayRange");
    expect(source).toContain("formatDateRange(threeDayRange[0], threeDayRange[2], dateLocale)");
    expect(source).toContain("formatDateRange(weekDays[0], weekDays[6], dateLocale)");
    expect(source).toContain("getCalendarEventStyle(plan)");
    expect(source).toContain("CALENDAR_TIME_MARKERS = TODAY_TIME_SLOTS");
    expect(source).toContain('className="plan-rsvp-response"');
    expect(source).toContain('className={`plans-calendar-event${selectedPlanId === plan.id ? " selected" : ""}`}');
    expect(source).toContain("strings.plans.goingQuestion");
    expect(source).toContain("strings.plans.createdBy");
    expect(source).toContain("getPlanStatus");
    expect(source).toContain("strings.plans.happening");
    expect(source).toContain("<RealAvatar");
    expect(styles).toContain(".plans-calendar-day-track");
    expect(styles).toContain(".plan-attendee-list");
    expect(styles).toContain(".plan-rsvp-response");
    expect(styles).toContain(".plan-status--happening");
  });

  it("uses compact previews and an anchored details popover without plan-card actions", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "src/pages/PlansPage.tsx"), "utf8");
    const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));

    expect(source).not.toContain('className="plan-actions"');
    expect(source).toContain('className="plan-notes plan-notes--preview"');
    expect(source).toContain("openPlanDetails(plan, event.currentTarget)");
    expect(source).toContain('className="plan-details-popover"');
    expect(source).toContain('window.addEventListener("scroll", closeOnViewportChange, true)');
    expect(source).toContain("renderAttendeeAvatars(detailsPlan, true)");
    expect(styles).toContain("-webkit-line-clamp: 1");
    expect(styles).toContain(".plan-details-popover {");
  });

  it("caps preview attendee avatars at three and uses a gray overflow badge without RSVP glow", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "src/pages/PlansPage.tsx"), "utf8");
    const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));

    expect(source).toContain("goingMembers.slice(0, expanded ? goingMembers.length : 3)");
    expect(source).toContain('className="plan-attendee-more"');
    expect(source).not.toContain("plan-attendance-count");
    expect(styles).toContain(".plan-attendee-more { align-items: center; background: var(--color-palette-6b3d6d843dfe)");
    expect(styles).toContain(".plan-rsvp button.active, .plan-details-rsvp button.active");
    expect(styles).toContain("box-shadow: none;");
  });

  it("keeps attendee avatars inside the RSVP row without allowing either control to overlap", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));

    expect(styles).toMatch(/\.plan-rsvp\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*max-content auto;[^}]*justify-content:\s*start/);
    expect(styles).toMatch(/\.plan-attendee-list\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1/);
    expect(styles).toMatch(/\.plans-timeline-events \.plan-attendee-avatar\s*\{[^}]*height:\s*20px;[^}]*width:\s*20px/);
  });

  it("provides fixed top navigation and scrollable content in storage and plans pages", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));
    const storageSource = readFileSync(resolve(process.cwd(), "src/pages/FilesPage.tsx"), "utf8");

    expect(storageSource).toContain('className="storage-main-header"');
    expect(storageSource).toContain('className="storage-content-area"');

    expect(styles).toMatch(/\.storage-page\.app-frame\s*\{[^}]*overflow:\s*hidden/);
    expect(styles).toMatch(/\.plans-page\.app-frame\s*\{[^}]*overflow:\s*hidden/);
    expect(styles).toMatch(/\.plans-agenda\s*\{[^}]*overflow-y:\s*auto/);
    expect(styles).toMatch(/\.storage-content-area\s*\{[^}]*overflow-y:\s*auto/);
  });
});
