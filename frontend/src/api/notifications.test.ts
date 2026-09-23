import { afterEach, describe, expect, it, vi } from "vitest";

const nativePlugin = {
  getPushToken: vi.fn(),
  startService: vi.fn(),
  requestNotificationPermission: vi.fn(),
  dismissChatNotifications: vi.fn(),
  consumePendingNotificationAction: vi.fn(),
  updateNotificationSchedule: vi.fn()
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

describe("updateNativeNotificationSchedule", () => {
  afterEach(() => nativePlugin.updateNotificationSchedule.mockReset());

  it("sends quiet-hours changes to the Android notification service", async () => {
    const { updateNativeNotificationSchedule } = await import("./notifications");

    await updateNativeNotificationSchedule({
      quietHoursEnabled: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00"
    });

    expect(nativePlugin.updateNotificationSchedule).toHaveBeenCalledWith({
      quietHoursEnabled: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00"
    });
  });
});

describe("bootstrapNotifications", () => {
  afterEach(() => {
    nativePlugin.getPushToken.mockReset();
    nativePlugin.startService.mockReset();
    nativePlugin.requestNotificationPermission.mockReset();
    nativePlugin.updateNotificationSchedule.mockReset();
  });

  it("registers both FCM and ntfy identities so the server can switch delivery providers", async () => {
    nativePlugin.requestNotificationPermission.mockResolvedValue({ granted: true });
    nativePlugin.getPushToken.mockResolvedValue({ token: "fcm-device-token" });
    const authRequest = vi.fn(async (endpoint: string) => endpoint === "/api/notifications/topic"
      ? { topic: "stovo-user-topic", ntfyBaseUrl: "https://push.example.test" }
      : undefined);
    const { bootstrapNotifications } = await import("./notifications");

    await bootstrapNotifications(authRequest as never, {
      quietHoursEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00"
    });

    expect(authRequest).toHaveBeenNthCalledWith(1, "/api/notifications/device-token", expect.objectContaining({ method: "POST" }));
    expect(authRequest).toHaveBeenNthCalledWith(2, "/api/notifications/topic");
    expect(nativePlugin.startService).toHaveBeenCalledWith(expect.objectContaining({ topic: "stovo-user-topic" }));
  });
});
