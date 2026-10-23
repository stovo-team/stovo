import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, apiRequest: mocks.apiRequest };
});

describe("passkey option API responses", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.apiRequest.mockReset();
  });

  it("unwraps the Go WebAuthn publicKey wrapper for registration and authentication", async () => {
    const browserOptions = {
      rp: { id: "stovo-cloud.stovo.ru", name: "Stovo" },
      user: { name: "ivan", displayName: "ivan", id: "dXNlci1pZA" },
      challenge: "challenge",
    };
    mocks.apiRequest.mockResolvedValue({
      ceremonyId: "ceremony-1",
      publicKey: { publicKey: browserOptions },
    });

    const { beginPasskeyAuthentication, beginPasskeyRegistration } = await import("./auth");
    const { beginInvitePasskeyRegistration } = await import("./family");

    await expect(beginPasskeyRegistration("access-token")).resolves.toEqual({
      ceremonyId: "ceremony-1",
      publicKey: browserOptions,
    });
    await expect(beginPasskeyAuthentication()).resolves.toEqual({
      ceremonyId: "ceremony-1",
      publicKey: browserOptions,
    });
    await expect(beginInvitePasskeyRegistration("invite-token", "ivan")).resolves.toEqual({
      ceremonyId: "ceremony-1",
      publicKey: browserOptions,
    });
  });

  it("preserves already-flat WebAuthn options", async () => {
    const browserOptions = { rp: { id: "stovo-cloud.stovo.ru" }, challenge: "challenge" };
    mocks.apiRequest.mockResolvedValue({ ceremonyId: "ceremony-2", publicKey: browserOptions });

    const { beginPasskeyRegistration } = await import("./auth");

    await expect(beginPasskeyRegistration("access-token")).resolves.toEqual({
      ceremonyId: "ceremony-2",
      publicKey: browserOptions,
    });
  });
});
