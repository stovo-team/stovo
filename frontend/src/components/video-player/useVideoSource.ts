import { useEffect, useState } from "react";

import { createStreamingMediaUrl, downloadFileBlob, type FamilyFile } from "../../api/files";
import { peekCachedObjectUrl } from "../../mediaBlobCache";
import type { VideoIdentity } from "../../videoPlaybackSession";

function invalidSource(file: FamilyFile, accessToken: string, identity: VideoIdentity): "source" | "format" | null {
  if (!file.id?.trim() || !identity.chatId?.trim() || !identity.messageId?.trim() || !identity.fileId?.trim() || identity.fileId !== file.id) return "source";
  if (!accessToken.trim() && !peekCachedObjectUrl(file.id)) return "source";
  return /^video\/[^\s/]+$/i.test(file.mimeType.trim()) ? null : "format";
}

export function useVideoSource(file: FamilyFile, accessToken: string, identity: VideoIdentity, onLoading: () => void, onFailure: (message: string) => void, enabled = true) {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSourceUrl(null);
    if (!enabled && !peekCachedObjectUrl(file.id)) return () => { cancelled = true; };
    const invalid = invalidSource(file, accessToken, identity);
    if (invalid) { onFailure(invalid === "format" ? "Unsupported video format" : "Video source is unavailable"); return () => { cancelled = true; }; }
    onLoading();
    const cached = peekCachedObjectUrl(file.id);
    if (cached) { setSourceUrl(cached); return () => { cancelled = true; }; }
    void createStreamingMediaUrl(accessToken, file.id).then((url) => {
      if (cancelled) return;
      setSourceUrl(url);
      void downloadFileBlob(accessToken, file.id).catch(() => undefined);
    }).catch(() => {
      if (cancelled) return;
      void downloadFileBlob(accessToken, file.id).then((blob) => {
        if (cancelled) return;
        if (blob.size === 0) { onFailure("Video source is empty"); return; }
        const url = peekCachedObjectUrl(file.id);
        if (!url) { onFailure("Video source is unavailable"); return; }
        setSourceUrl(url);
      }).catch(() => { if (!cancelled) onFailure("Video download failed"); });
    });
    return () => { cancelled = true; };
  }, [accessToken, enabled, file.id, file.mimeType, identity.chatId, identity.fileId, identity.messageId, onFailure, onLoading]);
  return sourceUrl;
}
