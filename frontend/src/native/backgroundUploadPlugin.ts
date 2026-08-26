import { Capacitor, registerPlugin } from "@capacitor/core";

type NativeBackgroundUploadPlugin = {
  enqueue(options: {
    profileId: string; operationId: string; sourceUri: string; apiUrl: string; accessToken: string;
    originalName: string; mimeType: string; sizeBytes: number; chatId?: string | null;
  }): Promise<{ queued: boolean; operationId: string }>;
  stageWebChunk(options: {
    profileId: string; operationId: string; index: number; dataBase64: string;
  }): Promise<{ staged: boolean; index: number }>;
  finalizeWebUpload(options: {
    profileId: string; operationId: string; apiUrl: string; accessToken: string;
    originalName: string; mimeType: string; sizeBytes: number; chunkCount: number; chatId?: string | null;
  }): Promise<{ queued: boolean; operationId: string }>;
  getStatus(options: { profileId: string; operationId: string }): Promise<{ operation: string | null }>;
};

const BackgroundUploadPlugin = registerPlugin<NativeBackgroundUploadPlugin>("BackgroundUploadPlugin");

export type BackgroundUploadStatus = {
  status: "queued" | "reserved" | "validating" | "ready" | "failed" | string;
  uploadId?: string;
  fileId?: string;
  error?: string;
};

function available() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function enqueueBackgroundUpload(options: Parameters<NativeBackgroundUploadPlugin["enqueue"]>[0]): Promise<boolean> {
  if (!available()) return false;
  try {
    return (await BackgroundUploadPlugin.enqueue(options)).queued;
  } catch {
    return false;
  }
}

const WEBVIEW_STAGE_CHUNK_BYTES = 256 * 1024;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

/**
 * Stages a regular WebView file-picker File into app-private encrypted chunks
 * before the worker exists. A later worker never needs the WebView File object.
 */
export async function enqueueBrowserBackgroundUpload(
  options: Omit<Parameters<NativeBackgroundUploadPlugin["finalizeWebUpload"]>[0], "chunkCount">,
  file: File,
): Promise<boolean> {
  if (!available()) return false;
  const chunkCount = Math.max(1, Math.ceil(file.size / WEBVIEW_STAGE_CHUNK_BYTES));
  try {
    for (let index = 0; index < chunkCount; index += 1) {
      const start = index * WEBVIEW_STAGE_CHUNK_BYTES;
      const chunk = new Uint8Array(await file.slice(start, start + WEBVIEW_STAGE_CHUNK_BYTES).arrayBuffer());
      await BackgroundUploadPlugin.stageWebChunk({
        profileId: options.profileId,
        operationId: options.operationId,
        index,
        dataBase64: bytesToBase64(chunk),
      });
    }
    return (await BackgroundUploadPlugin.finalizeWebUpload({ ...options, chunkCount })).queued;
  } catch {
    return false;
  }
}

export async function getBackgroundUploadStatus(profileId: string, operationId: string): Promise<BackgroundUploadStatus | null> {
  if (!available()) return null;
  try {
    const raw = (await BackgroundUploadPlugin.getStatus({ profileId, operationId })).operation;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BackgroundUploadStatus;
    return typeof parsed.status === "string" ? parsed : null;
  } catch {
    return null;
  }
}
