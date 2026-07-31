import { beforeEach, describe, expect, it } from "vitest";

import {
  clearPendingNotificationAction,
  queuePendingNotificationAction,
  takePendingNotificationAction
} from "./notificationActions";

describe("pending notification actions", () => {
  beforeEach(() => {
    clearPendingNotificationAction();
  });

  it("delivers a queued reply once to its linked chat", () => {
    queuePendingNotificationAction({
      type: "reply",
      chatId: "chat-a",
      text: "On my way"
    });

    expect(takePendingNotificationAction("chat-b")).toBeNull();
    expect(takePendingNotificationAction("chat-a")).toEqual({
      type: "reply",
      chatId: "chat-a",
      text: "On my way"
    });
    expect(takePendingNotificationAction("chat-a")).toBeNull();
  });

  it("keeps callback actions distinct from replies", () => {
    queuePendingNotificationAction({ type: "callback", chatId: "chat-a" });

    expect(takePendingNotificationAction("chat-a")).toEqual({
      type: "callback",
      chatId: "chat-a"
    });
  });
});
