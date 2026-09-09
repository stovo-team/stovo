import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, ApiRequestOptions } from "../api/client";
import { Chat } from "../api/chats";
import {
  MCP_PERMISSION_KEYS,
  MCP_PROVIDERS,
  MCPConnector,
  MCPPermissionKey,
  MCPPermissions,
  MCPProviderId,
  createMCPConnector,
  defaultMCPAlias,
  defaultMCPPermissions,
  listMCPConnectors,
  mcpProviderLabel,
  mcpUiSetupSteps,
  regenerateMCPConnectorToken,
  revokeMCPConnector,
  updateMCPConnector
} from "../api/mcpConnectors";

type SecretReveal = {
  token: string;
  mcpUrl: string;
  setupPrompt: string;
  cliCommand: string;
  connectorName: string;
  connectorId: string;
  provider: string;
};

const PERMISSION_LABELS: Record<MCPPermissionKey, string> = {
  "chats.list": "List chats",
  "messages.read": "Read history",
  "messages.search": "Search messages",
  "messages.send": "Send messages",
  "messages.edit": "Edit own",
  "messages.delete": "Delete own",
  "messages.react": "React",
  "messages.forward": "Forward",
  "messages.pin": "Pin",
  "messages.unpin": "Unpin",
  "files.list": "List files",
  "files.download": "Download files"
};

const PERMISSION_GROUPS: Array<{ id: string; label: string; keys: MCPPermissionKey[] }> = [
  {
    id: "chats",
    label: "Chats",
    keys: ["chats.list"]
  },
  {
    id: "messages",
    label: "Messages",
    keys: ["messages.read", "messages.search", "messages.send"]
  },
  {
    id: "actions",
    label: "Message actions",
    keys: ["messages.edit", "messages.delete", "messages.react", "messages.forward"]
  },
  {
    id: "pins",
    label: "Pins",
    keys: ["messages.pin", "messages.unpin"]
  },
  {
    id: "files",
    label: "Files",
    keys: ["files.list", "files.download"]
  }
];

const CHAT_TYPE_GROUPS: Array<{
  id: Chat["type"];
  label: string;
}> = [
  { id: "family", label: "Family" },
  { id: "group", label: "Groups" },
  { id: "channel", label: "Channels" },
  { id: "direct", label: "Direct messages" }
];

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  }
}

function chatLabel(chat: Chat) {
  if (chat.title) return chat.title;
  if (chat.type === "direct") {
    const other = chat.members.find((member) => member.displayName);
    return other?.displayName ?? "Direct chat";
  }
  return `${chat.type} chat`;
}

function ChatTypeIcon({ type }: { type: Chat["type"] }) {
  if (type === "direct") {
    return (
      <svg className="mcp-chat-type-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Zm0 2c-3.6 0-8 1.8-8 4.2V20h16v-1.8c0-2.4-4.4-4.2-8-4.2Z"
        />
      </svg>
    );
  }
  if (type === "channel") {
    return (
      <svg className="mcp-chat-type-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path
          fill="currentColor"
          d="M10.2 4 9.4 8H5.8l-.4 2h3.5l-.8 4H4.5l-.4 2h3.5L7 20h2l.6-4h4l-.6 4h2l.6-4h3.6l.4-2h-3.5l.8-4h3.6l.4-2h-3.5L16 4h-2l-.6 4h-4L10.2 4Zm.8 6h4l-.8 4h-4l.8-4Z"
        />
      </svg>
    );
  }
  if (type === "group") {
    return (
      <svg className="mcp-chat-type-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8.5 13a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 8.5 13Zm7 0a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 15.5 13ZM8.5 14.5c-2.9 0-6.5 1.4-6.5 3.3V20h7.4v-1.8c0-.8.3-1.6.8-2.2a8.8 8.8 0 0 0-1.7-.5Zm7 0c-.6 0-1.2.1-1.7.3a3.6 3.6 0 0 1 .7 2.1V20H22v-2.2c0-1.9-3.6-3.3-6.5-3.3Z"
        />
      </svg>
    );
  }
  return (
    <svg className="mcp-chat-type-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3 4 7.5V12c0 4.6 3.2 8.9 8 10 4.8-1.1 8-5.4 8-10V7.5L12 3Zm0 2.2 6 3.4V12c0 3.6-2.4 7-6 8-3.6-1-6-4.4-6-8V8.6l6-3.4Z"
      />
    </svg>
  );
}

function providerPlaceholder(provider: MCPProviderId) {
  switch (provider) {
    case "codex":
      return "Family Codex";
    case "openclaw":
      return "Family OpenClaw";
    case "hermes":
      return "Family Hermes";
    default:
      return "Family Claude Code";
  }
}

export default function MCPConnectorsPanel({
  accessToken,
  authRequest,
  onError,
  onNotice
}: {
  accessToken: string;
  authRequest: <T>(endpoint: string, options?: ApiRequestOptions) => Promise<T>;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
}) {
  const [connectors, setConnectors] = useState<MCPConnector[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [provider, setProvider] = useState<MCPProviderId>("claude_code");
  const [name, setName] = useState("");
  const [maxHistory, setMaxHistory] = useState(50);
  const [permissions, setPermissions] = useState<MCPPermissions>(defaultMCPPermissions());
  const [allowedChatIds, setAllowedChatIds] = useState<string[]>([]);
  const [secret, setSecret] = useState<SecretReveal | null>(null);
  const [copied, setCopied] = useState<"token" | "prompt" | "cli" | null>(null);
  const [showCli, setShowCli] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    onError(null);
    try {
      const connectorResult = await listMCPConnectors(accessToken);
      setConnectors(connectorResult);
    } catch {
      setConnectors([]);
    }

    try {
      const chatResult = await authRequest<Chat[]>("/api/chats");
      setChats(chatResult);
    } catch {
      setChats([]);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authRequest, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeSecretConnector = secret ? connectors.find((c) => c.id === secret.connectorId) : null;
  const isSecretConnected = Boolean(activeSecretConnector?.lastUsedAt);

  useEffect(() => {
    if (!secret || isSecretConnected) return;
    const interval = window.setInterval(async () => {
      try {
        const fresh = await listMCPConnectors(accessToken);
        setConnectors(fresh);
      } catch {
        // silent polling
      }
    }, 3000);
    return () => window.clearInterval(interval);
  }, [accessToken, secret, isSecretConnected]);

  function togglePermission(key: (typeof MCP_PERMISSION_KEYS)[number]) {
    setPermissions((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleChat(chatId: string) {
    setAllowedChatIds((current) =>
      current.includes(chatId) ? current.filter((id) => id !== chatId) : [...current, chatId]
    );
  }

  const allChatsSelected = chats.length > 0 && chats.every((chat) => allowedChatIds.includes(chat.id));
  const allPermissionsSelected = MCP_PERMISSION_KEYS.every((key) => permissions[key]);

  const chatGroups = useMemo(
    () =>
      CHAT_TYPE_GROUPS.map((group) => ({
        ...group,
        chats: chats.filter((chat) => chat.type === group.id)
      })).filter((group) => group.chats.length > 0),
    [chats]
  );

  function toggleAllChats() {
    setAllowedChatIds(allChatsSelected ? [] : chats.map((chat) => chat.id));
  }

  function toggleAllPermissions() {
    const next = !allPermissionsSelected;
    setPermissions(
      MCP_PERMISSION_KEYS.reduce((acc, key) => {
        acc[key] = next;
        return acc;
      }, {} as MCPPermissions)
    );
  }

  function togglePermissionGroup(keys: MCPPermissionKey[]) {
    const allSelected = keys.every((key) => permissions[key]);
    setPermissions((current) => {
      const next = { ...current };
      for (const key of keys) next[key] = !allSelected;
      return next;
    });
  }

  function toggleChatGroup(groupChats: Chat[]) {
    const ids = groupChats.map((chat) => chat.id);
    const allSelected = ids.every((id) => allowedChatIds.includes(id));
    setAllowedChatIds((current) => {
      if (allSelected) return current.filter((id) => !ids.includes(id));
      const merged = new Set([...current, ...ids]);
      return [...merged];
    });
  }

  function applySecret(result: {
    token: string;
    mcpUrl: string;
    setupPrompt?: string;
    cliCommand?: string;
    claudeCommand?: string;
    connector: MCPConnector;
  }) {
    setSecret({
      token: result.token,
      mcpUrl: result.mcpUrl,
      setupPrompt: result.setupPrompt || result.claudeCommand || "",
      cliCommand: result.cliCommand || result.claudeCommand || "",
      connectorName: result.connector.name,
      connectorId: result.connector.id,
      provider: result.connector.provider || provider
    });
    setShowCli(false);
    setCopied(null);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    onError(null);
    onNotice(null);
    try {
      const trimmedName = name.trim();
      const generatedAlias =
        trimmedName
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 28) || defaultMCPAlias(provider);

      const result = await createMCPConnector(accessToken, {
        name: trimmedName,
        provider,
        alias: generatedAlias,
        authMode: "subscription",
        allowedChatIds,
        permissions,
        maxHistoryMessages: maxHistory
      });
      setConnectors((current) => [result.connector, ...current.filter((item) => item.id !== result.connector.id)]);
      applySecret(result);
      setName("");
      setPermissions(defaultMCPPermissions());
      setAllowedChatIds([]);
      setMaxHistory(50);
      onNotice("Connection created. Copy the setup details below to connect your agent.");
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not create connection");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCopy(kind: "token" | "prompt" | "cli", value: string) {
    const ok = await copyText(value);
    if (!ok) {
      onError("Could not copy to clipboard");
      return;
    }
    setCopied(kind);
    window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1800);
  }

  async function handleToggleEnabled(connector: MCPConnector) {
    onError(null);
    try {
      const updated = await updateMCPConnector(accessToken, connector.id, { enabled: !connector.enabled });
      setConnectors((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      // Success notice removed per user request
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not update connection");
    }
  }

  async function handleRegenerate(connector: MCPConnector) {
    onError(null);
    onNotice(null);
    try {
      const result = await regenerateMCPConnectorToken(accessToken, connector.id);
      setConnectors((current) => current.map((item) => (item.id === result.connector.id ? result.connector : item)));
      applySecret(result);
      onNotice("Token regenerated. Copy the setup details now.");
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not regenerate token");
    }
  }

  async function handleRevoke(connector: MCPConnector) {
    if (!window.confirm(`Revoke “${connector.name}”? This cannot be undone.`)) return;
    onError(null);
    try {
      const updated = await revokeMCPConnector(accessToken, connector.id);
      setConnectors((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (secret?.connectorId === connector.id) setSecret(null);
      onNotice("Connection revoked");
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not revoke connection");
    }
  }

  const setupSteps = secret ? mcpUiSetupSteps(secret.provider) : mcpUiSetupSteps(provider);
  const providerMeta = MCP_PROVIDERS.find((item) => item.id === provider) ?? MCP_PROVIDERS[0];

  return (
    <section className="mcp-connectors-panel">
      <section className="mcp-connection-modes" aria-label="Agent connection modes">
        <article className="mcp-connection-mode is-active">
          <div>
            <span className="mcp-mode-kicker">Available now</span>
            <h3>Connect Stovo to agent</h3>
            <p>
              Create a connection session for Claude Code, Codex, OpenClaw, or Hermes. The agent connects to Stovo
              over MCP to read and act in allowed chats.
            </p>
          </div>
          <small>Connection session · MCP</small>
        </article>
        <article className="mcp-connection-mode is-unavailable" aria-describedby="local-bridge-note">
          <div>
            <span className="mcp-mode-kicker">Stovo Desktop</span>
            <h3>Local agent bridge</h3>
            <p id="local-bridge-note">
              Direct device-level bridge for paired desktop environments. This requires the Stovo Desktop app.
            </p>
          </div>
          <button type="button" className="secondary-button" disabled aria-disabled="true">
            Available in Stovo Desktop
          </button>
        </article>
      </section>

      {secret && (
        <article className="invite-link-card mcp-secret-card">
          <div className="mcp-secret-header">
            <div>
              <strong>Connect Stovo to {mcpProviderLabel(secret.provider)}</strong>
              <p>
                Connection session for <strong>{secret.connectorName}</strong>. Copy the details below into your agent.
              </p>
            </div>
            <span className={`mcp-status-pill ${isSecretConnected ? "is-connected" : "is-waiting"}`}>
              {isSecretConnected ? "Connected" : "Waiting for connection"}
            </span>
          </div>

          <div className={`mcp-connection-status ${isSecretConnected ? "is-connected" : "is-waiting"}`}>
            <span className={`mcp-status-dot ${isSecretConnected ? "is-connected" : "is-waiting"}`} />
            <div>
              <strong>{isSecretConnected ? "Connected successfully" : "Waiting for agent to connect…"}</strong>
              <p>
                {isSecretConnected
                  ? "Stovo confirmed the active connection session. The agent has connected and is ready to work with allowed chats."
                  : "Start or configure your agent with the prompt or command below. Once the agent connects to Stovo, this status will update automatically."}
              </p>
            </div>
          </div>

          <label>
            Setup prompt
            <textarea className="mcp-setup-prompt" readOnly rows={5} value={secret.setupPrompt} />
          </label>

          <label>
            MCP URL
            <code>{secret.mcpUrl}</code>
          </label>
          <label>
            Bearer token
            <code>{secret.token}</code>
          </label>

          <div className="mcp-setup-block">
            <strong>In-app setup</strong>
            <ol className="mcp-setup-steps">
              {setupSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          <div className="mcp-cli-toggle">
            <button type="button" className="secondary-button" onClick={() => setShowCli((current) => !current)}>
              {showCli ? "Hide CLI alternative" : "Show CLI alternative"}
            </button>
            {showCli && <code>{secret.cliCommand}</code>}
          </div>

          <div className="public-access-actions">
            <button type="button" onClick={() => void handleCopy("prompt", secret.setupPrompt)}>
              {copied === "prompt" ? "Prompt copied" : "Copy setup prompt"}
            </button>
            <button type="button" onClick={() => void handleCopy("token", secret.token)}>
              {copied === "token" ? "Token copied" : "Copy token"}
            </button>
            {showCli && (
              <button type="button" onClick={() => void handleCopy("cli", secret.cliCommand)}>
                {copied === "cli" ? "Command copied" : "Copy CLI command"}
              </button>
            )}
            <button type="button" className="secondary-button" onClick={() => setSecret(null)}>
              Dismiss
            </button>
          </div>
        </article>
      )}

      <form className="mcp-connector-form mcp-section-box" onSubmit={handleCreate}>
        <div className="mcp-form-heading">
          <div>
            <h3>Create connection · {providerMeta.label}</h3>
            <p className="muted-text">
              Connect Stovo to your agent. This creates a secure connection session that authorizes the agent to interact
              with allowed chats in Stovo.
            </p>
          </div>
        </div>

        <div className="mcp-provider-tabs" role="tablist" aria-label="MCP provider">
          {MCP_PROVIDERS.map((item) => {
            const selected = provider === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`mcp-provider-tab${selected ? " is-selected" : ""}`}
                onClick={() => setProvider(item.id)}
              >
                <strong>{item.shortLabel}</strong>
                <small>{item.description}</small>
              </button>
            );
          })}
        </div>

        <label>
          Connection name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={providerPlaceholder(provider)}
            required
            maxLength={120}
          />
        </label>

        <label>
          Max history messages
          <input
            type="number"
            min={1}
            max={500}
            value={maxHistory}
            onChange={(event) => setMaxHistory(Number(event.target.value) || 50)}
          />
        </label>
        <fieldset className="mcp-tag-fieldset">
          <legend>
            <span>Allowed chats</span>
            <label className="mcp-select-all">
              <input
                type="checkbox"
                checked={allChatsSelected}
                disabled={chats.length === 0}
                onChange={toggleAllChats}
              />
              <span>Select all</span>
            </label>
          </legend>
          {chats.length === 0 && <span className="muted-text">No chats available</span>}
          <div className="mcp-option-groups">
            {chatGroups.map((group) => {
              const groupSelected =
                group.chats.length > 0 && group.chats.every((chat) => allowedChatIds.includes(chat.id));
              return (
                <div key={group.id} className="mcp-option-group">
                  <div className="mcp-option-group-header">
                    <span className="mcp-option-group-title">
                      <ChatTypeIcon type={group.id} />
                      {group.label}
                    </span>
                    <label className="mcp-select-all">
                      <input
                        type="checkbox"
                        checked={groupSelected}
                        onChange={() => toggleChatGroup(group.chats)}
                      />
                      <span>All</span>
                    </label>
                  </div>
                  <div className="mcp-tag-list">
                    {group.chats.map((chat) => {
                      const selected = allowedChatIds.includes(chat.id);
                      return (
                        <label key={chat.id} className={`mcp-tag${selected ? " is-selected" : ""}`}>
                          <input type="checkbox" checked={selected} onChange={() => toggleChat(chat.id)} />
                          <ChatTypeIcon type={chat.type} />
                          <strong>{chatLabel(chat)}</strong>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>
        <fieldset className="mcp-tag-fieldset">
          <legend>
            <span>Permissions (all off by default)</span>
            <label className="mcp-select-all">
              <input type="checkbox" checked={allPermissionsSelected} onChange={toggleAllPermissions} />
              <span>Select all</span>
            </label>
          </legend>
          <div className="mcp-option-groups">
            {PERMISSION_GROUPS.map((group) => {
              const groupSelected = group.keys.every((key) => permissions[key]);
              return (
                <div key={group.id} className="mcp-option-group">
                  <div className="mcp-option-group-header">
                    <span className="mcp-option-group-title">{group.label}</span>
                    <label className="mcp-select-all">
                      <input
                        type="checkbox"
                        checked={groupSelected}
                        onChange={() => togglePermissionGroup(group.keys)}
                      />
                      <span>All</span>
                    </label>
                  </div>
                  <div className="mcp-tag-list">
                    {group.keys.map((key) => {
                      const selected = permissions[key];
                      return (
                        <label key={key} className={`mcp-tag${selected ? " is-selected" : ""}`}>
                          <input type="checkbox" checked={selected} onChange={() => togglePermission(key)} />
                          <strong>{PERMISSION_LABELS[key]}</strong>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>
        <button type="submit" disabled={isSaving || !name.trim()}>
          {isSaving ? "Connecting…" : "Create connection"}
        </button>
      </form>

      <div className="mcp-connector-list mcp-section-box">
        <h3>Existing connections</h3>
        {isLoading && <p className="muted-text">Loading…</p>}
        {!isLoading && connectors.length === 0 && <p className="muted-text">No connections yet.</p>}
        {connectors.map((connector) => {
          const isConnected = Boolean(connector.lastUsedAt);
          return (
            <article key={connector.id} className={`mcp-connector-card${connector.revoked ? " is-revoked" : ""}`}>
              <div className="public-access-header">
                <div>
                  <div className="mcp-card-title-row">
                    <strong>{connector.name}</strong>
                    <span
                      className={`mcp-status-pill ${
                        connector.revoked
                          ? "is-revoked"
                          : !connector.enabled
                          ? "is-disabled"
                          : isConnected
                          ? "is-connected"
                          : "is-waiting"
                      }`}
                    >
                      {connector.revoked
                        ? "Revoked"
                        : !connector.enabled
                        ? "Disabled"
                        : isConnected
                        ? "Connected"
                        : "Waiting for connection"}
                    </span>
                  </div>
                  <small>
                    {mcpProviderLabel(connector.provider)} · {connector.allowedChatIds.length}{" "}
                    {connector.allowedChatIds.length === 1 ? "chat" : "chats"} allowed · history limit{" "}
                    {connector.maxHistoryMessages}
                    {connector.lastUsedAt &&
                      ` · active ${new Date(connector.lastUsedAt).toLocaleDateString()}`}
                  </small>
                </div>
              </div>
              <p className="muted-text">
                Permissions:{" "}
                {MCP_PERMISSION_KEYS.filter((key) => connector.permissions[key]).join(", ") || "none"}
              </p>
              {!connector.revoked && (
                <div className="public-access-actions">
                  <button type="button" onClick={() => void handleToggleEnabled(connector)}>
                    {connector.enabled ? "Disable" : "Enable"}
                  </button>
                  <button type="button" onClick={() => void handleRegenerate(connector)}>
                    Regenerate token
                  </button>
                  <button type="button" className="danger-button" onClick={() => void handleRevoke(connector)}>
                    Revoke
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
