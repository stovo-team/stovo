import type { Message, MessageEncryptionProtocol } from "../../../api/chats";
import type { FamilyFile } from "../../../api/files";
import { hydrateAttachmentBlobs } from "./attachmentBlobRecovery";
import { openOutboxDatabase, OUTBOX_DATABASE_NAME, OUTBOX_STORE_NAME } from "./outboxDatabase";
import {
  isAndroidLocalReplicaPlatform,
  listNativeReplicaOperations,
  putNativeReplicaOperation,
  removeNativeReplicaOperation,
  type LocalReplicaOperation,
} from "../../../native/localReplicaPlugin";

export interface QueuedOutboxAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  blob?: Blob;
  dataBase64?: string;
  /** App-private Android source retained for WorkManager staging. */
  nativeSourceUri?: string;
  /** Stable direct-object reservation key retained across app restarts. */
  uploadOperationId?: string;
  uploadedFile?: FamilyFile;
  uploadedFileId?: string;
}

export interface ReminderRule {
  frequency: "daily" | "weekly" | "monthly";
  daysOfWeek?: number[]; // 0 = Sun, 1 = Mon ... 6 = Sat
  daysOfMonth?: number[]; // 1 .. 31
  repeatCount: number; // total repeat count (e.g. 5)
  remainingCount: number; // remaining times (starts at repeatCount)
  startDate: string; // "YYYY-MM-DD"
  time: string; // "HH:mm"
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
  status: "queued" | "sending" | "failed" | "scheduled";
  deliveryError?: string | null;
  attemptCount: number;
  lastAttemptAt?: number;
  optimisticMessage?: Message;
  scheduledFor?: string | null;
  isReminder?: boolean;
  reminderRule?: ReminderRule | null;
}

const LOCAL_STORAGE_PREFIX = "stovo_outbox_queue_";
const memoryFallback = new Map<string, QueuedOutboxMessage[]>();

function getLocalStorageKey(userId: string): string {
  return `${LOCAL_STORAGE_PREFIX}${userId}`;
}
function outboxStorageKeys(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key): key is string => key?.startsWith(LOCAL_STORAGE_PREFIX) ?? false);
  } catch {
    // Storage may be disabled by a browser privacy setting. The in-memory
    // fallback remains the authoritative best-effort store for this session.
    return [];
  }
}
function bytesToBase64(bytes: Uint8Array): string {
  let result = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    result += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  }
  return btoa(result);
}
async function forNativeReplica(item: QueuedOutboxMessage): Promise<QueuedOutboxMessage> {
  const attachments = await Promise.all(item.attachments.map(async ({ blob, ...attachment }) => ({
    ...attachment,
    // Android content URIs are later handed directly to the encrypted
    // WorkManager transfer staging path. Browser-originated Files retain an
    // encrypted base64 copy in the native operation instead.
    dataBase64: attachment.dataBase64 ?? (!attachment.nativeSourceUri && blob ? bytesToBase64(new Uint8Array(await blob.arrayBuffer())) : undefined),
  })));
  return { ...item, attachments };
}

function nativeOperation(item: QueuedOutboxMessage): LocalReplicaOperation {
  const now = new Date().toISOString();
  return {
    id: item.id,
    type: "message.send",
    payloadJson: JSON.stringify(item),
    // The ID is already a UUID generated client-side and doubles as the
    // idempotency identity. The server validates the request hash separately.
    payloadHash: item.clientMessageId,
    dependencies: [],
    status: item.status === "failed" ? "failed" : item.status === "sending" ? "running" : "queued",
    attemptCount: item.attemptCount,
    createdAt: item.createdAt,
    updatedAt: now,
    errorCode: item.deliveryError ?? null,
  };
}

async function nativeOutboxItems(userId: string): Promise<QueuedOutboxMessage[]> {
  const operations = await listNativeReplicaOperations(userId);
  const result: QueuedOutboxMessage[] = [];
  for (const operation of operations) {
    if (operation.type !== "message.send") continue;
    try {
      const item = JSON.parse(operation.payloadJson) as QueuedOutboxMessage;
      if (item.userId === userId) {
        const status = operation.status === "failed" ? "failed" : operation.status === "running" ? "sending" : "queued";
        result.push({ ...item, status, attemptCount: operation.attemptCount });
      }
    } catch {
      // One malformed encrypted record must not hide the rest of the outbox.
    }
  }
  return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function loadOutboxFromLocalStorage(userId: string): QueuedOutboxMessage[] {
  if (typeof localStorage === "undefined") return memoryFallback.get(userId) ?? [];
  try {
    const raw = localStorage.getItem(getLocalStorageKey(userId));
    if (!raw) return memoryFallback.get(userId) ?? [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedOutboxMessage[]) : [];
  } catch {
    return memoryFallback.get(userId) ?? [];
  }
}

function hasLocalOutboxSnapshot(userId: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(getLocalStorageKey(userId)) !== null;
  } catch {
    return false;
  }
}

function saveOutboxToLocalStorage(userId: string, messages: QueuedOutboxMessage[]): void {
  memoryFallback.set(userId, messages);
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
  if (isAndroidLocalReplicaPlatform()) {
    const stored = await putNativeReplicaOperation(item.userId, nativeOperation(await forNativeReplica(item)));
    if (!stored) throw new Error("Encrypted Android outbox is unavailable");
    return;
  }
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
    const db = await openOutboxDatabase();
    const tx = db.transaction(OUTBOX_STORE_NAME, "readwrite");
    tx.objectStore(OUTBOX_STORE_NAME).put(item);
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
  if (isAndroidLocalReplicaPlatform()) {
    return userId ? nativeOutboxItems(userId) : [];
  }
  if (!userId) {
    if (typeof indexedDB === "undefined") return [];
    try {
      const db = await openOutboxDatabase();
      const items = await new Promise<QueuedOutboxMessage[]>((resolve, reject) => {
        const tx = db.transaction(OUTBOX_STORE_NAME, "readonly");
        const request = tx.objectStore(OUTBOX_STORE_NAME).getAll();
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
  // Every web outbox mutation commits to localStorage before IndexedDB. Once a
  // local snapshot exists, it is the current queue—even when IndexedDB retains
  // a stale row after a browser storage failure. Reading the stale row made an
  // already-due message reappear as permanently scheduled after a reload.
  if (hasLocalOutboxSnapshot(userId)) {
    const hydrated = await hydrateAttachmentBlobs(userId, localFallback, memoryFallback.get(userId) ?? []);
    return hydrated.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  if (typeof indexedDB === "undefined") {
    return localFallback.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  try {
    const db = await openOutboxDatabase();
    const items = await new Promise<QueuedOutboxMessage[]>((resolve, reject) => {
      const tx = db.transaction(OUTBOX_STORE_NAME, "readonly");
      const index = tx.objectStore(OUTBOX_STORE_NAME).index("userId");
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
  if (isAndroidLocalReplicaPlatform()) {
    const current = (await nativeOutboxItems(userId)).find((item) => item.id === id);
    if (!current) return;
    const stored = await putNativeReplicaOperation(userId, nativeOperation(await forNativeReplica({ ...current, ...updates })));
    if (!stored) throw new Error("Encrypted Android outbox is unavailable");
    return;
  }
  const currentLocal = loadOutboxFromLocalStorage(userId);
  const idx = currentLocal.findIndex((msg) => msg.id === id);
  if (idx >= 0) {
    currentLocal[idx] = { ...currentLocal[idx], ...updates };
    saveOutboxToLocalStorage(userId, currentLocal);
  }

  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openOutboxDatabase();
    const tx = db.transaction(OUTBOX_STORE_NAME, "readwrite");
    const store = tx.objectStore(OUTBOX_STORE_NAME);
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
  if (isAndroidLocalReplicaPlatform()) {
    if (!userId) return;
    if (!(await removeNativeReplicaOperation(userId, id))) throw new Error("Encrypted Android outbox is unavailable");
    return;
  }
  if (userId) {
    const currentLocal = loadOutboxFromLocalStorage(userId);
    const filtered = currentLocal.filter((msg) => msg.id !== id);
    saveOutboxToLocalStorage(userId, filtered);
  } else if (typeof localStorage !== "undefined") {
    try {
      for (const key of outboxStorageKeys()) {
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
    const db = await openOutboxDatabase();
    const tx = db.transaction(OUTBOX_STORE_NAME, "readwrite");
    tx.objectStore(OUTBOX_STORE_NAME).delete(id);
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
  if (isAndroidLocalReplicaPlatform()) {
    if (!userId) return;
    const operations = await nativeOutboxItems(userId);
    await Promise.all(operations.map((item) => removeNativeReplicaOperation(userId, item.id)));
    return;
  }
  if (userId) {
    memoryFallback.delete(userId);
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem(getLocalStorageKey(userId));
      } catch {
        // ignore
      }
    }
  } else {
    memoryFallback.clear();
    if (typeof localStorage !== "undefined") {
      try {
        for (const key of outboxStorageKeys()) localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }

  if (typeof indexedDB === "undefined") return;
  try {
    if (userId) {
      const all = await getOutboxMessages(userId);
      const db = await openOutboxDatabase();
      const tx = db.transaction(OUTBOX_STORE_NAME, "readwrite");
      const store = tx.objectStore(OUTBOX_STORE_NAME);
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
        const req = indexedDB.deleteDatabase(OUTBOX_DATABASE_NAME);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve();
      });
    }
  } catch {
    // Non-fatal
  }
}
