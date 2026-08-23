import { useCallback, useEffect, useState } from "react";
import { App } from "@capacitor/app";

import {
  addNativeMediaLibraryListener,
  fetchNativeMediaFileUrl,
  getCachedNativeMedia,
  isNativeMediaLibraryAvailable,
  listNativeMedia,
  type NativeMediaItem
} from "../../native/mediaLibraryPlugin";
import type { AttachmentPickerTab } from "../AttachmentPickerSheet";

export type MediaPickerState = "loading" | "ready" | "empty" | "error";

const categoryFor = (tab: AttachmentPickerTab) => (tab === "file" ? "documents" : tab);

/** Loads device media and owns the selection state used by the attachment sheet. */
export function useMediaPicker(open: boolean, activeTab: AttachmentPickerTab, previewItem: NativeMediaItem | null) {
  const [media, setMedia] = useState<NativeMediaItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [state, setState] = useState<MediaPickerState>("loading");
  const [fullPreviewUrl, setFullPreviewUrl] = useState<string | null>(null);

  const loadRecentItems = useCallback(async (tab: AttachmentPickerTab) => {
    if (!isNativeMediaLibraryAvailable()) {
      setMedia([]);
      setState("empty");
      return;
    }
    const cached = getCachedNativeMedia(categoryFor(tab));
    if (cached.length) {
      setMedia(cached);
      setState("ready");
    } else {
      setState("loading");
    }
    try {
      const items = await listNativeMedia(categoryFor(tab));
      setMedia(items);
      setState(items.length ? "ready" : "empty");
    } catch {
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
  }, [activeTab, loadRecentItems, open]);

  useEffect(() => {
    if (!open || !isNativeMediaLibraryAvailable()) return;
    let disposed = false;
    let removeMediaListener: () => void = () => undefined;
    let appStateListener: { remove: () => Promise<void> } | undefined;

    void addNativeMediaLibraryListener((category) => {
      if (!disposed && category === categoryFor(activeTab)) void loadRecentItems(activeTab);
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
