import type { User } from "./auth";

export interface ServerAccount {
  id: string;                 // Backend UUID or URL-based hash
  url: string;                // Base API URL (e.g., "https://stovo.mydomain.com/s/family")
  name: string;               // Display / Family Name
  addedAt: string;
  lastActiveAt: string;
  accessToken: string | null;
  refreshToken: string | null;
  user?: User | null;
  healthStatus: "online" | "offline" | "unreachable" | "checking";
  unreadCount: number;
}

export interface MultiServerState {
  activeServerId: string | null;
  servers: Record<string, ServerAccount>;
}

const SERVERS_STORAGE_KEY = "stovo.multiServerState";
const LEGACY_API_URL_KEY = "familyMessenger.apiUrl";
const LEGACY_REFRESH_TOKEN_KEY = "familyMessenger.refreshToken";
// This is the public entry point for the multi-server installation.  It
// routes a request to a cluster; it is not itself a member server.
const CLUSTER_REDIRECTOR_HOST = "stovo-cloud.stovo.ru";

export function normalizeApiUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/**
 * Hash a URL to a stable server ID fallback when server_id UUID is not available
 */
export function hashServerUrl(url: string): string {
  const normalized = normalizeApiUrl(url) ?? url;
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `srv_${Math.abs(hash).toString(36)}`;
}

export function deriveServerNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const subpath = parsed.pathname.replace(/\/$/, "");
    if (subpath && subpath !== "/") {
      const parts = subpath.split("/").filter(Boolean);
      const last = parts[parts.length - 1];
      if (last) {
        return last.charAt(0).toUpperCase() + last.slice(1);
      }
    }
    return parsed.hostname;
  } catch {
    return "Stovo Server";
  }
}

export function isMasterOrchestratorUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    const pathname = parsed.pathname.replace(/\/$/, "");
    const isRootPath = pathname === "" || pathname === "/";
    return (
      ((parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") || parsed.hostname === CLUSTER_REDIRECTOR_HOST) &&
      isRootPath
    );
  } catch {
    return false;
  }
}

/**
 * Load server state from storage, migrating legacy single-server keys if necessary.
 */
export function loadServerState(): MultiServerState {
  if (typeof window === "undefined" || !window.localStorage) {
    return { activeServerId: null, servers: {} };
  }

  try {
    const raw = window.localStorage.getItem(SERVERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MultiServerState;
      if (parsed && typeof parsed.servers === "object") {
        const cleanedServers: Record<string, ServerAccount> = {};
        for (const [id, s] of Object.entries(parsed.servers)) {
          if (!s.url || isMasterOrchestratorUrl(s.url)) {
            continue;
          }
          cleanedServers[id] = s;
        }
        const didRemoveRedirector = Object.keys(cleanedServers).length !== Object.keys(parsed.servers).length;
        parsed.servers = cleanedServers;
        if (parsed.activeServerId && !parsed.servers[parsed.activeServerId]) {
          const clusterKeys = Object.keys(parsed.servers);
          parsed.activeServerId = clusterKeys.length > 0 ? clusterKeys[0] : null;
        }
        // Persist the migration so a redirector cannot reappear on the next
        // launch and be mistaken for a selectable server.
        if (didRemoveRedirector) saveServerState(parsed);
        return parsed;
      }
    }
  } catch {
    // Ignore parse errors
  }

  const legacyUrl = normalizeApiUrl(window.localStorage.getItem(LEGACY_API_URL_KEY));
  const legacyRefreshToken = window.localStorage.getItem(LEGACY_REFRESH_TOKEN_KEY);

  if (legacyUrl && !isMasterOrchestratorUrl(legacyUrl)) {
    const serverId = hashServerUrl(legacyUrl);
    const legacyServer: ServerAccount = {
      id: serverId,
      url: legacyUrl,
      name: deriveServerNameFromUrl(legacyUrl),
      addedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      accessToken: null,
      refreshToken: legacyRefreshToken,
      healthStatus: "online",
      unreadCount: 0
    };

    const newState: MultiServerState = {
      activeServerId: serverId,
      servers: { [serverId]: legacyServer }
    };
    saveServerState(newState);
    return newState;
  }

  return { activeServerId: null, servers: {} };
}

/**
 * Persist server state to localStorage and dual-write active server to legacy keys.
 */
export function saveServerState(state: MultiServerState): void {
  if (typeof window === "undefined" || !window.localStorage) return;

  try {
    window.localStorage.setItem(SERVERS_STORAGE_KEY, JSON.stringify(state));
  } catch {}

  const activeServer = state.activeServerId ? state.servers[state.activeServerId] : null;
  if (activeServer) {
    try {
      window.localStorage.setItem(LEGACY_API_URL_KEY, activeServer.url);
      if (activeServer.refreshToken) {
        window.localStorage.setItem(LEGACY_REFRESH_TOKEN_KEY, activeServer.refreshToken);
      } else {
        window.localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
      }
    } catch {}
  }

  window.dispatchEvent(new Event("stovo:servers-changed"));
}

/**
 * Get current active server account or null
 */
export function getActiveServer(): ServerAccount | null {
  const state = loadServerState();
  if (state.activeServerId && state.servers[state.activeServerId]) {
    const active = state.servers[state.activeServerId];
    if (!isMasterOrchestratorUrl(active.url)) {
      return active;
    }
  }
  const validServers = Object.values(state.servers).filter((s) => s.url && !isMasterOrchestratorUrl(s.url));
  if (validServers.length > 0) {
    validServers.sort((a, b) => (b.lastActiveAt || "").localeCompare(a.lastActiveAt || ""));
    return validServers[0];
  }
  return null;
}

/**
 * Save or update a server account in the registry
 */
export function upsertServer(server: Omit<ServerAccount, "addedAt" | "lastActiveAt"> & { addedAt?: string }): ServerAccount {
  const state = loadServerState();
  const existing = state.servers[server.id];

  const now = new Date().toISOString();
  const updated: ServerAccount = {
    ...existing,
    ...server,
    addedAt: existing?.addedAt ?? server.addedAt ?? now,
    lastActiveAt: now
  };

  state.servers[server.id] = updated;

  // If no active server, make this the active server
  if (!state.activeServerId) {
    state.activeServerId = server.id;
  }

  saveServerState(state);
  return updated;
}

/**
 * Set active server by ID
 */
export function setActiveServerId(serverId: string): ServerAccount | null {
  const state = loadServerState();
  if (!state.servers[serverId]) {
    return null;
  }

  state.activeServerId = serverId;
  state.servers[serverId].lastActiveAt = new Date().toISOString();
  saveServerState(state);
  return state.servers[serverId];
}

/**
 * Remove a server by ID
 */
export function removeServerById(serverId: string): MultiServerState {
  const state = loadServerState();
  delete state.servers[serverId];

  if (state.activeServerId === serverId) {
    const remainingIds = Object.keys(state.servers);
    state.activeServerId = remainingIds.length > 0 ? remainingIds[0] : null;
  }

  saveServerState(state);
  return state;
}

/**
 * Extract origin and subpath for Socket.IO connection
 */
export function getSocketConfigForUrl(serverUrl: string): { origin: string; path: string } {
  try {
    const urlObj = new URL(serverUrl);
    const subpath = urlObj.pathname.replace(/\/$/, "");
    return {
      origin: urlObj.origin,
      path: `${subpath}/socket.io`
    };
  } catch {
    return {
      origin: serverUrl,
      path: "/socket.io"
    };
  }
}
