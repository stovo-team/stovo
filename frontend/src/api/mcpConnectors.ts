import { apiRequest, ApiError, type ApiRequestOptions } from "./client";
import { refreshSession } from "./auth";

export const MCP_PERMISSION_KEYS = [
  "chats.list",
  "messages.read",
  "messages.search",
  "messages.send",
  "messages.edit",
  "messages.delete",
  "messages.react",
  "messages.forward",
  "messages.pin",
  "messages.unpin",
  "files.list",
  "files.download"
] as const;

export type MCPPermissionKey = (typeof MCP_PERMISSION_KEYS)[number];

export type MCPPermissions = Record<MCPPermissionKey, boolean>;

export const MCP_PROVIDERS = [
  {
    id: "claude_code",
    label: "Claude Code",
    shortLabel: "Claude Code",
    description: "Anthropic app"
  },
  {
    id: "codex",
    label: "ChatGPT (Codex)",
    shortLabel: "Codex",
    description: "OpenAI desktop"
  },
  {
    id: "openclaw",
    label: "OpenClaw",
    shortLabel: "OpenClaw",
    description: "Open agent"
  },
  {
    id: "hermes",
    label: "Hermes",
    shortLabel: "Hermes",
    description: "Hermes client"
  }
] as const;

export type MCPProviderId = (typeof MCP_PROVIDERS)[number]["id"];

export type MCPAuthMode = "subscription" | "api";

export const MCP_AUTH_MODES: Array<{ id: MCPAuthMode; label: string; description: string }> = [
  {
    id: "subscription",
    label: "Subscription",
    description: "Uses the signed-in Claude / ChatGPT app subscription"
  },
  {
    id: "api",
    label: "API key",
    description: "Client app uses a provider API key"
  }
];

export interface MCPConnector {
  id: string;
  name: string;
  actorUserId: string;
  enabled: boolean;
  revoked: boolean;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  maxHistoryMessages: number;
  permissions: MCPPermissions;
  provider: MCPProviderId | string;
  alias: string;
  authMode: MCPAuthMode | string;
  allowedChatIds: string[];
}

export interface MCPConnectorCreateResponse {
  connector: MCPConnector;
  token: string;
  mcpUrl: string;
  claudeCommand: string;
  setupPrompt: string;
  cliCommand: string;
}

export interface MCPConnectorTokenResponse {
  connector: MCPConnector;
  token: string;
  mcpUrl: string;
  claudeCommand: string;
  setupPrompt: string;
  cliCommand: string;
}

export interface MCPAuditEvent {
  id: string;
  connectorId: string;
  actorUserId: string;
  action: string;
  chatId: string | null;
  messageId: string | null;
  success: boolean;
  error: string | null;
  meta?: unknown;
  createdAt: string;
}

export function defaultMCPPermissions(): MCPPermissions {
  return Object.fromEntries(MCP_PERMISSION_KEYS.map((key) => [key, false])) as MCPPermissions;
}

export function mcpProviderLabel(provider: string | undefined | null) {
  const match = MCP_PROVIDERS.find((item) => item.id === provider);
  return match?.label ?? "Claude Code";
}

export function defaultMCPAlias(provider: MCPProviderId | string) {
  switch (provider) {
    case "codex":
      return "codex";
    case "openclaw":
      return "openclaw";
    case "hermes":
      return "hermes";
    default:
      return "claude";
  }
}

export function formatMCPAlias(alias: string | undefined | null) {
  const value = (alias ?? "").trim().replace(/^@+/, "");
  return value ? `@${value}` : "";
}

export function mcpAuthModeLabel(mode: string | undefined | null) {
  return mode === "api" ? "API key" : "Subscription";
}

export function mcpUiSetupSteps(provider: string | undefined | null): string[] {
  switch (provider) {
    case "codex":
      return [
        "In Codex, add an MCP server named stovo-messenger",
        "Choose Streamable HTTP and enter the MCP URL",
        "Set Authorization: Bearer <token> as an HTTP header (do not add env)",
        "Save, restart/reload if prompted, then use the setup prompt above to test the connection"
      ];
    case "openclaw":
      return [
        "Open OpenClaw → Connectors / MCP",
        "Add a custom HTTP MCP server",
        "Paste the MCP URL and Authorization Bearer token",
        "Save and connect to establish the connection session"
      ];
    case "hermes":
      return [
        "Open Hermes → Connectors / MCP",
        "Add a custom HTTP server",
        "Paste the MCP URL and Authorization Bearer token",
        "Save and turn it on to establish the connection"
      ];
    default:
      return [
        "Open Claude Code → Settings → MCP",
        "Add a custom HTTP MCP connector",
        "Paste the MCP URL and Authorization Bearer token",
        "Save and connect. The agent will verify the connection session"
      ];
  }
}

export type MCPApiCaller = string | (<T>(endpoint: string, options?: ApiRequestOptions) => Promise<T>);

async function requestWithTokenOrCaller<T>(
  caller: MCPApiCaller,
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  if (typeof caller === "function") {
    return caller<T>(endpoint, options);
  }
  try {
    return await apiRequest<T>(endpoint, {
      ...options,
      accessToken: caller
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      try {
        const refreshed = await refreshSession();
        return await apiRequest<T>(endpoint, {
          ...options,
          accessToken: refreshed.accessToken
        });
      } catch {
        throw err;
      }
    }
    throw err;
  }
}

export function listMCPConnectors(caller: MCPApiCaller) {
  return requestWithTokenOrCaller<MCPConnector[]>(caller, "/api/admin/mcp-connectors");
}

export function createMCPConnector(
  caller: MCPApiCaller,
  body: {
    name: string;
    provider?: MCPProviderId | string;
    alias?: string;
    authMode?: MCPAuthMode;
    allowedChatIds: string[];
    permissions: MCPPermissions;
    maxHistoryMessages: number;
  }
) {
  const provider = (body.provider || "claude_code") as MCPProviderId;
  return requestWithTokenOrCaller<MCPConnectorCreateResponse>(caller, "/api/admin/mcp-connectors", {
    method: "POST",
    body: {
      ...body,
      provider,
      alias: body.alias || defaultMCPAlias(provider),
      authMode: body.authMode || "subscription"
    }
  });
}

export function updateMCPConnector(
  caller: MCPApiCaller,
  connectorId: string,
  body: {
    name?: string;
    alias?: string;
    authMode?: MCPAuthMode;
    allowedChatIds?: string[];
    permissions?: MCPPermissions;
    maxHistoryMessages?: number;
    enabled?: boolean;
  }
) {
  return requestWithTokenOrCaller<MCPConnector>(caller, `/api/admin/mcp-connectors/${connectorId}`, {
    method: "PATCH",
    body
  });
}

export function regenerateMCPConnectorToken(caller: MCPApiCaller, connectorId: string) {
  return requestWithTokenOrCaller<MCPConnectorTokenResponse>(caller, `/api/admin/mcp-connectors/${connectorId}/regenerate-token`, {
    method: "POST"
  });
}

export function revokeMCPConnector(caller: MCPApiCaller, connectorId: string) {
  return requestWithTokenOrCaller<MCPConnector>(caller, `/api/admin/mcp-connectors/${connectorId}/revoke`, {
    method: "POST"
  });
}

export function listMCPConnectorAudit(caller: MCPApiCaller, connectorId: string) {
  return requestWithTokenOrCaller<MCPAuditEvent[]>(caller, `/api/admin/mcp-connectors/${connectorId}/audit`);
}
