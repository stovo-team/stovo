import { useEffect, useState } from "react";

import { downloadFileBlob, FamilyFile } from "../api/files";
import { peekCachedObjectUrl } from "../mediaBlobCache";

export default function useFilePreviewUrl(
  accessToken: string | null,
  file: FamilyFile | null,
  enabled = true
) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(() =>
    enabled && file ? peekCachedObjectUrl(file.id) : null
  );

  useEffect(() => {
    let cancelled = false;

    if (!enabled || !file || !file.mimeType.startsWith("image/")) {
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
  }, [accessToken, enabled, file?.id, file?.mimeType]);

  return previewUrl;
}
