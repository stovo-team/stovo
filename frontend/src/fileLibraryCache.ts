import {
  isAndroidLocalReplicaPlatform,
  loadNativeReplicaValue,
  saveNativeReplicaValue,
} from "./native/localReplicaPlugin";

const DATABASE_NAME = "stovo-file-library-v1";
const STORE_NAME = "file-lists";
const LOCAL_STORAGE_PREFIX = "stovo_cached_files_";
const NATIVE_CACHE_KEY = "file-library";

type CachedFileList<T> = {
  userId: string;
  updatedAt: number;
  files: T[];
};

function localKey(userId: string) {
  return `${LOCAL_STORAGE_PREFIX}${userId}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function loadLocal<T>(userId: string): T[] | null {
  if (isAndroidLocalReplicaPlatform()) return null;
  try {
    const raw = localStorage.getItem(localKey(userId));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed as T[] : null;
  } catch {
    return null;
  }
}

async function removeLegacyFileList(userId: string): Promise<void> {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(localKey(userId));
    } catch {
      // The IndexedDB cleanup below remains useful when localStorage is unavailable.
    }
  }
  if (typeof indexedDB === "undefined") return;
  try {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(userId);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  } catch {
    // Best effort: a later encrypted write retries the migration cleanup.
  }
}

/** Reads last-known metadata without delaying the storage page's refresh. */
export async function loadCachedFileList<T>(userId: string): Promise<T[] | null> {
  if (!userId) return null;
  const native = await loadNativeReplicaValue(userId, NATIVE_CACHE_KEY);
  if (native) {
    try {
      const parsed = JSON.parse(native);
      if (Array.isArray(parsed)) return parsed as T[];
    } catch {
      // Fall through to the existing browser cache while a profile migrates.
    }
  }
  const fallback = typeof localStorage === "undefined" ? null : loadLocal<T>(userId);
  if (typeof indexedDB === "undefined") return fallback;
  try {
    const database = await openDatabase();
    const entry = await new Promise<CachedFileList<T> | undefined>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(userId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    database.close();
    if (Array.isArray(entry?.files)) {
      if (isAndroidLocalReplicaPlatform()) void saveCachedFileList(userId, entry.files);
      return entry.files;
    }
    if (fallback && isAndroidLocalReplicaPlatform()) void saveCachedFileList(userId, fallback);
    return fallback;
  } catch {
    if (fallback && isAndroidLocalReplicaPlatform()) void saveCachedFileList(userId, fallback);
    return fallback;
  }
}

/** Stores metadata only; file bytes stay in the dedicated media cache. */
export async function saveCachedFileList<T>(userId: string, files: T[]): Promise<void> {
  if (!userId) return;
  if (await saveNativeReplicaValue(userId, NATIVE_CACHE_KEY, JSON.stringify(files))) {
    void removeLegacyFileList(userId);
    return;
  }
  // Do not fall back to a plaintext WebView cache on Android. A failed native
  // write is observable as a missed cache refresh, not as leaked account data.
  if (isAndroidLocalReplicaPlatform()) return;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(localKey(userId), JSON.stringify(files));
    } catch {
      // Cache persistence is an optimisation, never a user-visible failure.
    }
  }
  if (typeof indexedDB === "undefined") return;
  try {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ userId, updatedAt: Date.now(), files });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  } catch {
    // LocalStorage, when available, remains the fallback.
  }
}

export async function clearCachedFileLists(): Promise<void> {
  if (typeof localStorage !== "undefined") {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(LOCAL_STORAGE_PREFIX)) localStorage.removeItem(key);
      }
    } catch {
      // Non-fatal.
    }
  }
  if (typeof indexedDB === "undefined") return;
  try {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DATABASE_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Non-fatal.
  }
}
