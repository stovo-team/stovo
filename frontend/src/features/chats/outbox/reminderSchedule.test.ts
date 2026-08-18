import { describe, expect, it } from "vitest";
import {
  computeInitialReminderDate,
  computeNextReminderDate,
  createLocalDateFromDateAndTime
} from "./reminderSchedule";
import type { ReminderRule } from "./messageOutboxStore";

describe("reminderSchedule", () => {
  it("creates local date from date and time strings accurately", () => {
    const d = createLocalDateFromDateAndTime("2026-08-20", "14:30");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7); // 0-indexed August
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });

  describe("computeInitialReminderDate", () => {
    it("returns base date if future for daily", () => {
      const rule: ReminderRule = {
        frequency: "daily",
        repeatCount: 5,
        remainingCount: 5,
        startDate: "2026-08-20",
        time: "10:00"
      };
      const now = new Date(2026, 7, 18, 9, 0);
      const initial = computeInitialReminderDate(rule, now);
      expect(initial.getFullYear()).toBe(2026);
      expect(initial.getDate()).toBe(20);
      expect(initial.getHours()).toBe(10);
    });

    it("advances daily to next day if base date is in the past", () => {
      const rule: ReminderRule = {
        frequency: "daily",
        repeatCount: 5,
        remainingCount: 5,
        startDate: "2026-08-17",
        time: "10:00"
      };
      const now = new Date(2026, 7, 18, 12, 0);
      const initial = computeInitialReminderDate(rule, now);
      expect(initial.getDate()).toBe(19);
      expect(initial.getHours()).toBe(10);
    });

    it("picks matching day of week for weekly recurrence", () => {
      // 2026-08-18 is a Tuesday (getDay() === 2)
      // Suppose user selects Wednesday (3) and Friday (5)
      const rule: ReminderRule = {
        frequency: "weekly",
        daysOfWeek: [3, 5],
        repeatCount: 10,
        remainingCount: 10,
        startDate: "2026-08-18",
        time: "15:00"
      };
      const now = new Date(2026, 7, 18, 16, 0); // Tuesday 16:00
      const initial = computeInitialReminderDate(rule, now);
      expect(initial.getDay()).toBe(3); // Wednesday
      expect(initial.getDate()).toBe(19);
    });

    it("picks matching day of month for monthly recurrence", () => {
      const rule: ReminderRule = {
        frequency: "monthly",
        daysOfMonth: [25],
        repeatCount: 12,
        remainingCount: 12,
        startDate: "2026-08-18",
        time: "09:00"
      };
      const now = new Date(2026, 7, 18, 12, 0);
      const initial = computeInitialReminderDate(rule, now);
      expect(initial.getDate()).toBe(25);
    });
  });

  describe("computeNextReminderDate", () => {
    it("advances daily by 1 day at exact time", () => {
      const rule: ReminderRule = {
        frequency: "daily",
        repeatCount: 5,
        remainingCount: 4,
        startDate: "2026-08-18",
        time: "08:30"
      };
      const current = new Date(2026, 7, 18, 8, 30);
      const next = computeNextReminderDate(current, rule);
      expect(next.getDate()).toBe(19);
      expect(next.getHours()).toBe(8);
      expect(next.getMinutes()).toBe(30);
    });

    it("advances weekly to next specified day of week", () => {
      // Monday (1) and Thursday (4)
      const rule: ReminderRule = {
        frequency: "weekly",
        daysOfWeek: [1, 4],
        repeatCount: 6,
        remainingCount: 5,
        startDate: "2026-08-17",
        time: "11:00"
      };
      // Suppose current was Monday 2026-08-17
      const current = new Date(2026, 7, 17, 11, 0);
      const next = computeNextReminderDate(current, rule);
      expect(next.getDay()).toBe(4); // Thursday
      expect(next.getDate()).toBe(20);
      expect(next.getHours()).toBe(11);
    });

    it("advances monthly to next specified day of month", () => {
      // Days 5 and 20 of each month
      const rule: ReminderRule = {
        frequency: "monthly",
        daysOfMonth: [5, 20],
        repeatCount: 4,
        remainingCount: 3,
        startDate: "2026-08-05",
        time: "14:00"
      };
      const current = new Date(2026, 7, 5, 14, 0);
      const next = computeNextReminderDate(current, rule);
      expect(next.getDate()).toBe(20);
      expect(next.getMonth()).toBe(7); // August

      const nextAfter = computeNextReminderDate(next, rule);
      expect(nextAfter.getDate()).toBe(5);
      expect(nextAfter.getMonth()).toBe(8); // September
    });
  });
});
