/**
 * Persistent in-memory + Cache Storage blob cache for chat media and documents.
 * Object URLs are retained across component mounts so videos/images/docs load once.
 * Cache Storage keys must be http(s) URLs — `file:` schemes are rejected by the Cache API.
 */

const CACHE_NAME = "stovo-media-v2";
const LEGACY_CACHE_NAMES = ["stovo-media-v1"] as const;
const MAX_MEMORY_ENTRIES = 64;

type CacheEntry = {
  blob: Blob;
  objectUrl: string;
  lastAccess: number;
};

const memory = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Blob>>();
let legacyCleanupStarted = false;

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

function scheduleLegacyCacheCleanup(): void {
  if (legacyCleanupStarted || typeof caches === "undefined") return;
  legacyCleanupStarted = true;
  void (async () => {
    for (const name of LEGACY_CACHE_NAMES) {
      try {
        await caches.delete(name);
      } catch {
        // Non-fatal.
      }
    }
  })();
}

async function readFromCacheStorage(fileId: string): Promise<Blob | null> {
  if (typeof caches === "undefined") return null;
  scheduleLegacyCacheCleanup();
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(cacheKey(fileId));
    if (!response || !response.ok) return null;
    return response.blob();
  } catch {
    return null;
  }
}

async function writeToCacheStorage(fileId: string, blob: Blob): Promise<void> {
  if (typeof caches === "undefined") return;
  scheduleLegacyCacheCleanup();
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
    const blob = await fetcher(accessToken, id);
    if (blob.size === 0) throw new Error("Empty media blob");
    remember(id, blob);
    await writeToCacheStorage(id, blob);
    return blob;
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
  return remember(fileId.trim(), blob).objectUrl;
}

/** Test helper: drop in-memory entries and revoke their object URLs. */
export function clearMediaBlobCache(): void {
  for (const entry of memory.values()) {
    URL.revokeObjectURL(entry.objectUrl);
  }
  memory.clear();
  inflight.clear();
}

/** Test helper — clears in-memory entries without touching Cache Storage. */
export function __resetMediaBlobMemoryForTests(): void {
  for (const entry of memory.values()) {
    URL.revokeObjectURL(entry.objectUrl);
  }
  memory.clear();
  inflight.clear();
  legacyCleanupStarted = false;
}
