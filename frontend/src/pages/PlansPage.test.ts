import { describe, expect, it } from "vitest";

function getWeekRange(selectedDay: Date) {
  const dayOffset = (selectedDay.getDay() + 6) % 7;
  const startOfWeek = new Date(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate() - dayOffset);
  const endOfWeek = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + 7);
  return [startOfWeek, endOfWeek] as const;
}

describe("PlansPage week range logic", () => {
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
});
