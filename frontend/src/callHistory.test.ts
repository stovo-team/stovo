import { describe, expect, it } from "vitest";

import { callHistoryLabel, callHistoryTimestamp } from "./callHistory";
import { englishStrings, russianStrings } from "./config/strings";

describe("callHistoryLabel", () => {
  it("shows the completed status with duration", () => {
    expect(callHistoryLabel({ status: "completed", durationSeconds: 83 })).toBe("Call completed · 1:23");
  });

  it("shows a declined call without a duration", () => {
    expect(callHistoryLabel({ status: "declined" })).toBe("Call declined");
  });

  it("shows a cancelled call without a duration", () => {
    expect(callHistoryLabel({ status: "canceled" })).toBe("Call canceled");
  });

  it("shows a missed and failed call", () => {
    expect(callHistoryLabel({ status: "missed" })).toBe("Missed call");
    expect(callHistoryLabel({ status: "failed" })).toBe("Call failed");
  });

  it("formats call history labels with Russian strings", () => {
    expect(callHistoryLabel({ status: "completed", durationSeconds: 125 }, russianStrings)).toBe("Звонок завершён · 2:05");
    expect(callHistoryLabel({ status: "declined" }, russianStrings)).toBe("Звонок отклонён");
    expect(callHistoryLabel({ status: "canceled" }, russianStrings)).toBe("Звонок отменён");
    expect(callHistoryLabel({ status: "missed" }, russianStrings)).toBe("Пропущенный звонок");
    expect(callHistoryLabel({ status: "failed" }, russianStrings)).toBe("Сбой звонка");
  });

  it("formats call history labels with English strings", () => {
    expect(callHistoryLabel({ status: "completed", durationSeconds: 125 }, englishStrings)).toBe("Call completed · 2:05");
    expect(callHistoryLabel({ status: "declined" }, englishStrings)).toBe("Call declined");
    expect(callHistoryLabel({ status: "canceled" }, englishStrings)).toBe("Call canceled");
    expect(callHistoryLabel({ status: "missed" }, englishStrings)).toBe("Missed call");
    expect(callHistoryLabel({ status: "failed" }, englishStrings)).toBe("Call failed");
  });

  it("formats a call card's creation time without a delivery status", () => {
    expect(callHistoryTimestamp("2026-07-30T12:13:00")).toBe("12:13");
  });
});
