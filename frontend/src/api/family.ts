import { User, UserRole } from "./auth";
import { apiRequest } from "./client";
import { normalizePasskeyOptions } from "./passkeyOptions";

export function inviteUrlForServer(inviteUrl: string, serverUrl: string): string {
  try {
    const invite = new URL(inviteUrl);
    const server = new URL(serverUrl);
    const token = invite.pathname.split("/").filter(Boolean).at(-1);
    if (!token) return inviteUrl;
    server.pathname = `${server.pathname.replace(/\/$/, "")}/invite/${encodeURIComponent(token)}`;
    server.search = "";
    server.hash = "";
    return server.toString();
  } catch {
    return inviteUrl;
  }
}

export interface Family {
  id: string;
  name: string;
  storageLimitMb?: number | null;
  minimizedChatLayout: boolean;
  defaultMessageEncryptionProtocol: "end_to_end" | "server_at_rest" | "legacy_plaintext";
  defaultProfileVisibility: "everyone" | "nobody";
  defaultLastSeenVisibility: "everyone" | "nobody";
  defaultReadReceiptsEnabled: boolean;
  defaultNotificationSettings: string;
  translationEnabled?: boolean;
  callRecordingEnabled?: boolean;
  aiNotesEnabled?: boolean;
  voiceTranscriptionEnabled?: boolean;
  screenShareBitrateKbps: number;
  cameraBitrateKbps?: number;
  groupCallScreenShareBitrateKbps?: number;
  groupCallCameraBitrateKbps?: number;
  dmCallScreenShareBitrateKbps?: number;
  dmCallCameraBitrateKbps?: number;
  navTabs?: {
    chats?: boolean;
    storage?: boolean;
    plans?: boolean;
    settings?: boolean;
  };
}

export interface InvitePreview {
  familyName: string;
  role: UserRole;
  expiresAt: string;
  usesRemaining: number;
}

export interface ServerRole {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  isDefault: boolean;
  memberCount: number;
}

export interface MemberAdminDetails {
  id: string;
  isActive: boolean;
  isOnline: boolean;
  joinedAt: string | null;
  lastSeenAt: string | null;
  candidateIp: string | null;
  candidateIpBanned: boolean;
  bannedIp: string | null;
}

export interface InviteResponse {
  inviteUrl: string;
  invite: {
    id: string;
    familyId: string;
    role: UserRole;
    expiresAt: string;
    maxUses: number;
    usedCount: number;
    createdBy: string;
    createdAt: string;
    revokedAt?: string | null;
  };
}

export interface AcceptInvitePayload {
  nickname: string;
  password: string;
}

export interface InvitePasskeyOptions {
  ceremonyId: string;
  publicKey: Record<string, unknown>;
}

export function beginInvitePasskeyRegistration(token: string, nickname: string) {
  return apiRequest<InvitePasskeyOptions>(`/api/invites/${encodeURIComponent(token)}/passkey/options`, {
    method: "POST",
    body: { nickname },
  }).then(normalizePasskeyOptions);
}

export function acceptInviteWithPasskey(token: string, payload: { nickname: string; ceremonyId: string; response: object }) {
  return apiRequest<import("./auth").AuthResponse>(`/api/invites/${encodeURIComponent(token)}/accept-passkey`, {
    method: "POST",
    body: payload,
  });
}

export function getFamily(accessToken: string) {
  return apiRequest<Family>("/api/family", { accessToken });
}

export function updateFamily(accessToken: string, payload: { name?: string; storageLimitMb?: number; minimizedChatLayout?: boolean; defaultProfileVisibility?: "everyone" | "nobody"; defaultLastSeenVisibility?: "everyone" | "nobody"; defaultReadReceiptsEnabled?: boolean; defaultNotificationSettings?: string; screenShareBitrateKbps?: number; cameraBitrateKbps?: number; groupCallScreenShareBitrateKbps?: number; groupCallCameraBitrateKbps?: number; dmCallScreenShareBitrateKbps?: number; dmCallCameraBitrateKbps?: number }) {
  return apiRequest<Family>("/api/family", {
    method: "PATCH",
    accessToken,
    body: payload
  });
}

export function getMembers(accessToken: string) {
  return apiRequest<User[]>("/api/family/members", { accessToken });
}

export function getServerRoles(accessToken: string) {
  return apiRequest<ServerRole[]>("/api/family/roles", { accessToken });
}

export function createServerRole(accessToken: string, payload: Pick<ServerRole, "name" | "description" | "permissions">) {
  return apiRequest<ServerRole>("/api/family/roles", { method: "POST", accessToken, body: payload });
}

export function updateServerRole(accessToken: string, roleId: string, payload: Partial<Pick<ServerRole, "name" | "description" | "permissions">>) {
  return apiRequest<ServerRole>(`/api/family/roles/${encodeURIComponent(roleId)}`, { method: "PATCH", accessToken, body: payload });
}

export function deleteServerRole(accessToken: string, roleId: string, replacementRoleId: string) {
  return apiRequest<void>(`/api/family/roles/${encodeURIComponent(roleId)}`, { method: "DELETE", accessToken, body: { replacementRoleId } });
}

export function changeMemberRole(accessToken: string, userId: string, role: UserRole) {
  return apiRequest<User>(`/api/family/members/${userId}/role`, {
    method: "PATCH",
    accessToken,
    body: { role }
  });
}

export function removeMember(accessToken: string, userId: string) {
  return apiRequest<void>(`/api/family/members/${userId}`, {
    method: "DELETE",
    accessToken
  });
}

export function getMemberAdminDetails(accessToken: string, userId: string) {
  return apiRequest<MemberAdminDetails>(`/api/family/members/${encodeURIComponent(userId)}/admin-details`, { accessToken });
}

export function banMemberIP(accessToken: string, userId: string, ip: string) {
  return apiRequest<void>(`/api/family/members/${encodeURIComponent(userId)}/ip-ban`, { method: "PUT", accessToken, body: { ip } });
}

export function unbanMemberIP(accessToken: string, userId: string) {
  return apiRequest<void>(`/api/family/members/${encodeURIComponent(userId)}/ip-ban`, { method: "DELETE", accessToken });
}

export function createInvite(
  accessToken: string,
  payload: { role: UserRole; expiresInHours: number; maxUses: number }
) {
  return apiRequest<InviteResponse>("/api/invites", {
    method: "POST",
    accessToken,
    body: payload
  });
}

export function previewInvite(token: string) {
  return apiRequest<InvitePreview>(`/api/invites/${token}`);
}

export function acceptInvite(token: string, payload: AcceptInvitePayload) {
  return apiRequest<import("./auth").AuthResponse>(`/api/invites/${token}/accept`, {
    method: "POST",
    body: payload
  });
}
