import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false
  }
}));

import { refreshSession } from "./auth";

describe("refreshSession", () => {
  const storage = new Map<string, string>();
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    storage.clear();
    storage.set("familyMessenger.refreshLock", String(Date.now()));
    storage.set("familyMessenger.refreshToken", "active-refresh-token");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: "Unauthorized" }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("does not wait on its own refresh promise when a prior lock remains", async () => {
    void refreshSession().catch(() => undefined);

    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
