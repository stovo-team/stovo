import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  getApiUrl: vi.fn(),
}));

vi.mock("@capacitor/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@capacitor/core")>();
  return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => false } };
});
vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, apiRequest: mocks.apiRequest, getApiUrl: mocks.getApiUrl };
});

describe("refreshSession in-flight isolation", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.apiRequest.mockReset();
    mocks.getApiUrl.mockReset();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("does not reuse a pending refresh promise for a different cluster URL", async () => {
    let resolveA!: (value: { accessToken: string }) => void;
    let resolveB!: (value: { accessToken: string }) => void;
    mocks.getApiUrl
      .mockReturnValueOnce("https://app.example.test/s/a")
      .mockReturnValueOnce("https://app.example.test/s/b");
    mocks.apiRequest
      .mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveB = resolve; }));
    const { refreshSession } = await import("./auth");

    const refreshA = refreshSession();
    await Promise.resolve();
    const refreshB = refreshSession();
    await Promise.resolve();

    expect(mocks.apiRequest).toHaveBeenCalledTimes(2);
    resolveA({ accessToken: "a" });
    resolveB({ accessToken: "b" });
    await expect(refreshA).resolves.toMatchObject({ accessToken: "a" });
    await expect(refreshB).resolves.toMatchObject({ accessToken: "b" });
  });
});
