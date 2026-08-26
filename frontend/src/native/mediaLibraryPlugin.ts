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

/** A Web File that still knows the app-private native source it came from. */
export type NativeBackedFile = File & { readonly stovoNativeSourceUri?: string };

type NativeMediaLibraryPlugin = {
  listMedia(options?: { limit?: number; offset?: number; category?: NativeMediaCategory }): Promise<{ items: NativeMediaItem[] }>;
  copyMedia(options: { ids: string[] }): Promise<{ files: CachedMediaFile[] }>;
  addListener(
    eventName: "mediaLibraryChanged",
    listener: (event: { category: NativeMediaCategory }) => void
  ): Promise<{ remove: () => Promise<void> }>;
};

const MediaLibraryPlugin = registerPlugin<NativeMediaLibraryPlugin>("MediaLibraryPlugin");

const mediaCache = new Map<NativeMediaCategory, NativeMediaItem[]>();

export function isNativeMediaLibraryAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function listNativeMedia(
  category: NativeMediaCategory = "gallery",
  options: { limit?: number; offset?: number } = {}
): Promise<NativeMediaItem[]> {
  if (!isNativeMediaLibraryAvailable()) return [];
  const result = await MediaLibraryPlugin.listMedia({ limit: options.limit ?? 120, offset: options.offset ?? 0, category });
  const items = (result.items ?? []).filter((item) => item.id && item.uri && item.mimeType);
  // The cache is only for the immediately usable first page. Do not replace it
  // with a later batch, otherwise reopening the picker would start halfway down.
  if ((options.offset ?? 0) === 0) mediaCache.set(category, items);
  return items;
}

/** Returns the last device query immediately while a fresh query runs in the background. */
export function getCachedNativeMedia(category: NativeMediaCategory): NativeMediaItem[] {
  return mediaCache.get(category) ?? [];
}

/** Subscribes while the attachment sheet is open so new device photos appear without reopening it. */
export async function addNativeMediaLibraryListener(
  onChange: (category: NativeMediaCategory) => void
): Promise<() => void> {
  if (!isNativeMediaLibraryAvailable()) return () => undefined;
  try {
    const handle = await MediaLibraryPlugin.addListener("mediaLibraryChanged", ({ category }) => onChange(category));
    return () => { void handle.remove(); };
  } catch {
    return () => undefined;
  }
}

/** Maps an Android cache file to a URL that the Capacitor WebView can display. */
export function nativeMediaPreviewUrl(item: NativeMediaItem): string {
  return item.thumbnailPath ? Capacitor.convertFileSrc(item.thumbnailPath) : item.uri;
}

export async function fetchNativeMediaFileUrl(id: string): Promise<string | null> {
  if (!isNativeMediaLibraryAvailable() || !id) return null;
  try {
    const result = await MediaLibraryPlugin.copyMedia({ ids: [id] });
    const first = result.files?.[0];
    return first?.path ? Capacitor.convertFileSrc(first.path) : null;
  } catch {
    return null;
  }
}

export async function selectNativeMediaFiles(
  ids: string[],
  fetcher: typeof fetch = fetch
): Promise<NativeBackedFile[]> {
  if (!isNativeMediaLibraryAvailable() || ids.length === 0) return [];
  const result = await MediaLibraryPlugin.copyMedia({ ids });
  const files: NativeBackedFile[] = [];
  for (const cached of result.files ?? []) {
    try {
      const response = await fetcher(Capacitor.convertFileSrc(cached.path));
      if (!response.ok) continue;
      const blob = await response.blob();
      const file = new File([blob], cached.name, { type: cached.mimeType || blob.type }) as NativeBackedFile;
      Object.defineProperty(file, "stovoNativeSourceUri", { value: cached.path, enumerable: false });
      files.push(file);
    } catch {
      // Ignore individual file errors to let other attachments succeed
    }
  }
  return files;
}

/** Returns the app-private native source retained for WorkManager staging. */
export function nativeSourceUriForFile(file: File): string | null {
  const source = (file as NativeBackedFile).stovoNativeSourceUri;
  return typeof source === "string" && source.trim() ? source : null;
}
