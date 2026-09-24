import { afterEach, describe, expect, it, vi } from "vitest";

import { banMemberIP, getMemberAdminDetails, inviteUrlForServer, unbanMemberIP } from "./family";
import { ApiError } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("inviteUrlForServer", () => {
  it("uses the active family server instead of a backend localhost default", () => {
    expect(
      inviteUrlForServer(
        "http://localhost:8000/invite/one-time-token",
        "https://stovo-cloud.stovo.ru/s/5ae8bb18"
      )
    ).toBe("https://stovo-cloud.stovo.ru/s/5ae8bb18/invite/one-time-token");
  });
});

describe("member administration API", () => {
  it("loads member details without using the regular member list response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "user/1", isOnline: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await getMemberAdminDetails("token", "user/1");

    expect(fetchMock.mock.calls[0][0]).toContain("/api/family/members/user%2F1/admin-details");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ accessToken: "token", credentials: "include" });
  });

  it("sends exact IP ban and manual unban requests, and preserves API errors", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Member not found" }), { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await banMemberIP("token", "member-1", "192.0.2.4");
    await unbanMemberIP("token", "member-1");
    await expect(getMemberAdminDetails("token", "missing")).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "PUT", body: JSON.stringify({ ip: "192.0.2.4" }) });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
  });
});
