import { afterEach, describe, expect, it, vi } from "vitest";

const nativePlugin = {
  dismissChatNotifications: vi.fn(),
  consumePendingNotificationAction: vi.fn()
};

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => "android"
  },
  registerPlugin: () => nativePlugin
}));

describe("dismissChatNotifications", () => {
  afterEach(() => {
    nativePlugin.dismissChatNotifications.mockReset();
    vi.unstubAllGlobals();
  });

  it("clears the Android notification for the chat the user opens", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    const { dismissChatNotifications } = await import("./notifications");

    await dismissChatNotifications("family-chat");

    expect(nativePlugin.dismissChatNotifications).toHaveBeenCalledWith({ chatId: "family-chat" });
  });
});

describe("consumePendingNotificationAction", () => {
  afterEach(() => {
    nativePlugin.consumePendingNotificationAction.mockReset();
  });

  it("returns a valid one-shot reply from Android", async () => {
    nativePlugin.consumePendingNotificationAction.mockResolvedValue({
      action: { type: "reply", chatId: "chat-a", text: "On my way" }
    });
    const { consumePendingNotificationAction } = await import("./notifications");

    await expect(consumePendingNotificationAction()).resolves.toEqual({
      type: "reply",
      chatId: "chat-a",
      text: "On my way"
    });
  });

  it("ignores malformed native actions", async () => {
    nativePlugin.consumePendingNotificationAction.mockResolvedValue({
      action: { type: "reply", chatId: "chat-a", text: "   " }
    });
    const { consumePendingNotificationAction } = await import("./notifications");

    await expect(consumePendingNotificationAction()).resolves.toBeNull();
  });
});
