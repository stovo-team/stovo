import { useEffect, useState } from "react";

import { downloadFileBlob, FamilyFile } from "../api/files";

export default function useFilePreviewUrl(
  accessToken: string | null,
  file: FamilyFile | null,
  enabled = true
) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    setPreviewUrl(null);

    if (!enabled || !accessToken || !file || !file.mimeType.startsWith("image/")) {
      return undefined;
    }

    downloadFileBlob(accessToken, file.id)
      .then((blob) => {
        if (cancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [accessToken, enabled, file?.id, file?.mimeType]);

  return previewUrl;
}
