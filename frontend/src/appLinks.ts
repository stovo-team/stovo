const APP_LINK_HOST = "stovo-cloud.stovo.ru";
const AUDIO_PLAYBACK_APP_LINK_PATH = "/app/chats?restoreAudio=1";

export type NotificationAppLink = {
  path: string;
  action?: "callback";
};

const CHAT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function getNotificationAppLink(rawUrl: string): NotificationAppLink | null {
  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== "stovo:" ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return null;
    }

    const pathParts = url.pathname.split("/").filter(Boolean);
    if (url.hostname === "chat" && pathParts.length === 1) {
      const [chatId] = pathParts;
      return CHAT_ID_PATTERN.test(chatId)
        ? { path: `/app/chats/${encodeURIComponent(chatId)}` }
        : null;
    }

    if (
      url.hostname === "call" &&
      pathParts.length === 2 &&
      (pathParts[0] === "missed" || pathParts[0] === "callback")
    ) {
      const chatId = pathParts[1];
      if (!CHAT_ID_PATTERN.test(chatId)) {
        return null;
      }
      return {
        path: `/app/chats/${encodeURIComponent(chatId)}`,
        ...(pathParts[0] === "callback" ? { action: "callback" as const } : {})
      };
    }
    return null;
  } catch {
    return null;
  }
}

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
