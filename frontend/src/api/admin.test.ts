import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNotificationProviderSettings, updateNotificationProviderSettings } from "./admin";

describe("notification provider admin API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads the server-wide provider setting", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ notificationProvider: "firebase" }) } as Response);
    await expect(getNotificationProviderSettings("owner-token")).resolves.toEqual({ notificationProvider: "firebase" });
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/admin/notification-provider"), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer owner-token" })
    }));
  });

  it("saves the selected provider", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ notificationProvider: "ntfy" }) } as Response);
    await expect(updateNotificationProviderSettings("owner-token", "ntfy")).resolves.toEqual({ notificationProvider: "ntfy" });
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/admin/notification-provider"), expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ notificationProvider: "ntfy" })
    }));
  });
});
