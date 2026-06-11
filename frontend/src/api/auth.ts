import { apiRequest, getStoredRefreshToken } from "./client";
import { FamilyFile } from "./files";

export type UserRole = "owner" | "admin" | "member" | "child";

export interface User {
  id: string;
  familyId: string;
  email: string;
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  publicKey: string | null;
  profilePhoto: FamilyFile | null;
  createdAt?: string;
  lastSeenAt?: string | null;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
  user: User;
  refreshToken?: string; // returned in body for cross-origin (Capacitor) clients
}

export interface SetupStatus {
  setupRequired: boolean;
  setupComplete: boolean;
}

export interface SetupPayload {
  familyName?: string;
  nickname: string;
  password: string;
}

export interface LoginPayload {
  login: string;
  password: string;
}

export function fetchSetupStatus() {
  return apiRequest<SetupStatus>("/api/auth/setup-status");
}

export function setupOwner(payload: SetupPayload) {
  return apiRequest<AuthResponse>("/api/auth/setup", {
    method: "POST",
    body: payload
  });
}

export function login(payload: LoginPayload) {
  return apiRequest<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: payload
  });
}

let refreshSessionInFlight: Promise<AuthResponse> | null = null;
const REFRESH_LOCK_KEY = "familyMessenger.refreshLock";
const REFRESH_LOCK_MAX_WAIT_MS = 15_000;

async function acquireRefreshLock(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }
  const started = Date.now();
  while (window.localStorage.getItem(REFRESH_LOCK_KEY)) {
    if (Date.now() - started > REFRESH_LOCK_MAX_WAIT_MS) {
      break;
    }
    if (refreshSessionInFlight) {
      await refreshSessionInFlight.catch(() => undefined);
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  window.localStorage.setItem(REFRESH_LOCK_KEY, String(Date.now()));
}

function releaseRefreshLock(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(REFRESH_LOCK_KEY);
  }
}

export function refreshSession() {
  if (refreshSessionInFlight) {
    return refreshSessionInFlight;
  }
  refreshSessionInFlight = (async () => {
    await acquireRefreshLock();
    try {
      const storedToken = getStoredRefreshToken();
      return await apiRequest<AuthResponse>("/api/auth/refresh", {
        method: "POST",
        headers: storedToken ? { "X-Refresh-Token": storedToken } : undefined
      });
    } finally {
      releaseRefreshLock();
      refreshSessionInFlight = null;
    }
  })();
  return refreshSessionInFlight;
}

export function logout() {
  const storedToken = getStoredRefreshToken();
  return apiRequest<{ status: string }>("/api/auth/logout", {
    method: "POST",
    headers: storedToken ? { "X-Refresh-Token": storedToken } : undefined
  });
}
