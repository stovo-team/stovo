import type { ReminderRule } from "./messageOutboxStore";

/**
 * Parses "YYYY-MM-DD" and "HH:mm" into a local Date object.
 */
export function createLocalDateFromDateAndTime(dateStr: string, timeStr: string): Date {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const [hourStr, minuteStr] = timeStr.split(":");
  const year = Number(yearStr) || new Date().getFullYear();
  const month = (Number(monthStr) || 1) - 1;
  const day = Number(dayStr) || 1;
  const hour = Number(hourStr) || 0;
  const minute = Number(minuteStr) || 0;

  return new Date(year, month, day, hour, minute, 0, 0);
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
  const [hourStr, minuteStr] = rule.time.split(":");
  const hour = Number(hourStr) || prev.getHours();
  const minute = Number(minuteStr) || prev.getMinutes();

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
