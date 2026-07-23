const APP_LINK_HOST = "stovo-local.stovo.ru";
const AUDIO_PLAYBACK_APP_LINK_PATH = "/app/chats?restoreAudio=1";

export function getAudioPlaybackAppLinkPath(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== APP_LINK_HOST ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      url.pathname !== "/app/audio"
    ) {
      return null;
    }
    return AUDIO_PLAYBACK_APP_LINK_PATH;
  } catch {
    return null;
  }
}

export function getInviteAppLinkPath(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== APP_LINK_HOST ||
      !/^\/invite\/[^/]+$/.test(url.pathname)
    ) {
      return null;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
