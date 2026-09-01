import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getApiUrl } from "./client";
import { fetchUnfurlData } from "./unfurl";

describe("unfurl API", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches unfurl data from the API endpoint with proper encoded URL", async () => {
    const mockData = {
      url: "https://example.com/article",
      title: "Example Article",
      description: "Description of example article",
      siteName: "Example",
      favicon: "https://example.com/favicon.ico",
      mediaType: "website"
    };

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const result = await fetchUnfurlData("https://example.com/article", "test-token");
    expect(result).toEqual(mockData);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, init] = fetchMock.mock.calls[0];
    expect(target).toBe(`${getApiUrl()}/api/unfurl?url=${encodeURIComponent("https://example.com/article")}`);
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-token");
  });
});
