import { Capacitor } from "@capacitor/core";

import {
  createMediaPlaybackToken,
  downloadFileBlob,
  getMediaPlaybackUrl
} from "../../../api/files";
import { peekCachedObjectUrl } from "../../../mediaBlobCache";
import type { AudioSourceFactory } from "../../../audioPlaybackSession";

export function buildAudioSourceFactory(accessToken: string): AudioSourceFactory {
  return async (descriptor) => {
    const fileId = descriptor.identity.fileId;
    const localCachedUrl = peekCachedObjectUrl(fileId);
    if (localCachedUrl && (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android")) {
      return { url: localCachedUrl };
    }

    if (!accessToken.trim()) {
      if (localCachedUrl) return { url: localCachedUrl };
      throw new Error("Audio playback requires authentication");
    }

    // Android MediaService needs a credentialed stream URL. Warm the blob cache
    // in the background so later web/fallback playback is instant.
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      if (localCachedUrl) return { url: localCachedUrl };
      void downloadFileBlob(accessToken, fileId).catch(() => undefined);
      const capability = await createMediaPlaybackToken(accessToken, fileId);
      const mimeType =
        descriptor.mimeType?.trim() && descriptor.mimeType.startsWith("audio/")
          ? descriptor.mimeType.trim()
          : "audio/mpeg";
      return {
        url: getMediaPlaybackUrl(fileId),
        token: capability.token,
        mimeType
      };
    }

    // Web: play from the shared media blob cache. Never mark objectUrl owned —
    // the playback backend must not revoke cache URLs (that crashed second play).
    await downloadFileBlob(accessToken, fileId);
    const cachedUrl = peekCachedObjectUrl(fileId);
    if (!cachedUrl) {
      throw new Error("Audio cache miss after download");
    }
    return { url: cachedUrl };
  };
}
