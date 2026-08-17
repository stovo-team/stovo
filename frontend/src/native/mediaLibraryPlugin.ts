import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativeMediaItem = {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  durationMs: number;
  thumbnailPath?: string;
};

export type NativeMediaCategory = "gallery" | "audio" | "documents";

type CachedMediaFile = { path: string; name: string; mimeType: string };

type NativeMediaLibraryPlugin = {
  listMedia(options?: { limit?: number; category?: NativeMediaCategory }): Promise<{ items: NativeMediaItem[] }>;
  copyMedia(options: { ids: string[] }): Promise<{ files: CachedMediaFile[] }>;
};

const MediaLibraryPlugin = registerPlugin<NativeMediaLibraryPlugin>("MediaLibraryPlugin");

const mediaCache = new Map<NativeMediaCategory, NativeMediaItem[]>();

export function isNativeMediaLibraryAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function listNativeMedia(category: NativeMediaCategory = "gallery"): Promise<NativeMediaItem[]> {
  if (!isNativeMediaLibraryAvailable()) return [];
  const result = await MediaLibraryPlugin.listMedia({ limit: 120, category });
  const items = (result.items ?? []).filter((item) => item.id && item.uri && item.mimeType);
  mediaCache.set(category, items);
  return items;
}

/** Returns the last device query immediately while a fresh query runs in the background. */
export function getCachedNativeMedia(category: NativeMediaCategory): NativeMediaItem[] {
  return mediaCache.get(category) ?? [];
}

/** Maps an Android cache file to a URL that the Capacitor WebView can display. */
export function nativeMediaPreviewUrl(item: NativeMediaItem): string {
  return item.thumbnailPath ? Capacitor.convertFileSrc(item.thumbnailPath) : item.uri;
}

export async function selectNativeMediaFiles(
  ids: string[],
  fetcher: typeof fetch = fetch
): Promise<File[]> {
  if (!isNativeMediaLibraryAvailable() || ids.length === 0) return [];
  const result = await MediaLibraryPlugin.copyMedia({ ids });
  const files: File[] = [];
  for (const cached of result.files ?? []) {
    try {
      const response = await fetcher(Capacitor.convertFileSrc(cached.path));
      if (!response.ok) continue;
      const blob = await response.blob();
      files.push(new File([blob], cached.name, { type: cached.mimeType || blob.type }));
    } catch {
      // Ignore individual file errors to let other attachments succeed
    }
  }
  return files;
}
