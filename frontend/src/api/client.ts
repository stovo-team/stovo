const DEFAULT_API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const API_URL_STORAGE_KEY = "familyMessenger.apiUrl";

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
  return normalizeApiUrl(window.localStorage.getItem(API_URL_STORAGE_KEY));
}

function storeApiUrlFromInviteLink() {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const apiUrl = normalizeApiUrl(params.get("apiUrl"));
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
  if (!isLoopbackHost(defaultHost) || isLoopbackHost(browserHost)) {
    return null;
  }

  if (window.location.port === "5173") {
    return `${window.location.protocol}//${browserHost}:8000`;
  }

  return window.location.origin;
}

export function getApiUrl() {
  return (
    storeApiUrlFromInviteLink() ??
    readStoredApiUrl() ??
    deriveApiUrlFromBrowser() ??
    normalizeApiUrl(DEFAULT_API_URL) ??
    "http://localhost:8000"
  );
}

export function setApiUrlOverride(apiUrl: string | null) {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = normalizeApiUrl(apiUrl);
  if (normalized) {
    window.localStorage.setItem(API_URL_STORAGE_KEY, normalized);
    return;
  }
  window.localStorage.removeItem(API_URL_STORAGE_KEY);
}

function isLocalTunnelApiUrl(apiUrl: string) {
  try {
    const hostname = new URL(apiUrl).hostname.toLowerCase();
    return hostname.endsWith(".loca.lt") || hostname.endsWith(".localtunnel.me");
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
  if (isLocalTunnelApiUrl(apiUrl)) {
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

  const response = await fetch(`${apiUrl}${endpoint}`, {
    ...options,
    body,
    headers,
    credentials: "include"
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, payload?.detail ?? response.statusText);
  }

  return payload as T;
}

export const API_URL = getApiUrl();
