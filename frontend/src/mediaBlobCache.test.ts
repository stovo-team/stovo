import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetMediaBlobMemoryForTests,
  getCachedFileBlob,
  peekCachedObjectUrl,
  seedMediaBlobCache,
} from "./mediaBlobCache";

type StoredResponse = { body: ArrayBuffer; type: string; status: number };
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
            },
          });
        },
        put: async (request: RequestInfo, response: Response) => {
          const key = typeof request === "string" ? request : request.url;
          // Mirror real Cache API: reject non-http(s) schemes.
          if (key.startsWith("file:")) {
            throw new TypeError(`Request scheme 'file' is unsupported`);
          }
          store.set(key, {
            body: await response.arrayBuffer(),
            type: response.headers.get("Content-Type") || "application/octet-stream",
            status: response.status,
          });
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
});
