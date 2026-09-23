export const OUTBOX_DATABASE_NAME = "stovo-outbox-v1";
export const OUTBOX_STORE_NAME = "outbox_messages";

export function openOutboxDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB is not supported"));
    const request = indexedDB.open(OUTBOX_DATABASE_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE_NAME)) {
        const store = db.createObjectStore(OUTBOX_STORE_NAME, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
        store.createIndex("chatId", "chatId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}
