import { isAndroidLocalReplicaPlatform, loadNativeReplicaValue, saveNativeReplicaValue } from "../native/localReplicaPlugin";

const CACHE_PREFIX = "stovo_api_cache_v1:";
const NATIVE_KEY_PREFIX = "api-response:";

type CacheEntry = { savedAt: number; payload: unknown };

// L1: synchronous in-memory cache — survives the current session without any
// async reads. Populated on every successful network response and on every
// successful async read from L2 (localStorage / native replica).
const memoryCache = new Map<string, CacheEntry>();

// In-flight deduplication registry.  Maps a cache key to the in-flight
// network Promise so that simultaneous callers share one request.
const inFlightRequests = new Map<string, Promise<unknown>>();

function storageKey(profileId: string, endpoint: string) {
  return `${CACHE_PREFIX}${encodeURIComponent(profileId)}:${endpoint}`;
}

function memKey(profileId: string, endpoint: string) {
  return `${profileId}::${endpoint}`;
}

/**
 * Persists successful, account-scoped GET payloads. It deliberately stores
 * responses, not credentials, and Android routes the value into its
 * Keystore-encrypted replica.
 */
export async function saveApiResponseCache(profileId: string | null | undefined, endpoint: string, payload: unknown): Promise<void> {
  if (!profileId || !endpoint) return;
  const entry: CacheEntry = { savedAt: Date.now(), payload };
  // Always populate L1 first — synchronous, zero-cost.
  memoryCache.set(memKey(profileId, endpoint), entry);
  const serialized = JSON.stringify(entry satisfies CacheEntry);
  if (await saveNativeReplicaValue(profileId, `${NATIVE_KEY_PREFIX}${endpoint}`, serialized)) return;
  if (isAndroidLocalReplicaPlatform() || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(profileId, endpoint), serialized);
  } catch {
    // Cache quota and private browsing failures must not affect the request.
  }
}

/**
 * Synchronous peek into the L1 in-memory cache.  Returns the last known
 * payload or null without any I/O.  Use this during render or before the
 * async load resolves so the UI can display stale-but-useful data immediately.
 */
export function peekApiResponseCache<T>(profileId: string | null | undefined, endpoint: string): T | null {
  if (!profileId || !endpoint) return null;
  const entry = memoryCache.get(memKey(profileId, endpoint));
  return entry ? entry.payload as T : null;
}

/** Returns the last known server payload for an account and endpoint. */
export async function loadApiResponseCache<T>(profileId: string | null | undefined, endpoint: string): Promise<T | null> {
  if (!profileId || !endpoint) return null;
  // L1 hit — return immediately without any I/O.
  const cached = memoryCache.get(memKey(profileId, endpoint));
  if (cached) return cached.payload as T;
  // L2 — native replica or localStorage.
  let raw = await loadNativeReplicaValue(profileId, `${NATIVE_KEY_PREFIX}${endpoint}`);
  if (!raw && !isAndroidLocalReplicaPlatform() && typeof localStorage !== "undefined") {
    try { raw = localStorage.getItem(storageKey(profileId, endpoint)); } catch { /* unavailable */ }
  }
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as CacheEntry;
    if (entry && typeof entry === "object" && "payload" in entry) {
      // Promote to L1 so subsequent synchronous peeks succeed.
      memoryCache.set(memKey(profileId, endpoint), entry);
      return entry.payload as T;
    }
    return null;
  } catch {
    return null;
  }
}

/** Removes every persisted API response belonging to one account. */
export async function clearApiResponseCache(profileId?: string | null): Promise<void> {
  if (!profileId) return;
  // Clear L1 entries for this profile.
  for (const key of memoryCache.keys()) {
    if (key.startsWith(`${profileId}::`)) memoryCache.delete(key);
  }
  if (isAndroidLocalReplicaPlatform() || typeof localStorage === "undefined") return;
  const prefix = `${CACHE_PREFIX}${encodeURIComponent(profileId)}:`;
  try {
    for (const storageKey of Object.keys(localStorage)) {
      if (storageKey.startsWith(prefix)) localStorage.removeItem(storageKey);
    }
  } catch {
    // Best effort during logout/invalid-session cleanup.
  }
}

/**
 * Wraps an async request factory with in-flight deduplication.  If an
 * identical request (same profileId + endpoint) is already in-flight, the
 * caller receives the same Promise instead of firing a second network round-
 * trip.  Once the request settles the registration is removed automatically.
 */
export function deduplicateRequest<T>(
  profileId: string | null | undefined,
  endpoint: string,
  factory: () => Promise<T>,
): Promise<T> {
  if (!profileId) return factory();
  const key = memKey(profileId, endpoint);
  const existing = inFlightRequests.get(key);
  if (existing) return existing as Promise<T>;
  const promise = factory().finally(() => {
    inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, promise as Promise<unknown>);
  return promise;
}
