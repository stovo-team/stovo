import { describe, expect, it } from "vitest";

import {
  notificationActionCommand,
  type NotificationActionCommand
} from "../features/chats/shared/callLifecycle";

describe("ChatsPage notification actions", () => {
  it("waits until the action's linked chat is loaded", () => {
    expect(
      notificationActionCommand(
        { type: "reply", chatId: "chat-a", text: "On my way" },
        { id: "chat-b", type: "direct" }
      )
    ).toBeNull();
  });

  it("sends a reply only after its target chat loads", () => {
    expect(
      notificationActionCommand(
        { type: "reply", chatId: "chat-a", text: "On my way" },
        { id: "chat-a", type: "direct" }
      )
    ).toEqual<NotificationActionCommand>({ type: "reply", text: "On my way" });
  });

  it("starts an audio callback only for a loaded direct chat", () => {
    expect(
      notificationActionCommand(
        { type: "callback", chatId: "chat-a" },
        { id: "chat-a", type: "direct" }
      )
    ).toEqual<NotificationActionCommand>({ type: "callback" });

    expect(
      notificationActionCommand(
        { type: "callback", chatId: "chat-a" },
        { id: "chat-a", type: "group" }
      )
    ).toEqual<NotificationActionCommand>({ type: "discard" });
  });
});
