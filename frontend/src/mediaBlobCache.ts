/**
 * Persistent in-memory + Cache Storage blob cache for chat media.
 * Object URLs are retained across component mounts so videos/images load once.
 */

const CACHE_NAME = "stovo-media-v1";
const MAX_MEMORY_ENTRIES = 64;

type CacheEntry = {
  blob: Blob;
  objectUrl: string;
  lastAccess: number;
};

const memory = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Blob>>();

function cacheKey(fileId: string): string {
  return `file:${fileId}`;
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

async function readFromCacheStorage(fileId: string): Promise<Blob | null> {
  if (typeof caches === "undefined") return null;
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
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      cacheKey(fileId),
      new Response(blob, {
        headers: {
          "Content-Type": blob.type || "application/octet-stream",
          "Content-Length": String(blob.size),
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
    void writeToCacheStorage(id, blob);
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
