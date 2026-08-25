import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, getApiUrl } from "./client";
import { getSyncPage } from "./sync";

describe("sync API", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests one authenticated page with an opaque cursor and requested limit", async () => {
    const page = {
      events: [{ sequence: 11, eventId: "event-11", type: "message.created", version: 1, aggregateType: "message", aggregateId: "m-1", occurredAt: "2026-08-25T00:00:00Z", payload: { id: "m-1" } }],
      nextCursor: "next-opaque-cursor",
      hasMore: true
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(page), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(getSyncPage("access-token", { cursor: "a/b ?", limit: 25 })).resolves.toEqual(page);

    const [target, init] = fetchMock.mock.calls[0];
    expect(target).toBe(`${getApiUrl()}/api/sync?limit=25&cursor=a%2Fb+%3F`);
    expect(init?.method).toBeUndefined();
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer access-token");
  });

  it("uses a bounded default limit and omits blank cursors", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ events: [], nextCursor: null, hasMore: false }), { status: 200 }));

    await getSyncPage("access-token", { cursor: "   ", limit: 9999 });

    expect(fetchMock.mock.calls[0][0]).toBe(`${getApiUrl()}/api/sync?limit=500`);
  });

  it("preserves server sync errors", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: "Invalid sync cursor" }), {
      status: 400,
      statusText: "Bad Request",
      headers: { "Content-Type": "application/json" }
    }));

    const error = await getSyncPage("access-token", { cursor: "invalid-cursor" }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, detail: "Invalid sync cursor" });
  });
});
