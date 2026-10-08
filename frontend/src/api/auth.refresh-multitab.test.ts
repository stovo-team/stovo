import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  getApiUrl: vi.fn(() => "https://app.example.test"),
  getStoredRefreshToken: vi.fn(() => null),
}));

vi.mock("@capacitor/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@capacitor/core")>();
  return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => false } };
});
vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return {
    ...actual,
    apiRequest: mocks.apiRequest,
    getApiUrl: mocks.getApiUrl,
    getStoredRefreshToken: mocks.getStoredRefreshToken,
  };
});

describe("refreshSession across tabs", () => {
  let lockTails: Map<string, Promise<void>>;

  beforeEach(() => {
    vi.resetModules();
    mocks.apiRequest.mockReset();
    lockTails = new Map();
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: async (_name: string, _options: unknown, callback: () => Promise<unknown>) => {
          const previous = lockTails.get(_name) ?? Promise.resolve();
          let release!: () => void;
          const gate = new Promise<void>((resolve) => { release = resolve; });
          const tail = previous.then(() => gate);
          lockTails.set(_name, tail);
          await previous;
          try {
            return await callback();
          } finally {
            release();
            if (lockTails.get(_name) === tail) lockTails.delete(_name);
          }
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "locks");
  });

  it("serializes refresh requests from separate tabs for the same server", async () => {
    let finishFirst!: (response: { accessToken: string }) => void;
    mocks.apiRequest
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce({ accessToken: "rotated" });

    const firstTab = await import("./auth");
    vi.resetModules();
    const secondTab = await import("./auth");
    const refreshA = firstTab.refreshSession();
    await Promise.resolve();
    const refreshB = secondTab.refreshSession();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.apiRequest).toHaveBeenCalledTimes(1);

    finishFirst({ accessToken: "first" });
    await expect(refreshA).resolves.toMatchObject({ accessToken: "first" });
    await expect(refreshB).resolves.toMatchObject({ accessToken: "rotated" });
    expect(mocks.apiRequest).toHaveBeenCalledTimes(2);
  });
});
