import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCanvas } from "./canvas";
import { getApiUrl } from "./client";

describe("Canvas creation API", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "canvas-1" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("includes the initial document in the same request that creates and broadcasts the Canvas", async () => {
    await createCanvas("access-token", "chat-1", "Imported Markdown", "encoded-yjs-update");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${getApiUrl()}/api/v1/plugins/canvas/canvases`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      chatId: "chat-1",
      title: "Imported Markdown",
      initialUpdate: "encoded-yjs-update",
    });
  });

  it("omits an initial update for ordinary empty Canvas creation", async () => {
    await createCanvas("access-token", "chat-1", "Empty Canvas");

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      chatId: "chat-1",
      title: "Empty Canvas",
    });
  });
});

describe("Canvas create retry identity", () => {
  it("includes a stable canvas ID so a retried draft cannot create a duplicate", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "stable-canvas" }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", request);
    try {
      await createCanvas("token", "chat", "Draft", "initial-state", "11111111-1111-4111-8111-111111111111");
      expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toHaveProperty("canvasId", "11111111-1111-4111-8111-111111111111");
    } finally { vi.unstubAllGlobals(); }
  });
});
