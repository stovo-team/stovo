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

    // Android MediaService needs a credentialed stream URL with media token.
    // In-memory WebView blob URLs cannot be opened by Android ExoPlayer.
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      if (!accessToken.trim()) {
        if (localCachedUrl) return { url: localCachedUrl };
        throw new Error("Audio playback requires authentication");
      }
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

    if (localCachedUrl) {
      return { url: localCachedUrl };
    }

    if (!accessToken.trim()) {
      throw new Error("Audio playback requires authentication");
    }

    // Web: play from the shared media blob cache when available.
    try {
      await downloadFileBlob(accessToken, fileId);
      const cachedUrl = peekCachedObjectUrl(fileId);
      if (cachedUrl) {
        return { url: cachedUrl };
      }
    } catch {
      // Fallback to direct media streaming if blob download encounters an issue
    }

    try {
      const capability = await createMediaPlaybackToken(accessToken, fileId);
      const mimeType =
        descriptor.mimeType?.trim() && descriptor.mimeType.startsWith("audio/")
          ? descriptor.mimeType.trim()
          : "audio/mpeg";
      return {
        url: getMediaPlaybackUrl(fileId, capability.token),
        token: capability.token,
        mimeType
      };
    } catch {
      const cachedUrl = peekCachedObjectUrl(fileId);
      if (cachedUrl) {
        return { url: cachedUrl };
      }
      throw new Error("Audio cache miss after download");
    }
  };
}
