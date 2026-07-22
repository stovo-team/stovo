import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, getApiUrl } from "./client";
import { createMediaPlaybackToken, getMediaPlaybackUrl } from "./files";

describe("media playback file API", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a scoped playback token with an authenticated POST", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ token: "scoped-token", expiresAt: "2026-07-24T08:00:00Z" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    await expect(createMediaPlaybackToken("access-token", "file/with%opaque value")).resolves.toEqual({
      token: "scoped-token",
      expiresAt: "2026-07-24T08:00:00Z"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, init] = fetchMock.mock.calls[0];
    expect(target).toBe(`${getApiUrl()}/api/files/file%2Fwith%25opaque%20value/playback-token`);
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer access-token");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it.each([
    "file/part",
    "file%2Fpart",
    " file name ",
    "музыка/一",
    "file?token=must-not-be-query"
  ])("constructs one credential-free encoded media segment for %s", (fileId) => {
    const target = getMediaPlaybackUrl(fileId);
    expect(target).toBe(`${getApiUrl()}/api/media/${encodeURIComponent(fileId)}`);
    const parsed = new URL(target);
    expect(parsed.search).toBe("");
    expect(parsed.pathname).toBe(`/api/media/${encodeURIComponent(fileId)}`);
  });

  it("preserves shared ApiError behavior without putting credentials in the URL", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "File not found" }), {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json" }
      })
    );

    const request = createMediaPlaybackToken("access-secret", "file?playback=secret");
    await expect(request).rejects.toMatchObject<ApiError>({
      status: 404,
      detail: "File not found"
    });

    const [target] = fetchMock.mock.calls[0];
    expect(String(target)).toBe(`${getApiUrl()}/api/files/file%3Fplayback%3Dsecret/playback-token`);
    expect(String(target)).not.toContain("access-secret");
    expect(new URL(String(target)).search).toBe("");
  });
});
