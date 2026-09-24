import { useEffect, useState } from "react";

import { downloadFileBlob, FamilyFile } from "../api/files";
import { peekCachedObjectUrl } from "../mediaBlobCache";
import { shouldAutoDownloadMedia } from "../mediaDownloadPolicy";

export default function useFilePreviewUrl(
  accessToken: string | null,
  file: FamilyFile | null,
  enabled = true,
  allowVideoPreview = false
) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(() =>
    enabled && file?.id && (
      !file.mimeType ||
      file.mimeType.startsWith("image/") ||
      file.mimeType.includes("image") ||
      (allowVideoPreview && file.mimeType.startsWith("video/"))
    ) ? peekCachedObjectUrl(file.id) : null
  );

  useEffect(() => {
    let cancelled = false;

    if (!enabled || !file || !file.id) {
      setPreviewUrl(null);
      return undefined;
    }

    const isPreviewableImage = file.mimeType?.startsWith("image/") || file.mimeType?.includes("image");
    const isPreviewableVideo = allowVideoPreview && file.mimeType?.startsWith("video/");
    if (file.mimeType && !isPreviewableImage && !isPreviewableVideo) {
      setPreviewUrl(null);
      return undefined;
    }

    const cached = peekCachedObjectUrl(file.id);
    if (cached) {
      setPreviewUrl(cached);
      return undefined;
    }

    if (!accessToken) {
      setPreviewUrl(null);
      return undefined;
    }

    // Large/restricted media deliberately stays metadata-only until the user
    // explicitly opens or saves it. Cached blobs remain immediately usable.
    if (!shouldAutoDownloadMedia(file)) {
      setPreviewUrl(null);
      return undefined;
    }

    setPreviewUrl(null);
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const tryDownload = (retryCount = 0) => {
      downloadFileBlob(accessToken, file.id)
        .then(() => {
          if (cancelled) return;
          setPreviewUrl(peekCachedObjectUrl(file.id));
        })
        .catch(() => {
          if (cancelled || retryCount >= 1) return;
          retryTimer = setTimeout(() => {
            if (!cancelled) tryDownload(retryCount + 1);
          }, 1200);
        });
    };

    tryDownload();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [accessToken, allowVideoPreview, enabled, file?.id, file?.mimeType]);

  return previewUrl;
}
