import { Capacitor } from "@capacitor/core";

import { ApiError, apiRequest, getApiUrl, getStoredRefreshToken } from "./client";
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

export type PasskeyAuthenticationResponse = object;

export interface PasskeyAuthenticationCeremony {
  ceremonyId: string;
  publicKey: Record<string, unknown>;
}

export interface BrowserQRLoginRequest {
  requestId: string;
  scanUrl: string;
  expiresAt: string;
}

export interface BrowserQRLoginStatus {
  status?: "pending" | "approved" | "rejected" | "expired" | "completed";
  auth?: AuthResponse;
  accessToken?: string;
  tokenType?: "Bearer";
  expiresInSeconds?: number;
  user?: User;
}

export function respondToBrowserQRLogin(requestId: string, decision: "approve" | "reject", accessToken: string) {
  return apiRequest<{ status: string }>(`/api/auth/qr-login/${encodeURIComponent(requestId)}/${decision}`, {
    method: "POST",
    accessToken,
  });
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

export function beginPasskeyAuthentication() {
  return apiRequest<PasskeyAuthenticationCeremony>("/api/auth/passkeys/authentication/options", {
    method: "POST",
    body: {},
  });
}

export function finishPasskeyAuthentication(ceremonyId: string, response: PasskeyAuthenticationResponse) {
  return apiRequest<AuthResponse>("/api/auth/passkeys/authentication/verify", {
    method: "POST",
    body: { ceremonyId, response },
  });
}

export function beginPasskeyRegistration(accessToken: string) {
  return apiRequest<PasskeyAuthenticationCeremony>("/api/auth/passkeys/registration/options", { method: "POST", accessToken });
}

export function finishPasskeyRegistration(accessToken: string, ceremonyId: string, response: object) {
  return apiRequest<{ status: "registered" }>("/api/auth/passkeys/registration/verify", {
    method: "POST", accessToken, body: { ceremonyId, response },
  });
}

export function createBrowserQRLogin() {
  return apiRequest<BrowserQRLoginRequest>("/api/auth/qr-login", {
    method: "POST",
    body: {},
  });
}

export function getBrowserQRLoginStatus(requestId: string) {
  return apiRequest<BrowserQRLoginStatus>(`/api/auth/qr-login/${encodeURIComponent(requestId)}`);
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

const refreshSessionInFlight = new Map<string, Promise<AuthResponse>>();

export function refreshSession() {
  const serverUrl = getApiUrl();
  const inFlight = refreshSessionInFlight.get(serverUrl);
  if (inFlight) {
    return inFlight;
  }
  const storedToken = getStoredRefreshToken();
  // Browsers authenticate this request with the HttpOnly refresh cookie.
  // Native clients retain their own token until secure native storage replaces
  // the legacy localStorage implementation.
  if (Capacitor.isNativePlatform() && !storedToken) {
    return Promise.reject(new ApiError(401, "Refresh token is missing"));
  }
  let request!: Promise<AuthResponse>;
  request = (async () => {
    const executeRefresh = () => apiRequest<AuthResponse>("/api/auth/refresh", {
      method: "POST",
      headers: storedToken ? { "X-Refresh-Token": storedToken } : undefined
    });
    try {
      // A refresh rotates the HttpOnly cookie. Web Locks prevents another tab
      // from submitting the same cookie before the first response installs
      // its replacement.
      const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
      return locks?.request
        ? await locks.request(`stovo:refresh:${serverUrl}`, { mode: "exclusive" }, executeRefresh)
        : await executeRefresh();
    } finally {
      if (refreshSessionInFlight.get(serverUrl) === request) refreshSessionInFlight.delete(serverUrl);
    }
  })();
  refreshSessionInFlight.set(serverUrl, request);
  return request;
}

export function logout() {
  const storedToken = getStoredRefreshToken();
  return apiRequest<{ status: string }>("/api/auth/logout", {
    method: "POST",
    headers: storedToken ? { "X-Refresh-Token": storedToken } : undefined
  });
}
