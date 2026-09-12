import {
  isAndroidLocalReplicaPlatform,
  loadNativeReplicaValue,
  saveNativeReplicaValue,
} from "./native/localReplicaPlugin";

const DATABASE_NAME = "stovo-file-library-v1";
const STORE_NAME = "file-lists";
const CANVAS_PREVIEW_STORE_NAME = "canvas-previews";
const LOCAL_STORAGE_PREFIX = "stovo_cached_files_";
const CANVAS_PREVIEW_LOCAL_STORAGE_PREFIX = "stovo_cached_canvas_previews_";
const NATIVE_CACHE_KEY = "file-library";
const NATIVE_CANVAS_PREVIEW_CACHE_KEY = "canvas-previews";

type CachedFileList<T> = {
  userId: string;
  updatedAt: number;
  files: T[];
};

function localKey(userId: string) {
  return `${LOCAL_STORAGE_PREFIX}${userId}`;
}

function canvasPreviewLocalKey(userId: string) {
  return `${CANVAS_PREVIEW_LOCAL_STORAGE_PREFIX}${userId}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 2);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "userId" });
      }
      if (!database.objectStoreNames.contains(CANVAS_PREVIEW_STORE_NAME)) {
        database.createObjectStore(CANVAS_PREVIEW_STORE_NAME, { keyPath: "userId" });
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
  // localStorage is immediately available to the WebView. Prefer it for the
  // first paint instead of waiting for the asynchronous Capacitor bridge.
  const fallback = typeof localStorage === "undefined" ? null : loadLocal<T>(userId);
  if (fallback) return fallback;
  const native = await loadNativeReplicaValue(userId, NATIVE_CACHE_KEY);
  if (native) {
    try {
      const parsed = JSON.parse(native);
      if (Array.isArray(parsed)) return parsed as T[];
    } catch {
      // Fall through to the existing browser cache while a profile migrates.
    }
  }
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
  // The native replica is the preferred durable store on Android, while the
  // WebView copy lets the Storage page paint immediately before its bridge is
  // ready (and remains the fallback on browsers without the native plugin).
  await saveNativeReplicaValue(userId, NATIVE_CACHE_KEY, JSON.stringify(files));
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

export type CachedCanvasPreview<T> = {
  updatedAt: string;
  updates: T[];
};

/** Reads cached canvas document updates so previews can render immediately. */
export async function loadCachedCanvasPreviews<T>(userId: string): Promise<Record<string, CachedCanvasPreview<T>> | null> {
  if (!userId) return null;
  let fallback: Record<string, CachedCanvasPreview<T>> | null = null;
  if (typeof localStorage !== "undefined") {
    try {
      const parsed = JSON.parse(localStorage.getItem(canvasPreviewLocalKey(userId)) ?? "null");
      if (parsed && typeof parsed === "object") fallback = parsed as Record<string, CachedCanvasPreview<T>>;
    } catch {
      // Best effort cache.
    }
  }
  if (fallback) return fallback;
  const native = await loadNativeReplicaValue(userId, NATIVE_CANVAS_PREVIEW_CACHE_KEY);
  if (native) {
    try {
      const parsed = JSON.parse(native);
      if (parsed && typeof parsed === "object") return parsed as Record<string, CachedCanvasPreview<T>>;
    } catch {
      // Fall through to the browser cache while a profile migrates.
    }
  }
  if (typeof indexedDB === "undefined") return fallback;
  try {
    const database = await openDatabase();
    const entry = await new Promise<{ previews?: Record<string, CachedCanvasPreview<T>> } | undefined>((resolve, reject) => {
      const request = database.transaction(CANVAS_PREVIEW_STORE_NAME, "readonly").objectStore(CANVAS_PREVIEW_STORE_NAME).get(userId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    database.close();
    return entry?.previews && typeof entry.previews === "object" ? entry.previews : fallback;
  } catch {
    return fallback;
  }
}

/** Persists canvas document updates used by the file-library previews. */
export async function saveCachedCanvasPreviews<T>(userId: string, previews: Record<string, CachedCanvasPreview<T>>): Promise<void> {
  if (!userId) return;
  const serialized = JSON.stringify(previews);
  await saveNativeReplicaValue(userId, NATIVE_CANVAS_PREVIEW_CACHE_KEY, serialized);
  if (typeof localStorage !== "undefined") {
    try { localStorage.setItem(canvasPreviewLocalKey(userId), serialized); } catch { /* best effort */ }
  }
  if (typeof indexedDB === "undefined") return;
  try {
    const database = await openDatabase();
    const transaction = database.transaction(CANVAS_PREVIEW_STORE_NAME, "readwrite");
    transaction.objectStore(CANVAS_PREVIEW_STORE_NAME).put({ userId, updatedAt: Date.now(), previews });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  } catch {
    // LocalStorage remains the fallback.
  }
}

export async function clearCachedFileLists(): Promise<void> {
  if (typeof localStorage !== "undefined") {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(LOCAL_STORAGE_PREFIX) || key.startsWith(CANVAS_PREVIEW_LOCAL_STORAGE_PREFIX)) localStorage.removeItem(key);
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
