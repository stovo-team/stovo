const DATABASE_NAME = "stovo-file-library-v1";
const STORE_NAME = "file-lists";
const LOCAL_STORAGE_PREFIX = "stovo_cached_files_";

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
  try {
    const raw = localStorage.getItem(localKey(userId));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed as T[] : null;
  } catch {
    return null;
  }
}

/** Reads last-known metadata without delaying the storage page's refresh. */
export async function loadCachedFileList<T>(userId: string): Promise<T[] | null> {
  if (!userId) return null;
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
    return Array.isArray(entry?.files) ? entry.files : fallback;
  } catch {
    return fallback;
  }
}

/** Stores metadata only; file bytes stay in the dedicated media cache. */
export async function saveCachedFileList<T>(userId: string, files: T[]): Promise<void> {
  if (!userId) return;
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
