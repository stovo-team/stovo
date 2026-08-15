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
    if (!accessToken.trim()) {
      throw new Error("Audio playback requires authentication");
    }

    const fileId = descriptor.identity.fileId;

    // Android MediaService needs a credentialed stream URL. Warm the blob cache
    // in the background so later web/fallback playback is instant.
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      void downloadFileBlob(accessToken, fileId).catch(() => undefined);
      const capability = await createMediaPlaybackToken(accessToken, fileId);
      return {
        url: getMediaPlaybackUrl(fileId),
        token: capability.token,
        mimeType: descriptor.mimeType
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
