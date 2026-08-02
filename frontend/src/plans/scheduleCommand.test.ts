import { describe, expect, it } from "vitest";

import { parseScheduleCommand } from "./scheduleCommand";

describe("parseScheduleCommand", () => {
  it("turns a structured schedule command into a confirmation-ready draft", () => {
    expect(parseScheduleCommand("/schedule Dinner at Grandma's | Friday 18:00 | 2h")).toEqual({
      title: "Dinner at Grandma's",
      startsAt: "Friday 18:00",
      durationMinutes: 120
    });
  });

  it("does not claim ordinary chat text as a plan", () => {
    expect(parseScheduleCommand("Dinner at Grandma's Friday at six")).toBeNull();
  });
});
