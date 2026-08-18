import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetMediaBlobMemoryForTests,
  CACHED_AT_HEADER,
  getCachedFileBlob,
  MEDIA_CACHE_TTL_MS,
  peekCachedObjectUrl,
  prefetchFileBlobs,
  scheduleCacheMaintenance,
  seedMediaBlobCache,
} from "./mediaBlobCache";

type StoredResponse = { body: ArrayBuffer; type: string; status: number; headers: Record<string, string> };
type Store = Map<string, StoredResponse>;

function installFakeCaches() {
  const stores = new Map<string, Store>();

  const api = {
    open: vi.fn(async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        match: async (request: RequestInfo) => {
          const key = typeof request === "string" ? request : request.url;
          const entry = store.get(key);
          if (!entry) return undefined;
          return new Response(entry.body.slice(0), {
            status: entry.status,
            headers: {
              "Content-Type": entry.type || "application/octet-stream",
              ...entry.headers,
            },
          });
        },
        put: async (request: RequestInfo, response: Response) => {
          const key = typeof request === "string" ? request : request.url;
          // Mirror real Cache API: reject non-http(s) schemes.
          if (key.startsWith("file:")) {
            throw new TypeError(`Request scheme 'file' is unsupported`);
          }
          const headers: Record<string, string> = {};
          response.headers.forEach((val, k) => {
            headers[k] = val;
          });
          store.set(key, {
            body: await response.arrayBuffer(),
            type: response.headers.get("Content-Type") || "application/octet-stream",
            status: response.status,
            headers,
          });
        },
        delete: async (request: RequestInfo) => {
          const key = typeof request === "string" ? request : request.url;
          return store.delete(key);
        },
        keys: async () => {
          return Array.from(store.keys()).map((url) => new Request(url));
        },
      };
    }),
    delete: vi.fn(async (name: string) => stores.delete(name)),
    __stores: stores,
  };

  vi.stubGlobal("caches", api);
  return api;
}

describe("mediaBlobCache", () => {
  beforeEach(() => {
    __resetMediaBlobMemoryForTests();
    installFakeCaches();
  });

  afterEach(() => {
    __resetMediaBlobMemoryForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("persists blobs under https cache keys and reloads from Cache Storage after memory clear", async () => {
    const fetcher = vi.fn(async () => new Blob(["pdf-bytes"], { type: "application/pdf" }));

    const first = await getCachedFileBlob("token", "doc-1", fetcher);
    expect(await first.text()).toBe("pdf-bytes");
    expect(fetcher).toHaveBeenCalledTimes(1);

    __resetMediaBlobMemoryForTests();
    expect(peekCachedObjectUrl("doc-1")).toBeNull();

    const second = await getCachedFileBlob("token", "doc-1", fetcher);
    expect(await second.text()).toBe("pdf-bytes");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent fetches for the same file id", async () => {
    let resolveFetch!: (blob: Blob) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Blob>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const a = getCachedFileBlob("token", "shared", fetcher);
    const b = getCachedFileBlob("token", "shared", fetcher);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    resolveFetch(new Blob(["xlsx"], { type: "application/vnd.ms-excel" }));
    const [blobA, blobB] = await Promise.all([a, b]);
    expect(await blobA.text()).toBe("xlsx");
    expect(await blobB.text()).toBe("xlsx");
  });

  it("serves seeded uploads from memory without fetching", async () => {
    const fetcher = vi.fn(async () => new Blob(["network"]));
    seedMediaBlobCache("upload-1", new Blob(["local"], { type: "text/csv" }));

    const blob = await getCachedFileBlob("token", "upload-1", fetcher);
    expect(await blob.text()).toBe("local");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects empty network blobs", async () => {
    const fetcher = vi.fn(async () => new Blob([]));
    await expect(getCachedFileBlob("token", "empty", fetcher)).rejects.toThrow(/Empty media blob/);
  });

  it("evicts expired entries older than 14 days and refetches", async () => {
    const fetcher = vi.fn(async (_token: string, id: string) => new Blob([`content-${id}`]));

    // Fetch and store in cache
    await getCachedFileBlob("token", "ttl-1", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Simulate 15 days passing
    const cache = await caches.open("stovo-media-v2");
    const key = "https://stovo.app/cache/files/ttl-1";
    const oldTimestamp = Date.now() - (MEDIA_CACHE_TTL_MS + 1000 * 60 * 60 * 24);
    await cache.put(
      key,
      new Response("old-content", {
        headers: {
          "Content-Type": "text/plain",
          [CACHED_AT_HEADER]: String(oldTimestamp),
        },
      }),
    );

    // Clear memory so it checks disk cache
    __resetMediaBlobMemoryForTests();

    // Next fetch should find expired TTL in disk cache, evict it, and call network fetcher
    const fresh = await getCachedFileBlob("token", "ttl-1", fetcher);
    expect(await fresh.text()).toBe("content-ttl-1");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("prefetches multiple files concurrently in the background", async () => {
    const fetcher = vi.fn(async (_token: string, id: string) => new Blob([`data-${id}`]));

    prefetchFileBlobs("token", ["p1", "p2", "p3"], fetcher);

    await vi.waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(3);
    });

    // Peeking now should find them in memory cache
    expect(peekCachedObjectUrl("p1")).not.toBeNull();
    expect(peekCachedObjectUrl("p2")).not.toBeNull();
    expect(peekCachedObjectUrl("p3")).not.toBeNull();
  });

  it("cleans up expired entries during scheduleCacheMaintenance", async () => {
    const cache = await caches.open("stovo-media-v2");
    const expiredKey = "https://stovo.app/cache/files/expired-1";
    const validKey = "https://stovo.app/cache/files/valid-1";

    const oldTimestamp = Date.now() - (MEDIA_CACHE_TTL_MS + 5000);
    const recentTimestamp = Date.now();

    await cache.put(
      expiredKey,
      new Response("expired", {
        headers: { [CACHED_AT_HEADER]: String(oldTimestamp) },
      }),
    );
    await cache.put(
      validKey,
      new Response("valid", {
        headers: { [CACHED_AT_HEADER]: String(recentTimestamp) },
      }),
    );

    scheduleCacheMaintenance();

    await vi.waitFor(async () => {
      const matchExpired = await cache.match(expiredKey);
      const matchValid = await cache.match(validKey);
      expect(matchExpired).toBeUndefined();
      expect(matchValid).toBeDefined();
    });
  });
});
