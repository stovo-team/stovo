import { describe, expect, it } from "vitest";

import { messageDeliveryLabel } from "./messagePresentation";

describe("messageDeliveryLabel", () => {
  it("always includes the scheduled calendar date", () => {
    const scheduledDate = new Date(2026, 8, 14, 3, 37);
    const message = {
      deliveryState: "scheduled" as const,
      scheduledFor: scheduledDate.toISOString(),
      createdAt: scheduledDate.toISOString()
    } as Parameters<typeof messageDeliveryLabel>[0];

    expect(messageDeliveryLabel(message, true)).toBe(
      `Scheduled for ${scheduledDate.toLocaleDateString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric"
      })} at ${scheduledDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    );
  });
});
