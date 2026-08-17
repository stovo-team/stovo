import type { Message, MessageEncryptionProtocol } from "../../../api/chats";
import type { FamilyFile } from "../../../api/files";

export interface QueuedOutboxAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  blob?: Blob;
  dataBase64?: string;
  uploadedFile?: FamilyFile;
  uploadedFileId?: string;
}

export interface QueuedOutboxMessage {
  id: string; // clientMessageId
  clientMessageId: string;
  chatId: string;
  userId: string;
  content: string | null;
  replyToMessageId: string | null;
  threadRootMessageId: string | null;
  mentionedUserIds: string[];
  encryptionProtocol?: MessageEncryptionProtocol;
  attachments: QueuedOutboxAttachment[];
  createdAt: string;
  status: "queued" | "sending" | "failed";
  deliveryError?: string | null;
  attemptCount: number;
  lastAttemptAt?: number;
  optimisticMessage?: Message;
}

const DATABASE_NAME = "stovo-outbox-v1";
const STORE_NAME = "outbox_messages";
const LOCAL_STORAGE_PREFIX = "stovo_outbox_queue_";

function getLocalStorageKey(userId: string): string {
  return `${LOCAL_STORAGE_PREFIX}${userId}`;
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB is not supported"));
    }
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
        store.createIndex("chatId", "chatId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function loadOutboxFromLocalStorage(userId: string): QueuedOutboxMessage[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(getLocalStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedOutboxMessage[]) : [];
  } catch {
    return [];
  }
}

function saveOutboxToLocalStorage(userId: string, messages: QueuedOutboxMessage[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    // Exclude raw Blobs from JSON serialization to avoid JSON.stringify crash
    const sanitized = messages.map((msg) => ({
      ...msg,
      attachments: msg.attachments.map(({ blob, ...rest }) => rest)
    }));
    localStorage.setItem(getLocalStorageKey(userId), JSON.stringify(sanitized));
  } catch {
    // Non-fatal fallback
  }
}

export async function enqueueOutboxMessage(item: QueuedOutboxMessage): Promise<void> {
  // Sync to localStorage
  const currentLocal = loadOutboxFromLocalStorage(item.userId);
  const existingIdx = currentLocal.findIndex((msg) => msg.id === item.id);
  if (existingIdx >= 0) {
    currentLocal[existingIdx] = item;
  } else {
    currentLocal.push(item);
  }
  saveOutboxToLocalStorage(item.userId, currentLocal);

  if (typeof indexedDB === "undefined") return;
  try {
    const db = await database();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(item);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  } catch {
    // LocalStorage fallback succeeded
  }
}

export async function getOutboxMessages(userId?: string): Promise<QueuedOutboxMessage[]> {
  if (!userId) {
    if (typeof indexedDB === "undefined") return [];
    try {
      const db = await database();
      const items = await new Promise<QueuedOutboxMessage[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || []);
      });
      db.close();
      return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch {
      return [];
    }
  }

  const localFallback = loadOutboxFromLocalStorage(userId);
  if (typeof indexedDB === "undefined") {
    return localFallback.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  try {
    const db = await database();
    const items = await new Promise<QueuedOutboxMessage[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const index = tx.objectStore(STORE_NAME).index("userId");
      const request = index.getAll(userId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
    db.close();
    if (items && items.length > 0) {
      return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return localFallback.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return localFallback.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

export async function getOutboxMessagesForChat(userId: string, chatId: string): Promise<QueuedOutboxMessage[]> {
  const allMessages = await getOutboxMessages(userId);
  return allMessages.filter((msg) => msg.chatId === chatId);
}

export async function updateOutboxMessage(
  id: string,
  userId: string,
  updates: Partial<QueuedOutboxMessage>
): Promise<void> {
  const currentLocal = loadOutboxFromLocalStorage(userId);
  const idx = currentLocal.findIndex((msg) => msg.id === id);
  if (idx >= 0) {
    currentLocal[idx] = { ...currentLocal[idx], ...updates };
    saveOutboxToLocalStorage(userId, currentLocal);
  }

  if (typeof indexedDB === "undefined") return;
  try {
    const db = await database();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const existing = await new Promise<QueuedOutboxMessage | undefined>((resolve, reject) => {
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    if (existing) {
      store.put({ ...existing, ...updates });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  } catch {
    // LocalStorage fallback already updated
  }
}

export async function removeOutboxMessage(id: string, userId?: string): Promise<void> {
  if (userId) {
    const currentLocal = loadOutboxFromLocalStorage(userId);
    const filtered = currentLocal.filter((msg) => msg.id !== id);
    saveOutboxToLocalStorage(userId, filtered);
  } else if (typeof localStorage !== "undefined") {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(LOCAL_STORAGE_PREFIX));
      for (const key of keys) {
        const uId = key.slice(LOCAL_STORAGE_PREFIX.length);
        const list = loadOutboxFromLocalStorage(uId);
        if (list.some((msg) => msg.id === id)) {
          saveOutboxToLocalStorage(
            uId,
            list.filter((msg) => msg.id !== id)
          );
        }
      }
    } catch {
      // ignore
    }
  }

  if (typeof indexedDB === "undefined") return;
  try {
    const db = await database();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Non-fatal
  }
}

export async function clearOutbox(userId?: string): Promise<void> {
  if (userId) {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem(getLocalStorageKey(userId));
      } catch {
        // ignore
      }
    }
  } else if (typeof localStorage !== "undefined") {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(LOCAL_STORAGE_PREFIX));
      for (const key of keys) localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  if (typeof indexedDB === "undefined") return;
  try {
    if (userId) {
      const all = await getOutboxMessages(userId);
      const db = await database();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const item of all) {
        store.delete(item.id);
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    } else {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase(DATABASE_NAME);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve();
      });
    }
  } catch {
    // Non-fatal
  }
}
