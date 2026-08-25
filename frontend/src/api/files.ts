import { ApiError, apiRequest, getApiUrl } from "./client";
import { getCachedFileBlob, prefetchFileBlobs, seedMediaBlobCache } from "../mediaBlobCache";

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

export async function uploadFile(accessToken: string, file: File, chatId?: string | null) {
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

export function prefetchFiles(accessToken: string, fileIds: string[]) {
  prefetchFileBlobs(accessToken, fileIds, fetchFileBlob);
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
