import { afterEach, expect, it, vi } from "vitest";

import { apiRequest } from "./client";
import { intelligenceBrowserSessionEndpoint, intelligenceSourceOfferEndpoint, intelligenceSourceAuthorizeEndpoint } from "./intelligence";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

it("sends Intelligence API requests through the selected space only once", async () => {
  window.history.replaceState({}, "", "/s/a993a4e6/intelligence/consent");
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const parameters = {
    response_type: "code" as const, client_id: "client", redirect_uri: "https://intelligence.example/callback",
    state: "state", code_challenge: "challenge", code_challenge_method: "S256" as const,
  };

  await apiRequest(intelligenceBrowserSessionEndpoint(), { method: "POST", body: {} });
  await apiRequest(intelligenceSourceOfferEndpoint(parameters), { method: "GET" });

  expect(fetchMock.mock.calls[0][0]).toBe(`${window.location.origin}/s/a993a4e6/api/v2/intelligence/authorize-session`);
  expect(fetchMock.mock.calls[1][0]).toMatch(new RegExp(`^${window.location.origin}/s/a993a4e6/api/v2/intelligence/authorize\\?`));
  expect(intelligenceSourceAuthorizeEndpoint()).toBe("/s/a993a4e6/api/v2/intelligence/authorize");
});
