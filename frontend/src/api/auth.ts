import { ApiError, apiRequest, getStoredRefreshToken } from "./client";
import { FamilyFile } from "./files";

export type UserRole = string;

export interface User {
  id: string;
  familyId: string;
  username: string;
  displayName: string;
  role: UserRole;
	roleId?: string;
	roleName?: string;
	permissions?: string[];
  isActive: boolean;
  publicKey: string | null;
  profilePhoto: FamilyFile | null;
  createdAt?: string;
  lastSeenAt?: string | null;
  profileVisibility: "family" | "nobody";
  lastSeenVisibility: "family" | "nobody";
  readReceiptsEnabled: boolean;
  directMessagePermission?: "family" | "selected" | "nobody";
  groupInvitePermission?: "allow" | "selected" | "request" | "nobody";
  channelInvitePermission?: "allow" | "selected" | "request" | "nobody";
  voiceInvitePermission?: "allow" | "selected" | "request" | "nobody";
  invitePermissionUserIds?: string[];
  email?: string | null;
  bio?: string | null;
  timezone?: string | null;
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
  familyName?: string | null;
  navTabs?: {
    chats?: boolean;
    storage?: boolean;
    plans?: boolean;
    settings?: boolean;
  };
}

export interface SetupPayload {
  familyName?: string;
  nickname: string;
  password: string;
  inviteToken?: string;
}

export interface LoginPayload {
	username: string;
	password: string;
}

export interface ChangePasswordPayload {
	currentPassword: string;
	newPassword: string;
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

export function requestDeviceLoginCode(username: string) {
  return apiRequest<{ status: string }>("/api/auth/device-login/request", { method: "POST", body: { username } });
}

export function verifyDeviceLoginCode(username: string, code: string) {
  return apiRequest<AuthResponse>("/api/auth/device-login/verify", { method: "POST", body: { username, code } });
}

export function changePassword(accessToken: string, payload: ChangePasswordPayload) {
	const refreshToken = getStoredRefreshToken();
	return apiRequest<void>("/api/auth/change-password", {
		method: "POST",
		accessToken,
		headers: refreshToken ? { "X-Refresh-Token": refreshToken } : undefined,
		body: payload
	});
}

let refreshSessionInFlight: Promise<AuthResponse> | null = null;
const REFRESH_LOCK_KEY = "familyMessenger.refreshLock";

async function acquireRefreshLock(): Promise<void> {
  if (typeof window === "undefined") {
    return;
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
  const storedToken = getStoredRefreshToken();
  // Login and refresh responses persist the token for both web and native
  // clients. Without one, a refresh request is guaranteed to be rejected.
  if (!storedToken) {
    return Promise.reject(new ApiError(401, "Refresh token is missing"));
  }
  refreshSessionInFlight = (async () => {
    await acquireRefreshLock();
    try {
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
