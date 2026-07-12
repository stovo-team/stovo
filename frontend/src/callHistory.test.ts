import { describe, expect, it } from "vitest";

import { callHistoryLabel } from "./callHistory";

describe("callHistoryLabel", () => {
  it("shows the completed status with duration", () => {
    expect(callHistoryLabel({ status: "completed", durationSeconds: 83 })).toBe("Call completed · 1:23");
  });

  it("shows a declined call without a duration", () => {
    expect(callHistoryLabel({ status: "declined" })).toBe("Call declined");
  });
});
