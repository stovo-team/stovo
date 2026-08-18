import type { ReminderRule } from "./messageOutboxStore";

/**
 * Parses "YYYY-MM-DD" and "HH:mm" into a local Date object with safe fallbacks.
 */
export function createLocalDateFromDateAndTime(dateStr?: string | null, timeStr?: string | null): Date {
  const fallback = new Date();
  fallback.setMinutes(fallback.getMinutes() + 60);

  if (!dateStr || !timeStr) {
    return fallback;
  }

  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const [hourStr, minuteStr] = timeStr.split(":");
  const parsedYear = Number(yearStr);
  const parsedMonth = Number(monthStr);
  const parsedDay = Number(dayStr);
  const parsedHour = Number(hourStr);
  const parsedMinute = Number(minuteStr);

  const year = !Number.isNaN(parsedYear) && parsedYear > 0 ? parsedYear : fallback.getFullYear();
  const month = !Number.isNaN(parsedMonth) && parsedMonth > 0 ? parsedMonth - 1 : fallback.getMonth();
  const day = !Number.isNaN(parsedDay) && parsedDay > 0 ? parsedDay : 1;
  const hour = !Number.isNaN(parsedHour) ? parsedHour : 0;
  const minute = !Number.isNaN(parsedMinute) ? parsedMinute : 0;

  const result = new Date(year, month, day, hour, minute, 0, 0);
  if (Number.isNaN(result.getTime())) {
    return fallback;
  }
  return result;
}

/**
 * Computes the first trigger timestamp for a reminder rule.
 */
export function computeInitialReminderDate(rule: ReminderRule, now: Date = new Date()): Date {
  const base = createLocalDateFromDateAndTime(rule.startDate, rule.time);

  if (rule.frequency === "daily") {
    if (base.getTime() > now.getTime()) {
      return base;
    }
    // If base is in the past, advance to next matching day at the same time
    const next = new Date(base);
    while (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  if (rule.frequency === "weekly") {
    const daysOfWeek = rule.daysOfWeek && rule.daysOfWeek.length > 0 ? rule.daysOfWeek : [base.getDay()];
    const candidate = new Date(base);

    // Check up to 14 days ahead
    for (let i = 0; i < 14; i++) {
      if (daysOfWeek.includes(candidate.getDay()) && candidate.getTime() > now.getTime()) {
        return candidate;
      }
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate;
  }

  if (rule.frequency === "monthly") {
    const daysOfMonth = rule.daysOfMonth && rule.daysOfMonth.length > 0 ? rule.daysOfMonth : [base.getDate()];
    const candidate = new Date(base);

    // Check up to 365 days ahead
    for (let i = 0; i < 365; i++) {
      if (daysOfMonth.includes(candidate.getDate()) && candidate.getTime() > now.getTime()) {
        return candidate;
      }
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate;
  }

  return base;
}

/**
 * Computes the subsequent trigger timestamp after a reminder has fired.
 */
export function computeNextReminderDate(currentScheduledFor: Date | string, rule: ReminderRule): Date {
  const prev = typeof currentScheduledFor === "string" ? new Date(currentScheduledFor) : new Date(currentScheduledFor);
  if (Number.isNaN(prev.getTime())) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 1);
    return fallback;
  }

  const [hourStr, minuteStr] = (rule.time || "09:00").split(":");
  const parsedHour = Number(hourStr);
  const parsedMinute = Number(minuteStr);
  const hour = !Number.isNaN(parsedHour) ? parsedHour : prev.getHours();
  const minute = !Number.isNaN(parsedMinute) ? parsedMinute : prev.getMinutes();

  if (rule.frequency === "daily") {
    const next = new Date(prev);
    next.setDate(next.getDate() + 1);
    next.setHours(hour, minute, 0, 0);
    return next;
  }

  if (rule.frequency === "weekly") {
    const daysOfWeek = rule.daysOfWeek && rule.daysOfWeek.length > 0 ? rule.daysOfWeek : [prev.getDay()];
    const next = new Date(prev);
    next.setDate(next.getDate() + 1);
    next.setHours(hour, minute, 0, 0);

    for (let i = 0; i < 14; i++) {
      if (daysOfWeek.includes(next.getDay())) {
        return next;
      }
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  if (rule.frequency === "monthly") {
    const daysOfMonth = rule.daysOfMonth && rule.daysOfMonth.length > 0 ? rule.daysOfMonth : [prev.getDate()];
    const next = new Date(prev);
    next.setDate(next.getDate() + 1);
    next.setHours(hour, minute, 0, 0);

    for (let i = 0; i < 365; i++) {
      if (daysOfMonth.includes(next.getDate())) {
        return next;
      }
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  const fallback = new Date(prev);
  fallback.setDate(fallback.getDate() + 1);
  return fallback;
}
