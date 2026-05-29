import { apiRequest } from "./client";

export type LogLevel = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  levelNo: number;
  logger: string;
  message: string;
  module: string;
  functionName: string;
  lineNo: number;
  exception: string | null;
}

export interface LogsResponse {
  records: LogEntry[];
  total: number;
  bufferSize: number;
  limit: number;
}

export interface LogQuery {
  level?: LogLevel | "";
  logger?: string;
  search?: string;
  limit?: number;
}

export interface PublicAccessSettings {
  appUrl: string;
  apiUrl: string;
  configuredAppUrl: string | null;
  configuredApiUrl: string | null;
  environmentAppUrl: string;
  environmentApiUrl: string;
  inviteUrlIncludesApiUrl: boolean;
}

export interface MediaQualityRule {
  mediaType: "image" | "video" | "audio";
  extension: string;
  qualityPercent: number;
}

export interface MediaQualitySettings {
  rules: MediaQualityRule[];
}

export interface PublicAccessCandidate {
  label: string;
  appUrl: string;
  apiUrl: string;
}

export interface PublicAccessSuggestions {
  candidates: PublicAccessCandidate[];
}

export interface PublicAccessCheckTarget {
  name: string;
  url: string;
  ok: boolean;
  statusCode: number | null;
  detail: string;
}

export interface PublicAccessCheckResponse {
  allOk: boolean;
  targets: PublicAccessCheckTarget[];
}

export interface PublicTunnelStatus {
  state: "stopped" | "starting" | "running" | "error";
  provider: "cloudflare" | "localtunnel" | null;
  url: string | null;
  origin: string | null;
  message: string | null;
  logs: string[];
  autoRestart: boolean;
  restarts: number;
  lastRestartReason: string | null;
  healthStatus: "unknown" | "checking" | "healthy" | "degraded";
  lastHealthCheckAt: string | null;
  lastHealthError: string | null;
  healthFailureStreak: number;
  healthFailureThreshold: number;
  publicAccess: PublicAccessSettings | null;
}








export interface PublicInviteLink {
  id: string;
  role: string;
  url: string;
  expiresAt: string;
  maxUses: number;
  usedCount: number;
}

export interface QuickStartPublicAccessResponse {
  status: "stopped" | "starting" | "running" | "error";
  provider: "cloudflare" | "localtunnel";
  publicUrl: string;
  origin: string | null;
  message: string | null;
  publicAccess: PublicAccessSettings;
  inviteLinks: PublicInviteLink[];
}

export interface PublicIPQuickStartResponse {
  status: "ready" | "blocked";
  publicIp: string;
  publicUrl: string;
  publicAccess: PublicAccessSettings | null;
  inviteLinks: PublicInviteLink[];
  problems: string[];
  recommendedActions: string[];
  canUseCloudflareTunnel: boolean;
}

export interface DomainDnsRecord {
  type: string;
  name: string;
  value: string;
  proxied: boolean;
}

export interface DomainLinkResponse {
  publicIp: string;
  appUrl: string;
  apiUrl: string;
  records: DomainDnsRecord[];
  publicAccess: PublicAccessSettings | null;
}

export type AdminMessageEncryptionProtocol = "end_to_end" | "server_at_rest";

export interface EncryptionProtocolOption {
  value: AdminMessageEncryptionProtocol;
  label: string;
  description: string;
}

export interface EncryptionSettings {
  defaultMessageEncryptionProtocol: AdminMessageEncryptionProtocol;
  supportedProtocols: EncryptionProtocolOption[];
  compatibilityNotes: string[];
}

export function getAdminLogs(accessToken: string, query: LogQuery = {}) {
  const params = new URLSearchParams();
  if (query.level) {
    params.set("level", query.level);
  }
  if (query.logger?.trim()) {
    params.set("logger", query.logger.trim());
  }
  if (query.search?.trim()) {
    params.set("search", query.search.trim());
  }
  params.set("limit", String(query.limit ?? 200));

  return apiRequest<LogsResponse>(`/api/admin/logs?${params.toString()}`, {
    accessToken
  });
}

export function getPublicAccessSettings(accessToken: string) {
  return apiRequest<PublicAccessSettings>("/api/admin/public-access", {
    accessToken
  });
}

export function updatePublicAccessSettings(
  accessToken: string,
  payload: { appUrl: string | null; apiUrl: string | null }
) {
  return apiRequest<PublicAccessSettings>("/api/admin/public-access", {
    method: "PUT",
    accessToken,
    body: payload
  });
}

export function getPublicAccessSuggestions(accessToken: string) {
  return apiRequest<PublicAccessSuggestions>("/api/admin/public-access/suggestions", {
    accessToken
  });
}

export function checkPublicAccess(accessToken: string) {
  return apiRequest<PublicAccessCheckResponse>("/api/admin/public-access/check", {
    accessToken
  });
}

export function getPublicTunnelStatus(accessToken: string) {
  return apiRequest<PublicTunnelStatus>("/api/admin/public-access/tunnel", {
    accessToken
  });
}

export function startPublicTunnel(accessToken: string, provider: "cloudflare" | "localtunnel" = "cloudflare") {
  return apiRequest<PublicTunnelStatus>(`/api/admin/public-access/tunnel/start?provider=${provider}`, {
    method: "POST",
    accessToken
  });
}


export function quickStartPublicAccess(accessToken: string) {
  return apiRequest<QuickStartPublicAccessResponse>("/api/admin/public-access/quick-start", {
    method: "POST",
    accessToken
  });
}

export function stopPublicTunnel(accessToken: string) {
  return apiRequest<PublicTunnelStatus>("/api/admin/public-access/tunnel/stop", {
    method: "POST",
    accessToken
  });
}

export function linkDomainToPublicIp(
  accessToken: string,
  payload: { domain: string; apiDomain?: string | null }
) {
  return apiRequest<DomainLinkResponse>("/api/admin/public-access/domain-link", {
    method: "POST",
    accessToken,
    body: payload
  });
}

export function getEncryptionSettings(accessToken: string) {
  return apiRequest<EncryptionSettings>("/api/admin/encryption-settings", {
    accessToken
  });
}

export function updateEncryptionSettings(
  accessToken: string,
  payload: { defaultMessageEncryptionProtocol: AdminMessageEncryptionProtocol }
) {
  return apiRequest<EncryptionSettings>("/api/admin/encryption-settings", {
    method: "PUT",
    accessToken,
    body: payload
  });
}
