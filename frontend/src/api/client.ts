import { Capacitor } from "@capacitor/core";
import { deduplicateRequest, loadApiResponseCache, saveApiResponseCache } from "./apiResponseCache";

const DEFAULT_API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const API_URL_STORAGE_KEY = "familyMessenger.apiUrl";
const REFRESH_TOKEN_STORAGE_KEY = "familyMessenger.refreshToken";
const KNOWN_TUNNEL_HOST_SUFFIXES = [
  ".trycloudflare.com",
  ".loca.lt",
  ".localtunnel.me"
];

function normalizeApiUrl(value: string | null | undefined): string | null {
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

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function readStoredApiUrl() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return normalizeApiUrl(window.localStorage?.getItem(API_URL_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function storeApiUrlFromInviteLink(searchQuery?: string) {
  // A browser invite is already bound to the origin that served it. Letting a
  // query parameter replace that origin turns an otherwise valid invite into a
  // credential-phishing link. Native App Links are handled separately because
  // their WebView has no useful window.location origin.
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) {
    return null;
  }

  let apiUrl: string | null = null;
  if (searchQuery) {
    try {
      const params = new URLSearchParams(searchQuery);
      apiUrl = normalizeApiUrl(params.get("apiUrl"));
    } catch {}
  }

  if (!apiUrl) {
    try {
      const params = new URLSearchParams(window.location.search);
      apiUrl = normalizeApiUrl(params.get("apiUrl"));
    } catch {}
  }

  if (!apiUrl) {
    try {
      const hrefUrl = new URL(window.location.href);
      apiUrl = normalizeApiUrl(hrefUrl.searchParams.get("apiUrl"));
    } catch {}
  }

  if (apiUrl) {
    window.localStorage.setItem(API_URL_STORAGE_KEY, apiUrl);
    return apiUrl;
  }
  return null;
}

function deriveApiUrlFromBrowser() {
  if (typeof window === "undefined") {
    return null;
  }

  const defaultUrl = normalizeApiUrl(DEFAULT_API_URL);
  if (!defaultUrl) {
    return null;
  }

  const defaultHost = new URL(defaultUrl).hostname;
  const browserHost = window.location.hostname;
  if (isLoopbackHost(defaultHost) && isLoopbackHost(browserHost) && window.location.port !== "5173") {
    return window.location.origin;
  }
  if (!isLoopbackHost(defaultHost) || isLoopbackHost(browserHost)) {
    return null;
  }

  if (window.location.port === "5173") {
    return `${window.location.protocol}//${browserHost}:8000`;
  }

  return window.location.origin;
}

import { deriveServerNameFromUrl, getActiveServer, hashServerUrl, loadServerState, normalizeApiUrl as registryNormalizeApiUrl, setActiveServerId, upsertServer } from "./serverRegistry";

function cacheProfileId() {
  return getActiveServer()?.user?.id ?? null;
}

function canCacheRequest(endpoint: string, options: ApiRequestOptions) {
  return (options.method ?? "GET").toUpperCase() === "GET" &&
    Boolean(options.accessToken) &&
    !endpoint.startsWith("/api/auth/");
}

export function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const match = window.location.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)/);
    if (match && !Capacitor.isNativePlatform()) {
      const slug = match[1];
      const clusterUrl = `${window.location.origin}/s/${slug}`;
      // A /s/<slug> URL is the actual server. Keep this lookup pure: this
      // function is called while React renders, and updating the registry
      // here emits a change event that causes an infinite render loop.
      return clusterUrl;
    }
  }
  const inviteUrl = storeApiUrlFromInviteLink();
  if (inviteUrl) {
    return inviteUrl;
  }
  const storedUrl = readStoredApiUrl();
  // A manually configured URL is authoritative. Previously regular server
  // URLs lost to an older /s/ cluster entry on Android, so requests went to
  // a different server and appeared as "Invalid credentials".
  if (storedUrl) return storedUrl;
  const activeServer = getActiveServer();
  if (activeServer?.url && activeServer.url.includes("/s/")) {
    return activeServer.url;
  }
  const state = loadServerState();
  const clusterServers = Object.values(state.servers).filter((s) => s.url && s.url.includes("/s/"));
  if (clusterServers.length > 0) {
    clusterServers.sort((a, b) => (b.lastActiveAt || "").localeCompare(a.lastActiveAt || ""));
    const bestCluster = clusterServers[0].url;
    try {
      window.localStorage.setItem(API_URL_STORAGE_KEY, bestCluster);
    } catch {}
    return bestCluster;
  }
  if (storedUrl) {
    return storedUrl;
  }
  if (activeServer?.url) {
    return activeServer.url;
  }
  return deriveApiUrlFromBrowser() ?? registryNormalizeApiUrl(DEFAULT_API_URL) ?? "http://localhost:8000";
}

export function getClusterPrefix(): string {
  const apiUrl = getApiUrl();
  const match = apiUrl.match(/\/s\/([a-zA-Z0-9_-]+)/);
  return match ? `/s/${match[1]}` : "";
}

export function isServerUrlConfigured(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return Boolean(getClusterPrefix()) || getActiveServer() !== null || readStoredApiUrl() !== null;
}

export function storeRefreshToken(token: string | null) {
  if (typeof window === "undefined") return;
  // Web sessions use the HttpOnly refresh cookie. Retaining a bearer refresh
  // token in localStorage would make any successful XSS persistent.
  if (!Capacitor.isNativePlatform()) {
    const activeServer = getActiveServer();
    if (activeServer?.refreshToken) {
      upsertServer({ ...activeServer, refreshToken: null });
    }
    window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    return;
  }
  const activeServer = getActiveServer();
  if (activeServer) {
    const saved = upsertServer({
      ...activeServer,
      refreshToken: token
    });
    setActiveServerId(saved.id);
  }
  if (token) {
    window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  }
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return null;
  const activeServer = getActiveServer();
  if (activeServer?.refreshToken !== undefined) {
    return activeServer.refreshToken;
  }
  return window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
}

export function setApiUrlOverride(apiUrl: string | null, familyName?: string) {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = registryNormalizeApiUrl(apiUrl);
  if (normalized) {
    const id = hashServerUrl(normalized);
    const existing = getActiveServer();
    const serverName = familyName || (existing?.url === normalized ? existing.name : deriveServerNameFromUrl(normalized));
    const saved = upsertServer({
      id,
      url: normalized,
      name: serverName,
      accessToken: existing?.url === normalized ? existing.accessToken : null,
      refreshToken: existing?.url === normalized ? existing.refreshToken : null,
      healthStatus: "online",
      unreadCount: existing?.url === normalized ? existing.unreadCount : 0
    });
    setActiveServerId(saved.id);
    window.localStorage.setItem(API_URL_STORAGE_KEY, normalized);
    return;
  }
  window.localStorage.removeItem(API_URL_STORAGE_KEY);
}

export function isTunnelHost(hostname: string) {
  const lowerHost = hostname.trim().toLowerCase();
  if (!lowerHost) {
    return false;
  }
  return KNOWN_TUNNEL_HOST_SUFFIXES.some((suffix) => lowerHost.endsWith(suffix));
}

function isTunnelApiUrl(apiUrl: string) {
  try {
    return isTunnelHost(new URL(apiUrl).hostname);
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : "Request failed");
    this.status = status;
    this.detail = detail;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  accessToken?: string | null;
}

export async function apiRequest<T>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
  const apiUrl = getApiUrl();
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (isTunnelApiUrl(apiUrl)) {
    headers.set("bypass-tunnel-reminder", "1");
    headers.set("abypass-tunnel-reminder", "1");
  }

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }

  if (options.accessToken) {
    headers.set("Authorization", `Bearer ${options.accessToken}`);
  }

  const cacheable = canCacheRequest(endpoint, options);
  const profileId = cacheable ? cacheProfileId() : null;

  // Deduplicate identical in-flight GET requests so that multiple components
  // mounting at the same time (e.g. AppNav + sidebar both asking for
  // /api/family) share a single network round-trip.
  const executeRequest = async (): Promise<T> => {
    let response: Response;
    try {
      response = await fetch(`${apiUrl}${endpoint}`, {
        ...options,
        body,
        headers,
        credentials: "include"
      });
    } catch (error) {
      const cached = cacheable ? await loadApiResponseCache<T>(profileId, endpoint) : null;
      if (cached !== null) return cached;
      throw error;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      // A server outage should not erase a usable local view. Authentication and
      // client errors remain authoritative and are never replaced by stale data.
      if (response.status >= 500 && cacheable) {
        const cached = await loadApiResponseCache<T>(profileId, endpoint);
        if (cached !== null) return cached;
      }
      throw new ApiError(response.status, payload?.detail ?? response.statusText);
    }

    if (cacheable) void saveApiResponseCache(profileId, endpoint, payload);
    return payload as T;
  };

  return cacheable
    ? deduplicateRequest(profileId, endpoint, executeRequest)
    : executeRequest();
}

export const API_URL = getApiUrl();
