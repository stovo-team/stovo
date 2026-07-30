import { describe, expect, it } from "vitest";

import { callHistoryLabel, callHistoryTimestamp } from "./callHistory";

describe("callHistoryLabel", () => {
  it("shows the completed status with duration", () => {
    expect(callHistoryLabel({ status: "completed", durationSeconds: 83 })).toBe("Call completed · 1:23");
  });

  it("shows a declined call without a duration", () => {
    expect(callHistoryLabel({ status: "declined" })).toBe("Call declined");
  });

  it("shows a cancelled call without a duration", () => {
    expect(callHistoryLabel({ status: "canceled" })).toBe("Call cancelled");
  });

  it("formats a call card's creation time without a delivery status", () => {
    expect(callHistoryTimestamp("2026-07-30T12:13:00")).toBe("12:13");
  });
});
