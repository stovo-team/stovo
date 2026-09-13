import { describe, expect, it } from "vitest";

import { messageDeliveryLabel } from "./messagePresentation";

describe("messageDeliveryLabel", () => {
  it("omits the scheduled calendar date when it is today", () => {
    const scheduledDate = new Date();
    scheduledDate.setHours(3, 37, 0, 0);
    const message = {
      deliveryState: "scheduled" as const,
      scheduledFor: scheduledDate.toISOString(),
      createdAt: scheduledDate.toISOString()
    } as Parameters<typeof messageDeliveryLabel>[0];

    expect(messageDeliveryLabel(message, true)).toBe(
      `Scheduled for ${scheduledDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    );
  });

  it("includes the scheduled calendar date for another day", () => {
    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + 1);
    scheduledDate.setHours(3, 37, 0, 0);
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
