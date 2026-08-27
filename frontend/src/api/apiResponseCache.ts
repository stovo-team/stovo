import { isAndroidLocalReplicaPlatform, loadNativeReplicaValue, saveNativeReplicaValue } from "../native/localReplicaPlugin";

const CACHE_PREFIX = "stovo_api_cache_v1:";
const NATIVE_KEY_PREFIX = "api-response:";

type CacheEntry = { savedAt: number; payload: unknown };

function key(profileId: string, endpoint: string) {
  return `${CACHE_PREFIX}${encodeURIComponent(profileId)}:${endpoint}`;
}

/**
 * Persists successful, account-scoped GET payloads. It deliberately stores
 * responses, not credentials, and Android routes the value into its
 * Keystore-encrypted replica.
 */
export async function saveApiResponseCache(profileId: string | null | undefined, endpoint: string, payload: unknown): Promise<void> {
  if (!profileId || !endpoint) return;
  const serialized = JSON.stringify({ savedAt: Date.now(), payload } satisfies CacheEntry);
  if (await saveNativeReplicaValue(profileId, `${NATIVE_KEY_PREFIX}${endpoint}`, serialized)) return;
  if (isAndroidLocalReplicaPlatform() || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key(profileId, endpoint), serialized);
  } catch {
    // Cache quota and private browsing failures must not affect the request.
  }
}

/** Returns the last known server payload for an account and endpoint. */
export async function loadApiResponseCache<T>(profileId: string | null | undefined, endpoint: string): Promise<T | null> {
  if (!profileId || !endpoint) return null;
  let raw = await loadNativeReplicaValue(profileId, `${NATIVE_KEY_PREFIX}${endpoint}`);
  if (!raw && !isAndroidLocalReplicaPlatform() && typeof localStorage !== "undefined") {
    try { raw = localStorage.getItem(key(profileId, endpoint)); } catch { /* unavailable */ }
  }
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as CacheEntry;
    return entry && typeof entry === "object" && "payload" in entry ? entry.payload as T : null;
  } catch {
    return null;
  }
}

/** Removes every persisted API response belonging to one account. */
export async function clearApiResponseCache(profileId?: string | null): Promise<void> {
  if (!profileId || isAndroidLocalReplicaPlatform() || typeof localStorage === "undefined") return;
  const prefix = `${CACHE_PREFIX}${encodeURIComponent(profileId)}:`;
  try {
    for (const storageKey of Object.keys(localStorage)) {
      if (storageKey.startsWith(prefix)) localStorage.removeItem(storageKey);
    }
  } catch {
    // Best effort during logout/invalid-session cleanup.
  }
}
