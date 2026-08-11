import { normalizeApiUrl } from "./api/serverRegistry";

export interface ConnectionCredentials {
  serverUrl: string;
  username: string;
}

/** A shareable app link. It deliberately opens a pre-filled login form, never logs in by itself. */
export function createConnectionLink(credentials: ConnectionCredentials): string {
  const url = new URL("stovo://connect");
  url.searchParams.set("server", credentials.serverUrl);
  url.searchParams.set("username", credentials.username);
  return url.toString();
}

export function parseConnectionLink(rawUrl: string): ConnectionCredentials | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "stovo:" || url.hostname !== "connect") return null;
    const serverUrl = normalizeApiUrl(url.searchParams.get("server"));
    const username = url.searchParams.get("username")?.trim();
    if (!serverUrl || !username) return null;
    return { serverUrl, username };
  } catch {
    return null;
  }
}
