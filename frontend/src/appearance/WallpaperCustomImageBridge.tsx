import { useEffect, useState } from "react";

import { FamilyFile, getFile } from "../api/files";
import { useAuth } from "../auth/AuthContext";
import useFilePreviewUrl from "../hooks/useFilePreviewUrl";

import { useAppearance } from "./AppearanceContext";

/**
 * Resolves the global custom wallpaper file into a CSS url() on :root.
 * Lives under AuthProvider so download tokens are available.
 */
export default function WallpaperCustomImageBridge() {
  const { accessToken } = useAuth();
  const { appearance } = useAppearance();
  const fileId = appearance.customWallpaperFileId;
  const enabled = appearance.wallpaper === "custom" && Boolean(fileId);
  const [file, setFile] = useState<FamilyFile | null>(null);
  const previewUrl = useFilePreviewUrl(accessToken, file, enabled);

  useEffect(() => {
    let cancelled = false;
    if (!accessToken || !fileId || !enabled) {
      setFile(null);
      return undefined;
    }
    void getFile(accessToken, fileId)
      .then((result) => {
        if (!cancelled) {
          setFile(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFile(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, enabled, fileId]);

  useEffect(() => {
    const root = document.documentElement;
    if (!enabled || !previewUrl) {
      if (appearance.wallpaper !== "custom") {
        root.style.removeProperty("--wallpaper-custom-image");
      }
      return;
    }
    root.style.setProperty("--wallpaper-custom-image", `url("${previewUrl}")`);
  }, [appearance.wallpaper, enabled, previewUrl]);

  return null;
}
