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
    const isSupportedProtocol = url.protocol === "http:" || url.protocol === "https:" || url.protocol === "stovo:";
    if (!isSupportedProtocol) {
      return null;
    }

    let token: string | null = null;

    const queryToken = url.searchParams.get("token");
    if (queryToken && /^[A-Za-z0-9_.-]+$/.test(queryToken)) {
      token = queryToken;
    }

    if (!token) {
      const fullPath = url.protocol === "stovo:" && url.hostname === "invite"
        ? `/invite${url.pathname}`
        : url.pathname;

      const match = fullPath.match(/(?:^|\/)invite\/([A-Za-z0-9_.-]+)/);
      if (match) {
        token = match[1];
      }
    }

    if (!token) {
      return null;
    }

    const searchParams = new URLSearchParams(url.search);
    if (queryToken) {
      searchParams.delete("token");
    }
    const searchStr = searchParams.toString();
    const query = searchStr ? `?${searchStr}` : "";

    return `/invite/${encodeURIComponent(token)}${query}`;
  } catch {
    return null;
  }
}
