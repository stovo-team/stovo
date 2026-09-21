import {
  isAndroidLocalReplicaPlatform,
  loadNativeReplicaValue,
  saveNativeReplicaValue,
} from "./native/localReplicaPlugin";

const DATABASE_NAME = "stovo-chat-history-v1";
const STORE_NAME = "recent-history";
const CHAT_LIST_KEY = "__chat_list__";

export type CachedChatHistory<T extends { id: string } = { id: string }> = {
  userId: string;
  chatId: string;
  accessedAt: number;
  messages: T[];
};

export type CachedChatList<T = unknown> = {
  userId: string;
  chatId: string;
  accessedAt: number;
  chats: T[];
};

export function mergeLatestHistory<T extends { id: string }>(cached: T[], fresh: T[]): T[] {
  const freshByID = new Map(fresh.map((message) => [message.id, message]));
  return cached
    .filter((message) => !freshByID.has(message.id))
    .concat(fresh);
}

export function trimRecentChatHistory<T extends { id: string }>(
  entries: Array<Pick<CachedChatHistory<T>, "chatId" | "accessedAt" | "messages">>,
) {
  return [...entries]
    .filter((entry) => entry.chatId !== CHAT_LIST_KEY)
    .sort((left, right) => left.accessedAt - right.accessedAt)
    .map((entry) => ({ ...entry, messages: [...entry.messages] }));
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: ["userId", "chatId"] });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function getLocalStorageKey(userId: string): string {
  return `stovo_cached_chats_${userId}`;
}

function getLastActiveChatKey(userId: string): string {
  return `stovo_last_active_chat_${userId}`;
}

export function loadLastActiveChatId(userId: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(getLastActiveChatKey(userId));
  } catch {
    return null;
  }
}

export function saveLastActiveChatId(userId: string, chatId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(getLastActiveChatKey(userId), chatId);
  } catch {
    // Non-fatal.
  }
}

export function loadCachedChatListFromLocalStorage<T>(userId: string): T[] | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(getLocalStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

function saveCachedChatListToLocalStorage<T>(userId: string, chats: T[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(getLocalStorageKey(userId), JSON.stringify(chats));
  } catch {
    // Non-fatal.
  }
}

async function removeLegacyCacheEntry(userId: string, chatId: string): Promise<void> {
  if (typeof localStorage !== "undefined") {
    try {
      if (chatId === CHAT_LIST_KEY) {
        localStorage.removeItem(getLocalStorageKey(userId));
      } else {
        localStorage.removeItem(`stovo_cached_messages_${userId}_${chatId}`);
      }
    } catch {
      // Best effort; the IndexedDB record is removed independently.
    }
  }
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await database();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete([userId, chatId]);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  } catch {
    // Non-fatal; a later encrypted write will retry this cleanup.
  }
}

export async function loadCachedChatList<T>(userId: string): Promise<T[] | null> {
  const native = await loadNativeReplicaValue(userId, "chat-list");
  if (native) {
    try {
      const parsed = JSON.parse(native);
      if (Array.isArray(parsed)) return parsed as T[];
    } catch {
      // Fall through to the legacy cache during a staged migration.
    }
  }
  if (typeof indexedDB === "undefined") {
    return loadCachedChatListFromLocalStorage<T>(userId);
  }
  try {
    const db = await database();
    const entry = await new Promise<CachedChatList<T> | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get([userId, CHAT_LIST_KEY]);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    if (entry?.chats && Array.isArray(entry.chats)) {
      if (isAndroidLocalReplicaPlatform()) {
        void saveCachedChatList(userId, entry.chats);
      }
      return entry.chats;
    }
    const fallback = loadCachedChatListFromLocalStorage<T>(userId);
    if (fallback && isAndroidLocalReplicaPlatform()) void saveCachedChatList(userId, fallback);
    return fallback;
  } catch {
    const fallback = loadCachedChatListFromLocalStorage<T>(userId);
    if (fallback && isAndroidLocalReplicaPlatform()) void saveCachedChatList(userId, fallback);
    return fallback;
  }
}

export async function saveCachedChatList<T>(userId: string, chats: T[]): Promise<void> {
  if (await saveNativeReplicaValue(userId, "chat-list", JSON.stringify(chats))) {
    void removeLegacyCacheEntry(userId, CHAT_LIST_KEY);
    return;
  }
  // Android is intentionally fail-closed: never create a new plaintext
  // browser cache when the Keystore-backed replica cannot accept this value.
  if (isAndroidLocalReplicaPlatform()) return;
  saveCachedChatListToLocalStorage(userId, chats);
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await database();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({
      userId,
      chatId: CHAT_LIST_KEY,
      accessedAt: Date.now(),
      chats,
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Non-fatal.
  }
}

export function loadRecentChatHistoryFromLocalStorage<T extends { id: string }>(
  userId: string,
  chatId: string
): T[] | null {
  if (isAndroidLocalReplicaPlatform()) return null;
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`stovo_cached_messages_${userId}_${chatId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

export function saveRecentChatHistoryToLocalStorage<T extends { id: string }>(
  userId: string,
  chatId: string,
  messages: T[]
): void {
  if (isAndroidLocalReplicaPlatform()) return;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      `stovo_cached_messages_${userId}_${chatId}`,
      JSON.stringify(messages)
    );
  } catch {
    // Non-fatal.
  }
}

export async function loadRecentChatHistory<T extends { id: string }>(userId: string, chatId: string): Promise<T[] | null> {
  const native = await loadNativeReplicaValue(userId, `history:${chatId}`);
  if (native) {
    try {
      const parsed = JSON.parse(native);
      if (Array.isArray(parsed)) return parsed as T[];
    } catch {
      // Fall through during migration.
    }
  }
  const localFallback = loadRecentChatHistoryFromLocalStorage<T>(userId, chatId);
  if (typeof indexedDB === "undefined") return localFallback;
  try {
    const db = await database();
    const entry = await new Promise<CachedChatHistory<T> | undefined>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get([userId, chatId]);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    if (entry) {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({ ...entry, accessedAt: Date.now() });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }
    db.close();
    if (entry?.messages && Array.isArray(entry.messages)) {
      if (isAndroidLocalReplicaPlatform()) {
        void saveRecentChatHistory(userId, chatId, entry.messages);
      } else {
        saveRecentChatHistoryToLocalStorage(userId, chatId, entry.messages);
      }
      return entry.messages;
    }
    if (localFallback && isAndroidLocalReplicaPlatform()) void saveRecentChatHistory(userId, chatId, localFallback);
    return localFallback;
  } catch {
    if (localFallback && isAndroidLocalReplicaPlatform()) void saveRecentChatHistory(userId, chatId, localFallback);
    return localFallback;
  }
}

export async function saveRecentChatHistory<T extends { id: string }>(userId: string, chatId: string, messages: T[]): Promise<void> {
  if (await saveNativeReplicaValue(userId, `history:${chatId}`, JSON.stringify(messages))) {
    void removeLegacyCacheEntry(userId, chatId);
    return;
  }
  if (isAndroidLocalReplicaPlatform()) return;
  saveRecentChatHistoryToLocalStorage(userId, chatId, messages);
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await database();
    const existing = await new Promise<CachedChatHistory<T>[]>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const nextEntry: CachedChatHistory<T> = {
      userId,
      chatId,
      accessedAt: Date.now(),
      messages,
    };
    const retained = trimRecentChatHistory([
      ...existing.filter((entry) => entry.userId === userId && entry.chatId !== chatId),
      nextEntry,
    ]);
    const retainedIDs = new Set(retained.map((entry) => entry.chatId));
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const entry of existing) {
      if (entry.userId === userId && !retainedIDs.has(entry.chatId) && entry.chatId !== CHAT_LIST_KEY) {
        store.delete([entry.userId, entry.chatId]);
      }
    }
    store.put(nextEntry);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Cache storage is an optional performance feature.
  }
}

export async function clearRecentChatHistory(): Promise<void> {
  if (typeof localStorage !== "undefined") {
    try {
      const keys = Object.keys(localStorage).filter(
        (key) => key.startsWith("stovo_cached_chats_") || key.startsWith("stovo_cached_messages_") || key.startsWith("stovo_last_active_chat_"),
      );
      for (const key of keys) localStorage.removeItem(key);
    } catch {
      // Non-fatal.
    }
  }
  if (typeof indexedDB === "undefined") return;
  try {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DATABASE_NAME);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch {
    // Non-fatal.
  }
}

