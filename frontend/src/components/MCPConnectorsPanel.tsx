import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Settings, X } from "lucide-react";

import { ApiError, ApiRequestOptions } from "../api/client";
import { Chat } from "../api/chats";
import {
  MCP_PERMISSION_KEYS,
  MCPConnector,
  MCPPermissionKey,
  MCPPermissions,
  MCPProviderId,
  createMCPConnector,
  defaultMCPAlias,
  defaultMCPPermissions,
  listMCPConnectors,
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

// A connection without this capability appears healthy in Codex but cannot
// discover its configured scope. Keep other capabilities opt-in.
function defaultWorkingMCPPermissions(): MCPPermissions {
  return { ...defaultMCPPermissions(), "chats.list": true };
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

export default function MCPConnectorsPanel({
  accessToken,
  authRequest,
  spaceName,
  onError,
  onNotice
}: {
  accessToken: string;
  authRequest: <T>(endpoint: string, options?: ApiRequestOptions) => Promise<T>;
  spaceName: string;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
}) {
  const [connectors, setConnectors] = useState<MCPConnector[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  // MCP transport and permissions are identical for every compatible agent.
  // Keep a stable backend provider value for legacy records, without making
  // people choose an artificial agent category during setup.
  const [provider] = useState<MCPProviderId>("codex");
  const [name, setName] = useState("");
  const [maxHistory, setMaxHistory] = useState(50);
  const [permissions, setPermissions] = useState<MCPPermissions>(defaultWorkingMCPPermissions());
  const [allowedChatIds, setAllowedChatIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<MCPConnector | null>(null);
  const [editName, setEditName] = useState("");
  const [editHistory, setEditHistory] = useState(50);
  const [editPermissions, setEditPermissions] = useState<MCPPermissions>(defaultWorkingMCPPermissions());
  const [editChatIds, setEditChatIds] = useState<string[]>([]);
  const [secret, setSecret] = useState<SecretReveal | null>(null);
  const [copied, setCopied] = useState<"token" | "prompt" | "url" | "cli" | null>(null);
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
      // The Space shown here is already the active server route. A new
      // connector starts with its entire current Space selected; the owner can
      // narrow it before saving.
      setAllowedChatIds((current) => (current.length ? current : chatResult.map((chat) => chat.id)));
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
      setPermissions(defaultWorkingMCPPermissions());
      setAllowedChatIds([]);
      setMaxHistory(50);
      onNotice("Connection created. Copy the setup details below to connect your agent.");
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not create connection");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCopy(kind: "token" | "prompt" | "url" | "cli", value: string) {
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

  function beginEdit(connector: MCPConnector) {
    setEditing(connector);
    setEditName(connector.name);
    setEditHistory(connector.maxHistoryMessages);
    setEditPermissions({ ...connector.permissions });
    setEditChatIds([...connector.allowedChatIds]);
  }

  function toggleEditChat(chatId: string) {
    setEditChatIds((current) => current.includes(chatId) ? current.filter((id) => id !== chatId) : [...current, chatId]);
  }

  function toggleEditPermission(key: MCPPermissionKey) {
    setEditPermissions((current) => ({ ...current, [key]: !current[key] }));
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setIsSaving(true);
    onError(null);
    try {
      const updated = await updateMCPConnector(accessToken, editing.id, {
        name: editName.trim(),
        maxHistoryMessages: editHistory,
        permissions: editPermissions,
        allowedChatIds: editChatIds
      });
      setConnectors((current) => current.map((item) => item.id === updated.id ? updated : item));
      setEditing(null);
      onNotice("Connection settings updated. The next MCP call uses the new scope and permissions.");
    } catch (err) {
      onError(err instanceof ApiError ? String(err.message) : "Could not update connection settings");
    } finally {
      setIsSaving(false);
    }
  }

  const setupSteps = mcpUiSetupSteps(secret?.provider);

  return (
    <section className="mcp-connectors-panel">
      <section className="mcp-connection-modes" aria-label="Agent connection modes">
        <article className="mcp-connection-mode is-active">
          <div>
            <span className="mcp-mode-kicker">Available now</span>
            <h3>Connect Stovo to agent</h3>
            <p>
              Secure MCP connection for AI agents with scoped chat and action access.
            </p>
          </div>
          <small>Connection session · MCP</small>
        </article>
        <article className="mcp-connection-mode is-unavailable" aria-describedby="local-bridge-note">
          <div>
            <span className="mcp-mode-kicker">Stovo Desktop</span>
            <h3>Local agent bridge</h3>
            <p id="local-bridge-note">
              Device-level bridge for paired desktop environments. Requires Stovo Desktop.
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
              <strong>Connect an AI agent to Stovo</strong>
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

          <div className="mcp-copy-field">
            <div className="mcp-copy-field-label"><span>Setup prompt</span><button type="button" className="mcp-inline-copy" onClick={() => void handleCopy("prompt", secret.setupPrompt)} aria-label="Copy setup prompt"><span className="ms-icon ms-icon--18" aria-hidden>content_copy</span>{copied === "prompt" ? "Copied" : "Copy"}</button></div>
            <textarea className="mcp-setup-prompt" readOnly rows={5} value={secret.setupPrompt} />
          </div>

          <div className="mcp-copy-field"><div className="mcp-copy-field-label"><span>MCP URL</span><button type="button" className="mcp-inline-copy" onClick={() => void handleCopy("url", secret.mcpUrl)} aria-label="Copy MCP URL"><span className="ms-icon ms-icon--18" aria-hidden>content_copy</span>{copied === "url" ? "Copied" : "Copy"}</button></div><code>{secret.mcpUrl}</code></div>
          <div className="mcp-copy-field"><div className="mcp-copy-field-label"><span>Bearer token</span><button type="button" className="mcp-inline-copy" onClick={() => void handleCopy("token", secret.token)} aria-label="Copy bearer token"><span className="ms-icon ms-icon--18" aria-hidden>content_copy</span>{copied === "token" ? "Copied" : "Copy"}</button></div><code>{secret.token}</code></div>

          <div className="mcp-setup-block">
            <strong>Native Codex / agent setup</strong>
            <ol className="mcp-setup-steps">
              {setupSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          {showCli && <div className="mcp-cli-toggle"><code>{secret.cliCommand}</code></div>}

          <div className="public-access-actions">
            <button type="button" className="secondary-button" onClick={() => setShowCli((current) => !current)}>
              {showCli ? "Hide CLI alternative" : "Show CLI alternative"}
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
            <h3>Create agent connection</h3>
            <p className="muted-text">
              This connection is bound to <strong>{spaceName}</strong>. All chats in this Space are selected initially;
              narrow the scope below if the agent should work in fewer chats. Chat discovery is enabled so Codex can
              show a clear scope rather than an empty list.
            </p>
          </div>
        </div>

        <label>
          Connection name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Research assistant"
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
            <span>Chat scope in this Space</span>
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
        <button type="submit" disabled={isSaving || !name.trim() || !allowedChatIds.length}>
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
                    {connector.allowedChatIds.length} {connector.allowedChatIds.length === 1 ? "chat" : "chats"} allowed · history limit{" "}
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
              {!connector.permissions["chats.list"] && !connector.revoked && (
                <p className="error-text">Chat discovery is off — Codex will receive a configuration instruction instead of a chat list.</p>
              )}
              {!connector.allowedChatIds.length && !connector.revoked && (
                <p className="error-text">No chats are in this connector’s Space scope.</p>
              )}
              {!connector.revoked && (
                <div className="public-access-actions">
                  <button
                    type="button"
                    className="icon-button mcp-icon-button"
                    onClick={() => beginEdit(connector)}
                    title="Configure"
                    aria-label="Configure connection"
                  >
                    <Settings size={16} />
                  </button>
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

      {editing && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSaving) setEditing(null);
          }}
        >
          <div className="modal-card mcp-edit-modal" role="dialog" aria-modal="true" aria-labelledby="mcp-modal-title">
            <header className="modal-header">
              <div>
                <h3 id="mcp-modal-title">Configure {editing.name}</h3>
                <p className="muted-text">Changes apply to the next MCP tool call; reconnecting Codex is not required.</p>
              </div>
              <button
                type="button"
                className="icon-button modal-close-button"
                onClick={() => setEditing(null)}
                disabled={isSaving}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </header>
            <form className="mcp-connector-form" onSubmit={saveEdit}>
              <label>Connection name<input value={editName} maxLength={120} onChange={(event) => setEditName(event.target.value)} required disabled={isSaving} /></label>
              <label>Max history messages<input type="number" min={1} max={500} value={editHistory} onChange={(event) => setEditHistory(Number(event.target.value) || 50)} disabled={isSaving} /></label>
              <fieldset className="mcp-tag-fieldset"><legend>Chat scope in this Space</legend><div className="mcp-tag-list">{chats.map((chat) => <label key={chat.id} className={`mcp-tag${editChatIds.includes(chat.id) ? " is-selected" : ""}`}><input type="checkbox" checked={editChatIds.includes(chat.id)} onChange={() => toggleEditChat(chat.id)} disabled={isSaving} /><ChatTypeIcon type={chat.type} /><strong>{chatLabel(chat)}</strong></label>)}</div></fieldset>
              <fieldset className="mcp-tag-fieldset"><legend>Permissions</legend><div className="mcp-tag-list">{MCP_PERMISSION_KEYS.map((key) => <label key={key} className={`mcp-tag${editPermissions[key] ? " is-selected" : ""}`}><input type="checkbox" checked={editPermissions[key]} onChange={() => toggleEditPermission(key)} disabled={isSaving} /><strong>{PERMISSION_LABELS[key]}</strong></label>)}</div></fieldset>
              <div className="public-access-actions"><button type="submit" disabled={isSaving || !editName.trim()}>{isSaving ? "Saving…" : "Save settings"}</button><button type="button" className="secondary-button" disabled={isSaving} onClick={() => setEditing(null)}>Cancel</button></div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
