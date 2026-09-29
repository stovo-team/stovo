const APP_LINK_HOST = "stovo-cloud.stovo.ru";
const AUDIO_PLAYBACK_APP_LINK_PATH = "/app/chats?restoreAudio=1";

export type NotificationAppLink = {
  path: string;
  action?: "callback";
};

const CHAT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Returns the API base carried by an HTTP(S) invite link. A cluster invite
 * such as https://host/s/family/invite/token must keep /s/family as part of
 * its API base when it is opened in the native app.
 */
export function getInviteApiUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    const invitePathIndex = url.pathname.indexOf("/invite/");
    if (invitePathIndex === -1) {
      return null;
    }
    return `${url.origin}${url.pathname.slice(0, invitePathIndex)}`;
  } catch {
    return null;
  }
}

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
    // Bind an App Link to the origin that actually served its HTTP(S) invite.
    // Never preserve a caller-provided apiUrl: it could switch the login flow
    // to an attacker-controlled server. A bare stovo:// invite has no trusted
    // server identity and is rejected instead of guessing from saved state.
    searchParams.delete("apiUrl");
    const inviteApiUrl = getInviteApiUrl(rawUrl);
    if (!inviteApiUrl) {
      return null;
    }
    searchParams.set("apiUrl", inviteApiUrl);
    const searchStr = searchParams.toString();
    const query = searchStr ? `?${searchStr}` : "";

    return `/invite/${encodeURIComponent(token)}${query}`;
  } catch {
    return null;
  }
}

export function getQRLoginApprovalPath(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "stovo:" || url.hostname !== "auth" || url.search || url.hash || url.port || url.username || url.password) return null;
    const match = url.pathname.match(/^\/qr-approve\/([A-Za-z0-9_-]{32,128})$/);
    return match ? `/app/qr-login/${encodeURIComponent(match[1])}` : null;
  } catch {
    return null;
  }
}
