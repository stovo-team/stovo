import { afterEach, describe, expect, it, vi } from "vitest";

import { createGuestMeetingSession } from "./guestMeetings";

describe("createGuestMeetingSession", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends auth and JSON headers together for a signed-in host", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ id: "session-1", state: "admitted" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await createGuestMeetingSession("public-link-token", "Meeting Host", "account-access-token");

    const request = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(request?.headers);
    expect(headers.get("Authorization")).toBe("Bearer account-access-token");
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Content-Type")).toBe("application/json");
  });
});
