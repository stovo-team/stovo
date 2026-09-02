import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";

import {
  addNativeMediaLibraryListener,
  fetchNativeMediaFileUrl,
  getCachedNativeMedia,
  isNativeMediaLibraryAvailable,
  listNativeMedia,
  type NativeMediaCategory,
  type NativeMediaItem
} from "../../native/mediaLibraryPlugin";
import type { AttachmentPickerTab } from "../AttachmentPickerSheet";

export type MediaPickerState = "loading" | "ready" | "empty" | "error";

const categoryFor = (tab: AttachmentPickerTab): NativeMediaCategory | null => {
  if (tab === "file") return "documents";
  if (tab === "gallery" || tab === "audio") return tab;
  return null;
};
const INITIAL_BATCH_SIZE = 12;
const BACKGROUND_BATCH_SIZE = 24;
const MAX_MEDIA_ITEMS = 120;

/** Loads device media and owns the selection state used by the attachment sheet. */
export function useMediaPicker(open: boolean, activeTab: AttachmentPickerTab, previewItem: NativeMediaItem | null) {
  const [media, setMedia] = useState<NativeMediaItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [state, setState] = useState<MediaPickerState>("loading");
  const [fullPreviewUrl, setFullPreviewUrl] = useState<string | null>(null);
  const loadGenerationRef = useRef(0);

  const loadRecentItems = useCallback(async (tab: AttachmentPickerTab) => {
    const generation = ++loadGenerationRef.current;
    const category = categoryFor(tab);
    if (!category || !isNativeMediaLibraryAvailable()) {
      setMedia([]);
      setState("empty");
      return;
    }
    const cached = getCachedNativeMedia(category);
    if (cached.length) {
      setMedia(cached);
      setState("ready");
    } else {
      setState("loading");
    }
    try {
      const items = await listNativeMedia(category, { limit: INITIAL_BATCH_SIZE });
      if (generation !== loadGenerationRef.current) return;
      setMedia(items);
      setState(items.length ? "ready" : "empty");
      if (!items.length) return;

      // Preview generation is expensive on Android. Render a usable first page,
      // then append the rest without blocking the picker animation or interaction.
      let offset = INITIAL_BATCH_SIZE;
      let allItems = items;
      while (offset < MAX_MEDIA_ITEMS) {
        const nextBatch = await listNativeMedia(category, { limit: BACKGROUND_BATCH_SIZE, offset });
        if (generation !== loadGenerationRef.current || !nextBatch.length) return;
        allItems = [...allItems, ...nextBatch];
        setMedia(allItems);
        if (nextBatch.length < BACKGROUND_BATCH_SIZE) return;
        offset += BACKGROUND_BATCH_SIZE;
      }
    } catch {
      if (generation !== loadGenerationRef.current) return;
      setMedia([]);
      setState("error");
    }
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedItemIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }, []);

  const clearSelection = useCallback(() => setSelectedItemIds([]), []);

  useEffect(() => {
    if (open) void loadRecentItems(activeTab);
    else loadGenerationRef.current += 1;
  }, [activeTab, loadRecentItems, open]);

  useEffect(() => {
    if (!open || !isNativeMediaLibraryAvailable()) return;
    let disposed = false;
    let removeMediaListener: () => void = () => undefined;
    let appStateListener: { remove: () => Promise<void> } | undefined;

    void addNativeMediaLibraryListener((category) => {
      const activeCategory = categoryFor(activeTab);
      if (!disposed && activeCategory && category === activeCategory) void loadRecentItems(activeTab);
    }).then((remove) => {
      if (disposed) remove(); else removeMediaListener = remove;
    });
    void App.addListener("appStateChange", ({ isActive }) => {
      if (!disposed && isActive) void loadRecentItems(activeTab);
    }).then((listener) => {
      if (disposed) void listener.remove(); else appStateListener = listener;
    });

    return () => {
      disposed = true;
      removeMediaListener();
      void appStateListener?.remove();
    };
  }, [activeTab, loadRecentItems, open]);

  useEffect(() => {
    if (!open || !previewItem) {
      setFullPreviewUrl(null);
      return;
    }
    let cancelled = false;
    void fetchNativeMediaFileUrl(previewItem.id).then((url) => {
      if (!cancelled && url) setFullPreviewUrl(url);
    });
    return () => { cancelled = true; };
  }, [open, previewItem]);

  return { media, selectedItemIds, state, fullPreviewUrl, loadRecentItems, toggleSelection, clearSelection };
}
