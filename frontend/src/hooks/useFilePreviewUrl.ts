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

    if (!enabled || !accessToken || !file || !file.mimeType.startsWith("image/")) {
      setPreviewUrl(null);
      return undefined;
    }

    const cached = peekCachedObjectUrl(file.id);
    if (cached) {
      setPreviewUrl(cached);
      return undefined;
    }

    setPreviewUrl(null);
    void downloadFileBlob(accessToken, file.id)
      .then(() => {
        if (cancelled) return;
        setPreviewUrl(peekCachedObjectUrl(file.id));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [accessToken, enabled, file?.id, file?.mimeType]);

  return previewUrl;
}
