import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  refreshSession: vi.fn(),
  registry: { activeServerId: null as string | null, servers: {} as Record<string, any> },
}));

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return { ...actual, apiRequest: mocks.apiRequest, getApiUrl: () => "https://example.test", setApiUrlOverride: vi.fn(), storeRefreshToken: vi.fn() };
});
vi.mock("../api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/auth")>();
  return { ...actual, refreshSession: mocks.refreshSession, login: vi.fn(), logout: vi.fn(async () => undefined), setupOwner: vi.fn() };
});
vi.mock("../api/serverRegistry", () => ({
  getActiveServer: () => mocks.registry.activeServerId ? mocks.registry.servers[mocks.registry.activeServerId] ?? null : null,
  loadServerState: () => ({ activeServerId: mocks.registry.activeServerId, servers: mocks.registry.servers }),
  removeServerById: () => ({ activeServerId: null, servers: {} }),
  setActiveServerId: (serverId: string) => {
    mocks.registry.activeServerId = serverId;
    return mocks.registry.servers[serverId] ?? null;
  },
  upsertServer: vi.fn(),
}));
vi.mock("../chatHistoryCache", () => ({ clearRecentChatHistory: vi.fn() }));
vi.mock("../fileLibraryCache", () => ({ clearCachedFileLists: vi.fn() }));
vi.mock("../mediaBlobCache", () => ({ clearPersistentMediaBlobCache: vi.fn() }));
vi.mock("../api/apiResponseCache", () => ({ clearApiResponseCache: vi.fn() }));
vi.mock("../features/chats/outbox/messageOutboxStore", () => ({ clearOutbox: vi.fn() }));
vi.mock("../native/localReplicaPlugin", () => ({ clearLocalReplicaProfile: vi.fn(), prepareLocalReplicaProfile: vi.fn() }));
vi.mock("../api/notifications", () => ({ unregisterDevicePushToken: vi.fn(async () => undefined) }));

import { ApiError } from "../api/client";
import { AuthProvider, useAuth } from "./AuthContext";
import type { AuthResponse } from "../api/auth";

describe("AuthProvider refresh failure", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let auth: ReturnType<typeof useAuth> | null;

  beforeEach(() => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
    mocks.apiRequest.mockReset();
    mocks.refreshSession.mockReset();
    mocks.refreshSession.mockRejectedValue(new ApiError(401, "Invalid refresh token"));
    mocks.registry.activeServerId = null;
    mocks.registry.servers = {};
    auth = null;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  });

  it("signs out after an invalid refresh and never retries it on later protected requests", async () => {
    function Probe() {
      auth = useAuth();
      return createElement("span", null, auth.currentUser ? "signed-in" : "signed-out");
    }

    await act(async () => {
      root.render(createElement(AuthProvider, null, createElement(Probe)));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.textContent).toBe("signed-out");
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      await expect(auth!.authRequest("/api/family")).rejects.toMatchObject({ status: 401 });
      await expect(auth!.authRequest("/api/chats")).rejects.toMatchObject({ status: 401 });
    });

    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(mocks.apiRequest).not.toHaveBeenCalled();
  });

  it("does not repeat a failed refresh after a protected request receives 401", async () => {
    mocks.refreshSession
      .mockResolvedValueOnce({
        accessToken: "access-token",
        tokenType: "Bearer",
        expiresInSeconds: 900,
        user: { id: "user-1" },
      } as AuthResponse)
      .mockRejectedValueOnce(new ApiError(401, "Invalid refresh token"));
    mocks.apiRequest.mockRejectedValue(new ApiError(401, "Unauthorized"));
    function Probe() {
      auth = useAuth();
      return createElement("span", null, auth.currentUser ? "signed-in" : "signed-out");
    }

    await act(async () => {
      root.render(createElement(AuthProvider, null, createElement(Probe)));
      await Promise.resolve();
    });
    expect(host.textContent).toBe("signed-in");

    await act(async () => {
      await expect(auth!.authRequest("/api/family")).rejects.toMatchObject({ status: 401 });
    });
    await act(async () => {
      await expect(auth!.authRequest("/api/chats")).rejects.toMatchObject({ status: 401 });
    });

    expect(host.textContent).toBe("signed-out");
    expect(mocks.apiRequest).toHaveBeenCalledTimes(1);
    expect(mocks.refreshSession).toHaveBeenCalledTimes(2);
  });

  it("allows switching to another saved server after the current server's refresh token expires", async () => {
    const user = { id: "user-a", username: "a" };
    mocks.registry.servers = {
      a: { id: "a", url: "https://a.example.test", name: "A", accessToken: "token-a", refreshToken: null, user, healthStatus: "online", unreadCount: 0 },
      b: { id: "b", url: "https://b.example.test", name: "B", accessToken: "token-b", refreshToken: null, user: { ...user, id: "user-b" }, healthStatus: "online", unreadCount: 0 },
    };
    mocks.registry.activeServerId = "a";
    mocks.refreshSession
      .mockRejectedValueOnce(new ApiError(401, "Expired server A session"))
      .mockResolvedValueOnce({
        accessToken: "token-b-new",
        tokenType: "Bearer",
        expiresInSeconds: 900,
        user: { ...user, id: "user-b" },
      } as AuthResponse);
    function Probe() {
      auth = useAuth();
      return createElement("span", null, auth.accessToken ?? "signed-out");
    }

    await act(async () => {
      root.render(createElement(AuthProvider, null, createElement(Probe)));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.textContent).toBe("signed-out");

    await act(async () => auth!.hotSwapServer("b"));

    expect(host.textContent).toBe("token-b-new");
    expect(mocks.refreshSession).toHaveBeenCalledTimes(2);
  });

  it("ignores a stale server refresh response that settles after switching accounts", async () => {
    let rejectServerA!: (reason: unknown) => void;
    const serverARefresh = new Promise<AuthResponse>((_resolve, reject) => { rejectServerA = reject; });
    const user = { id: "user-a", username: "a" };
    mocks.registry.servers = {
      a: { id: "a", url: "https://a.example.test", name: "A", accessToken: "token-a", refreshToken: null, user, healthStatus: "online", unreadCount: 0 },
      b: { id: "b", url: "https://b.example.test", name: "B", accessToken: "token-b", refreshToken: null, user: { ...user, id: "user-b" }, healthStatus: "online", unreadCount: 0 },
    };
    mocks.registry.activeServerId = "a";
    mocks.refreshSession
      .mockImplementationOnce(() => serverARefresh)
      .mockResolvedValueOnce({
        accessToken: "token-b-new",
        tokenType: "Bearer",
        expiresInSeconds: 900,
        user: { ...user, id: "user-b" },
      } as AuthResponse);
    function Probe() {
      auth = useAuth();
      return createElement("span", null, auth.accessToken ?? "signed-out");
    }

    await act(async () => {
      root.render(createElement(AuthProvider, null, createElement(Probe)));
      await Promise.resolve();
    });
    await act(async () => auth!.hotSwapServer("b"));
    expect(host.textContent).toBe("token-b-new");

    await act(async () => {
      rejectServerA(new ApiError(401, "Expired server A session"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.textContent).toBe("token-b-new");
  });

  it("does not restore the session when an in-flight refresh succeeds after logout", async () => {
    let resolveRefresh!: (response: AuthResponse) => void;
    const pendingRefresh = new Promise<AuthResponse>((resolve) => { resolveRefresh = resolve; });
    const user = { id: "user-a", username: "a" };
    mocks.registry.servers = {
      a: { id: "a", url: "https://a.example.test", name: "A", accessToken: "token-a", refreshToken: null, user, healthStatus: "online", unreadCount: 0 },
    };
    mocks.registry.activeServerId = "a";
    mocks.refreshSession.mockImplementationOnce(() => pendingRefresh);
    function Probe() {
      auth = useAuth();
      return createElement("span", null, auth.accessToken ?? "signed-out");
    }

    await act(async () => {
      root.render(createElement(AuthProvider, null, createElement(Probe)));
      await Promise.resolve();
    });
    expect(host.textContent).toBe("token-a");

    await act(async () => auth!.logout());
    expect(host.textContent).toBe("signed-out");

    await act(async () => {
      resolveRefresh({
        accessToken: "late-token-a",
        tokenType: "Bearer",
        expiresInSeconds: 900,
        user: { ...user, id: "user-a" },
      } as AuthResponse);
      await Promise.resolve();
    });

    expect(host.textContent).toBe("signed-out");
  });
});
