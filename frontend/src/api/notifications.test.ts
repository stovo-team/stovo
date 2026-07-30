import { afterEach, describe, expect, it, vi } from "vitest";

const nativePlugin = {
  dismissMessageNotification: vi.fn()
};

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => "android"
  },
  registerPlugin: () => nativePlugin
}));

describe("dismissMessageNotification", () => {
  afterEach(() => {
    nativePlugin.dismissMessageNotification.mockReset();
    vi.unstubAllGlobals();
  });

  it("clears the Android notification for the chat the user opens", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    const { dismissMessageNotification } = await import("./notifications");

    await dismissMessageNotification("family-chat");

    expect(nativePlugin.dismissMessageNotification).toHaveBeenCalledWith({ chatId: "family-chat" });
  });
});
