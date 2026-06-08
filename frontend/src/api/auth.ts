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

export function refreshSession() {
  const storedToken = getStoredRefreshToken();
  return apiRequest<AuthResponse>("/api/auth/refresh", {
    method: "POST",
    headers: storedToken ? { "X-Refresh-Token": storedToken } : undefined
  });
}

export function logout() {
  const storedToken = getStoredRefreshToken();
  return apiRequest<{ status: string }>("/api/auth/logout", {
    method: "POST",
    headers: storedToken ? { "X-Refresh-Token": storedToken } : undefined
  });
}
