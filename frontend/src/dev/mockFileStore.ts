import type { FamilyFile } from "../api/files";

const DATABASE_NAME = "stovo-local-mock-files-v1";
const STORE_NAME = "records";

type MockFileUploadRequest = {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum?: string | null;
  idempotencyKey?: string | null;
  chatId?: string | null;
  uploadedBy: string;
  familyId: string;
  chatTitle: string | null;
  chatType: FamilyFile["chatType"];
};

type MockFileUpload = {
  key: string;
  kind: "upload";
  uploadId: string;
  fileId: string;
  request: MockFileUploadRequest;
  state: "reserved" | "ready";
  blob?: Blob;
  createdAt: string;
  expiresAt: string;
};

type MockStoredFile = {
  key: string;
  kind: "file";
  metadata: FamilyFile;
  blob: Blob;
};

type MockFileRecord = MockFileUpload | MockStoredFile;

const memoryRecords = new Map<string, MockFileRecord>();
let fallbackId = 0;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onerror = () => reject(request.error ?? new Error("Could not open local mock file storage"));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function readRecord(key: string): Promise<MockFileRecord | null> {
  if (typeof indexedDB === "undefined") return memoryRecords.get(key) ?? null;
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as MockFileRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not read local mock file storage"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not read local mock file storage"));
  });
}

async function readAllRecords(): Promise<MockFileRecord[]> {
  if (typeof indexedDB === "undefined") return [...memoryRecords.values()];
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as MockFileRecord[]);
    request.onerror = () => reject(request.error ?? new Error("Could not list local mock files"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not list local mock files"));
  });
}

async function writeRecord(record: MockFileRecord): Promise<void> {
  if (typeof indexedDB === "undefined") {
    memoryRecords.set(record.key, record);
    return;
  }
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not save local mock file"));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not save local mock file"));
    };
  });
}

async function removeRecord(key: string): Promise<void> {
  if (typeof indexedDB === "undefined") {
    memoryRecords.delete(key);
    return;
  }
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not delete local mock file"));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not delete local mock file"));
    };
  });
}

function makeId(prefix: string): string {
  const randomId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Date.now().toString(36) + "-" + (++fallbackId).toString(36);
  return prefix + randomId;
}

function reservation(upload: MockFileUpload) {
  return {
    uploadId: upload.uploadId,
    fileId: upload.fileId,
    state: upload.state,
    uploadUrl: upload.state === "reserved"
      ? "/api/files/uploads/" + encodeURIComponent(upload.uploadId) + "/content"
      : undefined,
    expiresAt: upload.expiresAt,
    expectedMimeType: upload.request.mimeType,
    expectedSizeBytes: upload.request.sizeBytes,
  };
}

export async function reserveMockFileUpload(input: MockFileUploadRequest) {
  if (input.idempotencyKey) {
    const existing = (await readAllRecords()).find((record): record is MockFileUpload =>
      record.kind === "upload" &&
      record.request.uploadedBy === input.uploadedBy &&
      record.request.idempotencyKey === input.idempotencyKey,
    );
    if (existing) {
      const sameRequest =
        existing.request.originalName === input.originalName &&
        existing.request.mimeType === input.mimeType &&
        existing.request.sizeBytes === input.sizeBytes &&
        existing.request.checksum === (input.checksum ?? null) &&
        existing.request.chatId === (input.chatId ?? null);
      if (!sameRequest) throw new Error("Idempotency key was already used for a different file upload.");
      return reservation(existing);
    }
  }
  const now = new Date();
  const upload: MockFileUpload = {
    key: "upload:" + makeId(""),
    kind: "upload",
    uploadId: "",
    fileId: makeId("file-mock-"),
    request: input,
    state: "reserved",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
  upload.uploadId = upload.key.slice("upload:".length);
  await writeRecord(upload);
  return reservation(upload);
}

export async function getMockFileUpload(uploadId: string) {
  const record = await readRecord("upload:" + uploadId);
  return record?.kind === "upload" ? reservation(record) : null;
}

export async function transferMockFileUpload(uploadId: string, blob: Blob): Promise<boolean> {
  const record = await readRecord("upload:" + uploadId);
  if (record?.kind !== "upload" || record.state !== "reserved") return false;
  if (blob.size !== record.request.sizeBytes) return false;
  record.blob = blob;
  await writeRecord(record);
  return true;
}

export async function completeMockFileUpload(uploadId: string) {
  const record = await readRecord("upload:" + uploadId);
  if (record?.kind !== "upload" || !record.blob) return null;
  if (record.blob.size !== record.request.sizeBytes) return null;
  const metadata: FamilyFile = {
    id: record.fileId,
    familyId: record.request.familyId,
    uploadedBy: record.request.uploadedBy,
    chatId: record.request.chatId ?? null,
    chatTitle: record.request.chatTitle,
    chatType: record.request.chatType,
    originMessageId: null,
    accessScope: record.request.chatId ? "chat" : "family",
    storageProvider: "local",
    originalName: record.request.originalName,
    mimeType: record.request.mimeType,
    sizeBytes: record.request.sizeBytes,
    checksum: record.request.checksum ?? null,
    createdAt: record.createdAt,
    deletedAt: null,
    isFavorite: false,
  };
  const file: MockStoredFile = { key: "file:" + record.fileId, kind: "file", metadata, blob: record.blob };
  await writeRecord(file);
  record.state = "ready";
  delete record.blob;
  await writeRecord(record);
  return reservation(record);
}

export async function listMockFiles(): Promise<FamilyFile[]> {
  const records = await readAllRecords();
  return records
    .filter((record): record is MockStoredFile => record.kind === "file" && record.metadata.deletedAt === null)
    .map((record) => structuredClone(record.metadata))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getMockFile(fileId: string): Promise<FamilyFile | null> {
  const record = await readRecord("file:" + fileId);
  return record?.kind === "file" ? structuredClone(record.metadata) : null;
}

export async function downloadMockFile(fileId: string): Promise<Blob | null> {
  const record = await readRecord("file:" + fileId);
  return record?.kind === "file" && record.metadata.deletedAt === null ? record.blob : null;
}

export async function associateMockFileWithMessage(
  fileId: string,
  chat: { id: string; title: string | null; type: FamilyFile["chatType"] },
  messageId: string,
): Promise<FamilyFile | null> {
  const record = await readRecord("file:" + fileId);
  if (record?.kind !== "file" || record.metadata.deletedAt !== null) return null;
  record.metadata = {
    ...record.metadata,
    chatId: chat.id,
    chatTitle: chat.title,
    chatType: chat.type,
    originMessageId: messageId,
    accessScope: "chat",
  };
  await writeRecord(record);
  return structuredClone(record.metadata);
}

export async function updateMockFilePreferences(
  fileId: string,
  preferences: { isFavorite?: boolean },
): Promise<FamilyFile | null> {
  const record = await readRecord("file:" + fileId);
  if (record?.kind !== "file" || record.metadata.deletedAt !== null) return null;
  record.metadata = { ...record.metadata, ...preferences };
  await writeRecord(record);
  return structuredClone(record.metadata);
}

export async function deleteMockFile(fileId: string): Promise<boolean> {
  const record = await readRecord("file:" + fileId);
  if (record?.kind !== "file") return false;
  await removeRecord("file:" + fileId);
  const uploads = (await readAllRecords()).filter((entry): entry is MockFileUpload =>
    entry.kind === "upload" && entry.fileId === fileId,
  );
  await Promise.all(uploads.map((upload) => removeRecord(upload.key)));
  return true;
}

export async function resetMockFileStore(): Promise<void> {
  memoryRecords.clear();
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not reset local mock files"));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not reset local mock files"));
    };
  });
}
