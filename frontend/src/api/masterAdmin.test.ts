import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  fetchServers,
  fetchServerSettings,
  updateServerSettings,
  createServer,
} from "./masterAdmin";

describe("masterAdmin API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches servers list with nav_tabs", async () => {
    const mockServers = [
      {
        id: 1,
        slug: "abc12345",
        name: "Test Server",
        created_at: "2026-08-20T00:00:00Z",
        status: "running",
        nav_tabs: { chats: true, storage: false, plans: true, settings: true },
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockServers,
    } as any);

    const result = await fetchServers("test-token");
    expect(result).toEqual(mockServers);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/master/servers",
      expect.objectContaining({
        headers: { Authorization: "Bearer test-token" },
      })
    );
  });

  it("fetches individual server settings", async () => {
    const mockRecord = {
      id: 1,
      slug: "abc12345",
      name: "Test Server",
      created_at: "2026-08-20T00:00:00Z",
      status: "running",
      nav_tabs: { chats: true, storage: false, plans: false, settings: true },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockRecord,
    } as any);

    const result = await fetchServerSettings("test-token", "abc12345");
    expect(result).toEqual(mockRecord);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/master/servers/abc12345/settings",
      expect.objectContaining({
        headers: { Authorization: "Bearer test-token" },
      })
    );
  });

  it("updates server settings with nav_tabs", async () => {
    const mockUpdated = {
      id: 1,
      slug: "abc12345",
      name: "Updated Name",
      created_at: "2026-08-20T00:00:00Z",
      status: "running",
      nav_tabs: { chats: true, storage: true, plans: false, settings: true },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockUpdated,
    } as any);

    const result = await updateServerSettings("test-token", "abc12345", {
      name: "Updated Name",
      nav_tabs: { chats: true, storage: true, plans: false, settings: true },
    });

    expect(result).toEqual(mockUpdated);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/master/servers/abc12345/settings",
      expect.objectContaining({
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({
          name: "Updated Name",
          nav_tabs: { chats: true, storage: true, plans: false, settings: true },
        }),
      })
    );
  });

  it("creates server with optional nav_tabs", async () => {
    const mockCreated = {
      id: 2,
      slug: "xyz98765",
      name: "New Cluster",
      invite_url: "https://example.com/invite/123",
      nav_tabs: { chats: true, storage: true, plans: true, settings: true },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockCreated,
    } as any);

    const result = await createServer(
      "test-token",
      "",
      "New Cluster",
      { chats: true, storage: true, plans: true, settings: true },
      { direct: true, group: false, channel: true, voice: true }
    );

    expect(result).toEqual(mockCreated);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/master/servers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          slug: "",
          name: "New Cluster",
          nav_tabs: { chats: true, storage: true, plans: true, settings: true },
          chat_types: { direct: true, group: false, channel: true, voice: true },
        }),
      })
    );
  });
});
