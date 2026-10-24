import type { FamilyFile } from "../api/files";
import { DESIGN_COLOR_VALUES } from "../design-system/palette";

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
const MOCK_PREVIEW_VIDEO = "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";

export async function seedMockPreviewFiles(familyId: string, uploadedBy: string): Promise<void> {
  const files = await readAllRecords();
  if (files.some((record) => record.kind === "file" && record.key === "file:mock-storage-preview-photo")) {
    const video = files.find((record): record is MockStoredFile => record.kind === "file" && record.key === "file:mock-storage-preview-video");
    if (video && video.metadata.sizeBytes < 500) {
      const blob = await createMockPreviewVideo();
      await writeRecord({ ...video, metadata: { ...video.metadata, sizeBytes: blob.size }, blob });
    }
    const report = files.find((record): record is MockStoredFile => record.kind === "file" && record.key === "file:mock-storage-preview-report");
    if (report && !(await report.blob.text()).includes("xref\n0 6")) {
      const blob = new Blob([createMockPreviewPdf()], { type: "application/pdf" });
      await writeRecord({ ...report, metadata: { ...report.metadata, sizeBytes: blob.size }, blob });
    }
    return;
  }
  const createdAt = new Date("2026-09-08T12:00:00.000Z").toISOString();
  const fixtures = [
    {
      id: "mock-storage-preview-photo",
      originalName: "Storage preview photo.svg",
      mimeType: "image/svg+xml",
      content: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${DESIGN_COLOR_VALUES.demo.channelAvatars[0]}"/><stop offset="1" stop-color="${DESIGN_COLOR_VALUES.inviteQr.light}"/></linearGradient></defs><rect width="1200" height="800" fill="url(#sky)"/><circle cx="930" cy="180" r="76" fill="${DESIGN_COLOR_VALUES.demo.channelAvatars[5]}"/><path d="M0 600 310 280l250 320 215-250 425 450H0Z" fill="${DESIGN_COLOR_VALUES.storageCollections.coverColors[5]}"/><path d="m0 700 360-240 330 340H0Z" fill="${DESIGN_COLOR_VALUES.storageCollections.defaultCover}"/></svg>`,
      chatId: "chat-planning-team",
    },
    {
      id: "mock-storage-preview-video",
      originalName: "Storage preview video.webm",
      mimeType: "video/webm",
      content: "",
      chatId: "chat-planning-team",
    },
    {
      id: "mock-storage-preview-report",
      originalName: "Storage preview report.pdf",
      mimeType: "application/pdf",
      content: createMockPreviewPdf(),
      chatId: "chat-planning-team",
    },
    {
      id: "mock-storage-preview-notes",
      originalName: "Storage preview notes.md",
      mimeType: "text/markdown",
      content: "# Storage preview notes\n\nMarkdown files are displayed as clean, plain text in Storage.\n\n- Images and videos scale to the preview frame\n- File actions stay in the metadata menu\n",
      chatId: null,
    },
  ];
  const videoBytes = await createMockPreviewVideo();
  for (const [index, fixture] of fixtures.entries()) {
    const blob = fixture.id === "mock-storage-preview-video" ? videoBytes : new Blob([fixture.content], { type: fixture.mimeType });
    const metadata: FamilyFile = {
      id: fixture.id,
      familyId,
      uploadedBy,
      chatId: fixture.chatId,
      chatTitle: fixture.chatId ? "Planning Team" : null,
      chatType: fixture.chatId ? "group" : null,
      originMessageId: fixture.chatId ? "msg-planning-kickoff" : null,
      accessScope: fixture.chatId ? "chat" : "family",
      storageProvider: "local",
      originalName: fixture.originalName,
      mimeType: fixture.mimeType,
      sizeBytes: blob.size,
      checksum: null,
      createdAt: new Date(new Date(createdAt).getTime() - index * 1000).toISOString(),
      deletedAt: null,
      isFavorite: false,
    };
    await writeRecord({ key: `file:${fixture.id}`, kind: "file", metadata, blob });
  }
}
async function createMockPreviewVideo(): Promise<Blob> { return new Blob([Uint8Array.from(atob(MOCK_PREVIEW_VIDEO), (character) => character.charCodeAt(0))], { type: "video/webm" }); }
function createMockPreviewPdf(): string {
  const stream = "BT /F1 24 Tf 72 720 Td (Storage preview demo) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const crossReferenceOffset = pdf.length;
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${crossReferenceOffset}\n%%EOF`;
  return pdf;
}
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
