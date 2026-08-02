const DATABASE_NAME = "stovo-chat-history-v1";
const STORE_NAME = "recent-history";
const MAX_CHATS = 20;
const MAX_MESSAGES_PER_CHAT = 50;

export type CachedChatHistory<T extends { id: string } = { id: string }> = {
  userId: string;
  chatId: string;
  accessedAt: number;
  messages: T[];
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
    .sort((left, right) => left.accessedAt - right.accessedAt)
    .slice(-MAX_CHATS)
    .map((entry) => ({ ...entry, messages: entry.messages.slice(-MAX_MESSAGES_PER_CHAT) }));
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: ["userId", "chatId"] });
    request.onsuccess = () => resolve(request.result);
  });
}

export async function loadRecentChatHistory<T extends { id: string }>(userId: string, chatId: string): Promise<T[] | null> {
  if (typeof indexedDB === "undefined") return null;
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
    return entry?.messages ?? null;
  } catch {
    return null;
  }
}

export async function saveRecentChatHistory<T extends { id: string }>(userId: string, chatId: string, messages: T[]): Promise<void> {
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
      messages: messages.slice(-MAX_MESSAGES_PER_CHAT),
    };
    const retained = trimRecentChatHistory([
      ...existing.filter((entry) => entry.userId === userId && entry.chatId !== chatId),
      nextEntry,
    ]);
    const retainedIDs = new Set(retained.map((entry) => entry.chatId));
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const entry of existing) {
      if (entry.userId === userId && !retainedIDs.has(entry.chatId)) store.delete([entry.userId, entry.chatId]);
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
