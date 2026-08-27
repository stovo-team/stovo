import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => true
  },
  registerPlugin: () => ({})
}));

describe("refreshSession", () => {
  const storage = new Map<string, string>();

  afterEach(() => {
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("does not request a refresh before an Android session token exists", async () => {
    const fetchMock = vi.fn();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear()
      }
    });
    vi.stubGlobal("fetch", fetchMock);
    const { refreshSession } = await import("./auth");

    await expect(refreshSession()).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
