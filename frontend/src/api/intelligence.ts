import type { ApiRequestOptions } from "./client";
import { getApiUrl, getClusterPath } from "./client";

export type IntelligenceGrant = "read" | "process" | "external_transfer" | "export";
export type IntelligenceGrants = Record<IntelligenceGrant, boolean>;
export type IntelligenceBrowserFlow = "oidc" | "source_v2";

export interface IntelligenceConsentParameters {
  response_type: "code";
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: "S256";
  nonce?: string;
}

export interface IntelligenceConsentOffer {
  client_id: string;
  redirect_uri: string;
  state: string;
  chats: Array<{ id: string; title: string; type: string }>;
  grants: IntelligenceGrants;
}

export interface IntelligenceConnection {
  id: string;
  chat_id: string;
  chat_title: string;
  grants: IntelligenceGrants;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface IntelligenceConnectionsResponse {
  connections: IntelligenceConnection[];
}

export type IntelligenceAuthRequest = <T>(endpoint: string, options?: ApiRequestOptions) => Promise<T>;

export function intelligenceBrowserSessionEndpoint() {
  return "/api/v2/intelligence/authorize-session";
}

export function intelligenceSourceAuthorizeEndpoint() {
  return getClusterPath("/api/v2/intelligence/authorize");
}

export function intelligenceSourceOfferEndpoint(parameters: IntelligenceConsentParameters) {
  const query = new URLSearchParams({
    client_id: parameters.client_id,
    redirect_uri: parameters.redirect_uri,
    state: parameters.state,
    code_challenge: parameters.code_challenge,
    code_challenge_method: parameters.code_challenge_method,
  });
  return `/api/v2/intelligence/authorize?${query.toString()}`;
}

export function intelligenceOIDCAuthorizeURL(parameters: IntelligenceConsentParameters): string {
  const url = new URL("/oauth2/authorize", getApiUrl());
  url.search = new URLSearchParams({
    response_type: parameters.response_type,
    client_id: parameters.client_id,
    redirect_uri: parameters.redirect_uri,
    state: parameters.state,
    nonce: parameters.nonce ?? "",
    code_challenge: parameters.code_challenge,
    code_challenge_method: parameters.code_challenge_method,
  }).toString();
  return url.toString();
}

export function intelligenceConsentQuery(parameters: IntelligenceConsentParameters) {
  const query = new URLSearchParams({
    flow: "source_v2",
    response_type: parameters.response_type,
    client_id: parameters.client_id,
    redirect_uri: parameters.redirect_uri,
    state: parameters.state,
    code_challenge: parameters.code_challenge,
    code_challenge_method: parameters.code_challenge_method,
  });
  return query.toString();
}

export async function loadIntelligenceConnections(authRequest: IntelligenceAuthRequest) {
  return authRequest<IntelligenceConnectionsResponse>("/api/v2/intelligence/connections", { method: "GET" });
}

export async function revokeIntelligenceConnection(
  authRequest: IntelligenceAuthRequest,
  connectionID: string,
  grant: IntelligenceGrant | "connection",
) {
  return authRequest<{ revoked: boolean }>("/api/v2/intelligence/revoke", {
    method: "POST",
    body: { connection_id: connectionID, grant },
  });
}
