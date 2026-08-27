import { ApiError, apiRequest, getApiUrl } from "./client";
import { getCachedFileBlob, prefetchFileBlobs, seedMediaBlobCache } from "../mediaBlobCache";
import { enqueueBackgroundUpload, enqueueBrowserBackgroundUpload, getBackgroundUploadStatus } from "../native/backgroundUploadPlugin";
import { nativeSourceUriForFile } from "../native/mediaLibraryPlugin";
import { shouldAutoDownloadMedia } from "../mediaDownloadPolicy";

export interface FamilyFile {
  id: string;
  familyId: string;
  uploadedBy: string;
  chatId: string | null;
  chatTitle: string | null;
  chatType: "family" | "direct" | "group" | "channel" | null;
  originMessageId: string | null;
  accessScope: "family" | "chat";
  storageProvider: "local" | string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  createdAt: string;
  deletedAt: string | null;
  isFavorite: boolean;
}

export interface MediaPlaybackToken {
  token: string;
  expiresAt: string;
}

export interface DirectFileUploadReservationRequest {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum?: string | null;
  chatId?: string | null;
}

export interface DirectFileUploadReservation {
  uploadId: string;
  fileId: string;
  state: "reserved" | "validating" | "ready" | "rejected" | string;
  uploadUrl?: string;
  expiresAt?: string;
  expectedMimeType: string;
  expectedSizeBytes: number;
}

export interface DirectFileAccess {
  fileId: string;
  revision?: string;
  url: string;
  expiresAt: string;
  mimeType: string;
  sizeBytes: number;
  checksum?: string;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, payload?.detail ?? response.statusText);
  }
  return payload as T;
}

function createUploadOperationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function uploadLegacyFile(accessToken: string, file: File, chatId?: string | null) {
  const body = new FormData();
  body.append("file", file);
  if (chatId) {
    body.append("chatId", chatId);
  }

  const response = await fetch(`${getApiUrl()}/api/files/upload`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body,
    credentials: "include"
  });

  const uploaded = await parseResponse<FamilyFile>(response);
  // Warm local cache from the just-selected File so first playback is instant.
  try {
    seedMediaBlobCache(uploaded.id, file);
  } catch {
    // Non-fatal.
  }
  return uploaded;
}

function directUploadTarget(uploadUrl: string): string {
  return /^https?:\/\//i.test(uploadUrl) ? uploadUrl : `${getApiUrl()}${uploadUrl}`;
}

async function waitForDirectUpload(
  accessToken: string,
  reservation: DirectFileUploadReservation,
): Promise<FamilyFile> {
  let current = reservation;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (current.state === "ready") {
      return getFile(accessToken, current.fileId);
    }
    if (current.state === "rejected") {
      throw new ApiError(422, "File was rejected during validation");
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, Math.min(1000 * (attempt + 1), 5000)));
    current = await getDirectFileUpload(accessToken, current.uploadId);
  }
  // Keep the durable outbox queued: validation happens asynchronously and its
  // result may be delayed while the worker fleet or storage is unavailable.
  throw new ApiError(503, "File validation is still in progress");
}

async function uploadDirectFile(
  accessToken: string,
  file: File,
  chatId: string | null | undefined,
  idempotencyKey: string,
): Promise<FamilyFile> {
  let reservation = await reserveDirectFileUpload(accessToken, {
    originalName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    chatId,
  }, idempotencyKey);

  if (reservation.state === "reserved") {
    if (!reservation.uploadUrl) {
      throw new ApiError(503, "Upload reservation did not include a transfer URL");
    }
    const putResponse = await fetch(directUploadTarget(reservation.uploadUrl), {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!putResponse.ok) {
      // Presigned URLs expire. Treat this as retriable: the stable reservation
      // key returns a fresh URL on the next durable outbox attempt.
      throw new ApiError(putResponse.status === 408 ? 408 : 503, "Direct file transfer did not complete");
    }
    reservation = await completeDirectFileUpload(accessToken, reservation.uploadId, idempotencyKey);
  }

  return waitForDirectUpload(accessToken, reservation);
}

async function uploadViaBackgroundWorker(
  accessToken: string,
  file: File,
  chatId: string | null | undefined,
  idempotencyKey: string,
  profileId: string,
  sourceUri?: string | null,
): Promise<FamilyFile> {
  const uploadOptions = {
    profileId, operationId: idempotencyKey, apiUrl: getApiUrl(), accessToken,
    originalName: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size, chatId,
  };
  const queued = sourceUri
    ? await enqueueBackgroundUpload({ ...uploadOptions, sourceUri })
    : await enqueueBrowserBackgroundUpload(uploadOptions, file);
  if (!queued) return uploadDirectFile(accessToken, file, chatId, idempotencyKey);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const status = await getBackgroundUploadStatus(profileId, idempotencyKey);
    if (status?.status === "failed") throw new ApiError(422, status.error ?? "Background upload failed");
    if (status?.uploadId) return waitForDirectUpload(accessToken, {
      uploadId: status.uploadId, fileId: status.fileId ?? "", state: status.status,
      expectedMimeType: file.type || "application/octet-stream", expectedSizeBytes: file.size,
    });
    await new Promise<void>((resolve) => window.setTimeout(resolve, Math.min(1000 * (attempt + 1), 5000)));
  }
  throw new ApiError(503, "Background transfer is still queued");
}

/**
 * Uploads directly to object storage when the deployment has the public media
 * endpoint enabled. The caller-owned idempotency key makes outbox retries
 * resume the same reservation; older deployments retain the multipart route.
 */
export async function uploadFile(
  accessToken: string,
  file: File,
  chatId?: string | null,
  idempotencyKey = createUploadOperationId(),
  backgroundProfileId?: string,
) {
  try {
    const sourceUri = nativeSourceUriForFile(file);
    if (backgroundProfileId) {
      return await uploadViaBackgroundWorker(accessToken, file, chatId, idempotencyKey, backgroundProfileId, sourceUri);
    }
    return await uploadDirectFile(accessToken, file, chatId, idempotencyKey);
  } catch (error) {
    // Rolling deployments may not have MINIO_PUBLIC_ENDPOINT configured yet.
    // Only that explicit capability response may use the legacy path; any
    // other error remains visible to the durable outbox for a safe retry.
    if (error instanceof ApiError && error.status === 503 && error.message === "Direct uploads are not configured") {
      return uploadLegacyFile(accessToken, file, chatId);
    }
    throw error;
  }
}

export function getFiles(accessToken: string) {
  return apiRequest<FamilyFile[]>("/api/files", { accessToken });
}

export function reserveDirectFileUpload(
  accessToken: string,
  payload: DirectFileUploadReservationRequest,
  idempotencyKey: string,
) {
  return apiRequest<DirectFileUploadReservation>("/api/files/uploads", {
    method: "POST",
    accessToken,
    headers: { "Idempotency-Key": idempotencyKey },
    body: {
      ...payload,
      checksum: payload.checksum ?? undefined,
      chatId: payload.chatId ?? undefined,
    },
  });
}

export function completeDirectFileUpload(
  accessToken: string,
  uploadId: string,
  idempotencyKey: string,
) {
  return apiRequest<DirectFileUploadReservation>(
    `/api/files/uploads/${encodeURIComponent(uploadId)}/complete`,
    {
      method: "POST",
      accessToken,
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );
}

/** Polls the authoritative lifecycle state after direct-upload completion. */
export function getDirectFileUpload(accessToken: string, uploadId: string) {
  return apiRequest<DirectFileUploadReservation>(
    `/api/files/uploads/${encodeURIComponent(uploadId)}`,
    { accessToken },
  );
}

/** Returns a short-lived capability only after the server confirms ready-state access. */
export function createDirectFileAccess(accessToken: string, fileId: string) {
  return apiRequest<DirectFileAccess>(`/api/files/${encodeURIComponent(fileId)}/access`, {
    method: "POST",
    accessToken,
  });
}

export function getFile(accessToken: string, fileId: string) {
  return apiRequest<FamilyFile>(`/api/files/${fileId}`, { accessToken });
}

export function createMediaPlaybackToken(accessToken: string, fileId: string) {
  return apiRequest<MediaPlaybackToken>(`/api/files/${encodeURIComponent(fileId)}/playback-token`, {
    method: "POST",
    accessToken
  });
}

export function getMediaPlaybackUrl(fileId: string, token?: string) {
  const base = `${getApiUrl()}/api/media/${encodeURIComponent(fileId)}`;
  if (!token) return base;
  return `${base}?token=${encodeURIComponent(token)}`;
}

export async function createStreamingMediaUrl(accessToken: string, fileId: string) {
  const capability = await createMediaPlaybackToken(accessToken, fileId);
  return getMediaPlaybackUrl(fileId, capability.token);
}

export function deleteFile(accessToken: string, fileId: string) {
  return apiRequest<void>(`/api/files/${fileId}`, {
    method: "DELETE",
    accessToken
  });
}

export function updateFilePreferences(
  accessToken: string,
  fileId: string,
  payload: { isFavorite?: boolean }
) {
  return apiRequest<FamilyFile>(`/api/files/${fileId}/preferences`, {
    method: "PATCH",
    accessToken,
    body: payload
  });
}

async function fetchFileBlob(accessToken: string, fileId: string) {
  const response = await fetch(`${getApiUrl()}/api/files/${fileId}/download`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    credentials: "include"
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(response.status, payload?.detail ?? response.statusText);
  }

  return response.blob();
}

export async function downloadFileBlob(accessToken: string, fileId: string) {
  return getCachedFileBlob(accessToken, fileId, fetchFileBlob);
}

export function prefetchFiles(accessToken: string, files: Array<Pick<FamilyFile, "id" | "sizeBytes">>) {
  prefetchFileBlobs(accessToken, files.filter(shouldAutoDownloadMedia).map((file) => file.id), fetchFileBlob);
}

export async function saveFileToDisk(accessToken: string, file: FamilyFile) {
  const blob = await downloadFileBlob(accessToken, file.id);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = file.originalName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export interface FileTranscriptResponse {
  fileId: string;
  text: string;
  language?: string;
  duration?: number;
}

export function transcribeFile(accessToken: string, fileId: string) {
  return apiRequest<FileTranscriptResponse>(`/api/files/${encodeURIComponent(fileId)}/transcribe`, {
    method: "POST",
    accessToken
  });
}

export function getFileTranscript(accessToken: string, fileId: string) {
  return apiRequest<FileTranscriptResponse>(`/api/files/${encodeURIComponent(fileId)}/transcript`, {
    accessToken
  });
}

export function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
