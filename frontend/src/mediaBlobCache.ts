/**
 * Persistent in-memory + Cache Storage blob cache for chat media and documents.
 * Object URLs are retained across component mounts so videos/images/docs load once.
 * Cache Storage keys must be http(s) URLs — `file:` schemes are rejected by the Cache API.
 */

export const CACHE_NAME = "stovo-media-v2";
export const LEGACY_CACHE_NAMES = ["stovo-media-v1"] as const;
export const MAX_MEMORY_ENTRIES = 64;
export const MEDIA_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
export const CACHED_AT_HEADER = "X-Stovo-Cached-At";
const MAX_CONCURRENT_FETCHES = 4;

type CacheEntry = {
  blob: Blob;
  objectUrl: string;
  lastAccess: number;
};

const memory = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Blob>>();
let maintenanceStarted = false;

let activeFetches = 0;
const fetchQueue: Array<() => void> = [];

async function acquireFetchSlot(): Promise<() => void> {
  if (activeFetches < MAX_CONCURRENT_FETCHES) {
    activeFetches += 1;
    return () => releaseFetchSlot();
  }
  return new Promise<() => void>((resolve) => {
    fetchQueue.push(() => {
      activeFetches += 1;
      resolve(() => releaseFetchSlot());
    });
  });
}

function releaseFetchSlot(): void {
  activeFetches -= 1;
  if (fetchQueue.length > 0 && activeFetches < MAX_CONCURRENT_FETCHES) {
    const next = fetchQueue.shift();
    if (next) next();
  }
}

function cacheKey(fileId: string): string {
  // Must be a valid http(s) Request URL. `file:${id}` becomes file:///… and Cache.put fails silently.
  return `https://stovo.app/cache/files/${encodeURIComponent(fileId)}`;
}

function touch(entry: CacheEntry): Blob {
  entry.lastAccess = Date.now();
  return entry.blob;
}

function evictIfNeeded(): void {
  if (memory.size <= MAX_MEMORY_ENTRIES) return;
  const ranked = [...memory.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess);
  const removeCount = memory.size - MAX_MEMORY_ENTRIES;
  for (let i = 0; i < removeCount; i += 1) {
    const [key, entry] = ranked[i];
    URL.revokeObjectURL(entry.objectUrl);
    memory.delete(key);
  }
}

export function scheduleCacheMaintenance(): void {
  if (maintenanceStarted || typeof caches === "undefined") return;
  maintenanceStarted = true;
  void (async () => {
    // 1. Delete legacy cache versions
    for (const name of LEGACY_CACHE_NAMES) {
      try {
        await caches.delete(name);
      } catch {
        // Non-fatal.
      }
    }
    // 2. Prune expired entries in the active cache (older than 14 days)
    try {
      const cache = await caches.open(CACHE_NAME);
      const requests = await cache.keys();
      const now = Date.now();
      for (const request of requests) {
        try {
          const response = await cache.match(request);
          if (response) {
            const cachedAtStr = response.headers.get(CACHED_AT_HEADER);
            if (cachedAtStr) {
              const cachedAt = Number(cachedAtStr);
              if (Number.isFinite(cachedAt) && now - cachedAt > MEDIA_CACHE_TTL_MS) {
                await cache.delete(request);
              }
            }
          }
        } catch {
          // Non-fatal per-item error
        }
      }
    } catch {
      // Non-fatal.
    }
  })();
}

async function readFromCacheStorage(fileId: string): Promise<Blob | null> {
  if (typeof caches === "undefined") return null;
  scheduleCacheMaintenance();
  try {
    const cache = await caches.open(CACHE_NAME);
    const key = cacheKey(fileId);
    const response = await cache.match(key);
    if (!response || !response.ok) return null;

    const cachedAtStr = response.headers.get(CACHED_AT_HEADER);
    if (cachedAtStr) {
      const cachedAt = Number(cachedAtStr);
      if (Number.isFinite(cachedAt) && Date.now() - cachedAt > MEDIA_CACHE_TTL_MS) {
        // Expired after 14 days: delete and treat as cache miss
        void cache.delete(key).catch(() => undefined);
        return null;
      }
    }

    return response.blob();
  } catch {
    return null;
  }
}

async function writeToCacheStorage(fileId: string, blob: Blob): Promise<void> {
  if (typeof caches === "undefined") return;
  scheduleCacheMaintenance();
  try {
    const cache = await caches.open(CACHE_NAME);
    // Prefer ArrayBuffer body — some WebViews mishandle Blob Request bodies.
    const body = await blob.arrayBuffer();
    await cache.put(
      cacheKey(fileId),
      new Response(body, {
        headers: {
          "Content-Type": blob.type || "application/octet-stream",
          "Content-Length": String(body.byteLength),
          [CACHED_AT_HEADER]: String(Date.now()),
        },
      }),
    );
  } catch {
    // Quota or private-mode failures are non-fatal.
  }
}

function remember(fileId: string, blob: Blob): CacheEntry {
  const existing = memory.get(fileId);
  if (existing && existing.blob === blob) {
    existing.lastAccess = Date.now();
    return existing;
  }
  if (existing) {
    URL.revokeObjectURL(existing.objectUrl);
  }
  const entry: CacheEntry = {
    blob,
    objectUrl: URL.createObjectURL(blob),
    lastAccess: Date.now(),
  };
  memory.set(fileId, entry);
  evictIfNeeded();
  return entry;
}

export async function getCachedFileBlob(
  accessToken: string,
  fileId: string,
  fetcher: (accessToken: string, fileId: string) => Promise<Blob>,
): Promise<Blob> {
  const id = fileId.trim();
  if (!id) throw new Error("Missing file id");

  const cached = memory.get(id);
  if (cached) return touch(cached);

  const pending = inflight.get(id);
  if (pending) return pending;

  const load = (async () => {
    const fromDisk = await readFromCacheStorage(id);
    if (fromDisk && fromDisk.size > 0) {
      remember(id, fromDisk);
      return fromDisk;
    }
    const release = await acquireFetchSlot();
    try {
      const blob = await fetcher(accessToken, id);
      if (blob.size === 0) throw new Error("Empty media blob");
      remember(id, blob);
      await writeToCacheStorage(id, blob);
      return blob;
    } finally {
      release();
    }
  })();

  inflight.set(id, load);
  try {
    return await load;
  } finally {
    inflight.delete(id);
  }
}

export async function getCachedObjectUrl(
  accessToken: string,
  fileId: string,
  fetcher: (accessToken: string, fileId: string) => Promise<Blob>,
): Promise<string> {
  const id = fileId.trim();
  await getCachedFileBlob(accessToken, id, fetcher);
  const entry = memory.get(id);
  if (!entry) throw new Error("Media cache miss after load");
  entry.lastAccess = Date.now();
  return entry.objectUrl;
}

export function peekCachedObjectUrl(fileId: string): string | null {
  const entry = memory.get(fileId.trim());
  if (!entry) return null;
  entry.lastAccess = Date.now();
  return entry.objectUrl;
}

export function seedMediaBlobCache(fileId: string, blob: Blob): string {
  const entry = remember(fileId.trim(), blob);
  void writeToCacheStorage(fileId.trim(), blob).catch(() => undefined);
  return entry.objectUrl;
}

/** Pre-cache media blobs in the background with controlled concurrency. */
export function prefetchFileBlobs(
  accessToken: string,
  fileIds: string[],
  fetcher: (accessToken: string, fileId: string) => Promise<Blob>,
): void {
  if (!accessToken?.trim() || !fileIds || fileIds.length === 0) return;
  for (const rawId of fileIds) {
    const id = rawId?.trim();
    if (!id) continue;
    if (memory.has(id) || inflight.has(id)) continue;
    void getCachedFileBlob(accessToken, id, fetcher).catch(() => undefined);
  }
}

/** Test helper: drop in-memory entries and revoke their object URLs. */
export function clearMediaBlobCache(): void {
  for (const entry of memory.values()) {
    URL.revokeObjectURL(entry.objectUrl);
  }
  memory.clear();
  inflight.clear();
  fetchQueue.length = 0;
  activeFetches = 0;
}

/** Test helper — clears in-memory entries without touching Cache Storage. */
export function __resetMediaBlobMemoryForTests(): void {
  for (const entry of memory.values()) {
    URL.revokeObjectURL(entry.objectUrl);
  }
  memory.clear();
  inflight.clear();
  fetchQueue.length = 0;
  activeFetches = 0;
  maintenanceStarted = false;
}
