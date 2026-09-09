import { apiRequest } from "./client";

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
        "Open ChatGPT / Codex → Settings → Connectors / MCP",
        "Add a custom HTTP MCP server",
        "Paste the MCP URL and Authorization Bearer token",
        "Save and connect. The agent will verify available tools and chats"
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

export function listMCPConnectors(accessToken: string) {
  return apiRequest<MCPConnector[]>("/api/admin/mcp-connectors", { accessToken });
}

export function createMCPConnector(
  accessToken: string,
  body: {
    name: string;
    provider: MCPProviderId;
    alias?: string;
    authMode?: MCPAuthMode;
    allowedChatIds: string[];
    permissions: MCPPermissions;
    maxHistoryMessages: number;
  }
) {
  return apiRequest<MCPConnectorCreateResponse>("/api/admin/mcp-connectors", {
    accessToken,
    method: "POST",
    body: {
      ...body,
      alias: body.alias || defaultMCPAlias(body.provider),
      authMode: body.authMode || "subscription"
    }
  });
}

export function updateMCPConnector(
  accessToken: string,
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
  return apiRequest<MCPConnector>(`/api/admin/mcp-connectors/${connectorId}`, {
    accessToken,
    method: "PATCH",
    body
  });
}

export function regenerateMCPConnectorToken(accessToken: string, connectorId: string) {
  return apiRequest<MCPConnectorTokenResponse>(`/api/admin/mcp-connectors/${connectorId}/regenerate-token`, {
    accessToken,
    method: "POST"
  });
}

export function revokeMCPConnector(accessToken: string, connectorId: string) {
  return apiRequest<MCPConnector>(`/api/admin/mcp-connectors/${connectorId}/revoke`, {
    accessToken,
    method: "POST"
  });
}

export function listMCPConnectorAudit(accessToken: string, connectorId: string) {
  return apiRequest<MCPAuditEvent[]>(`/api/admin/mcp-connectors/${connectorId}/audit`, { accessToken });
}
