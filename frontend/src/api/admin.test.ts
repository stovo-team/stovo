import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNotificationProviderSettings, updateNotificationProviderSettings } from "./admin";

describe("notification provider admin API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads the server-wide provider setting", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), json: async () => ({ notificationProvider: "firebase" }) } as Response);
    await expect(getNotificationProviderSettings("owner-token")).resolves.toEqual({ notificationProvider: "firebase" });
    const fetchMock = vi.mocked(globalThis.fetch);
    const [url, options] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("/api/admin/notification-provider");
    expect(new Headers(options?.headers).get("Authorization")).toBe("Bearer owner-token");
  });

  it("saves the selected provider", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), json: async () => ({ notificationProvider: "ntfy" }) } as Response);
    await expect(updateNotificationProviderSettings("owner-token", "ntfy")).resolves.toEqual({ notificationProvider: "ntfy" });
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/admin/notification-provider"), expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ notificationProvider: "ntfy" })
    }));
  });
});
