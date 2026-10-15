import React, { useEffect, useState } from "react";
import { MoreVertical, Settings2, UserPlus, X, RefreshCw, ExternalLink, KeyRound, Trash2 } from "lucide-react";
import {
  createInviteLink,
  createServer,
  deleteServer,
  fetchServers,
  fetchTenantAiSettings,
  getGhostToken,
  masterLogin,
  updateServerSettings,
  updateTenantAiSettings,
  ChatTypesConfig,
  TenantAiSettings,
  ServerRecord,
} from "../api/masterAdmin";
import { useStrings } from "../i18n/LanguageContext";
import "./MultiAdminPage.css";

export default function MultiAdminPage() {
  const strings = useStrings();
  const copy = strings.admin.supervisorConsole;
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("master_admin_token")
  );
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [adminUser, setAdminUser] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("admin12345");
  const [createResult, setCreateResult] = useState<{
    inviteUrl: string;
    clusterUrl: string;
    adminUser: string;
    adminPassword: string;
  } | null>(null);

  // Settings Modal State
  const [editingServer, setEditingServer] = useState<ServerRecord | null>(null);
  const [editName, setEditName] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"general" | "ai" | "chats" | "premium">("general");
  const [chatTypes, setChatTypes] = useState<ChatTypesConfig>({ direct: true, group: true, channel: true, voice: true });
  const [aiSettings, setAiSettings] = useState<TenantAiSettings>({ translationEnabled: true, callRecordingEnabled: true, aiNotesEnabled: true, voiceTranscriptionEnabled: true });
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // Notification / Toast info
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (token) {
      loadServers();
    }
  }, [token]);

  useEffect(() => {
    if (!editingServer) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingSettings) setEditingServer(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingServer, savingSettings]);

  useEffect(() => {
    if (!openMenu) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".space-actions-menu-wrap")) setOpenMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenu]);

  const loadServers = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchServers(token);
      setServers(data || []);
    } catch (err: any) {
      setError(err.message || copy.saveError);
      if (err.message?.includes("token") || err.message?.includes("Unauthorized")) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Autofill can update the DOM without firing React input events.
    const credentials = new FormData(e.currentTarget);
    setLoginError("");
    try {
      const authToken = await masterLogin(
        String(credentials.get("username") ?? ""),
        String(credentials.get("password") ?? "")
      );
      localStorage.setItem("master_admin_token", authToken);
      setToken(authToken);
    } catch (err: any) {
      setLoginError(err.message || "Authentication failed");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("master_admin_token");
    setToken(null);
    setServers([]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newName) return;
    try {
      const res = await createServer(
        token,
        "",
        newName.trim(),
        adminUser.trim(),
        adminPassword.trim(),
      );
      const originClusterUrl = `${window.location.origin}/s/${res.slug}/login`;
      const originInviteUrl = `${window.location.origin}/s/${res.slug}/setup?token=${new URL(res.invite_url).searchParams.get("token") || ""}`;
      setCreateResult({
        inviteUrl: originInviteUrl,
        clusterUrl: originClusterUrl,
        adminUser: res.admin_user || adminUser,
        adminPassword: res.admin_password || adminPassword,
      });
      setNewName("");
      loadServers();
      showToast(copy.settingsSaved(res.name));
    } catch (err: any) {
      alert(err.message || "Failed to create space");
    }
  };

  const handleOpenSettings = async (s: ServerRecord) => {
    setEditingServer(s);
    setEditName(s.name);
    setSettingsTab("general");
    setChatTypes(s.chat_types ?? { direct: true, group: true, channel: true, voice: true });
    if (token) {
      try {
        const settings = await fetchTenantAiSettings(token, s.slug);
        setAiSettings({
          translationEnabled: settings.translationEnabled ?? true,
          callRecordingEnabled: settings.callRecordingEnabled ?? true,
          aiNotesEnabled: settings.aiNotesEnabled ?? true,
          voiceTranscriptionEnabled: settings.voiceTranscriptionEnabled ?? true,
        });
      } catch (err: any) {
        showToast(err.message || "Failed to load AI settings");
      }
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingServer) return;
    setSavingSettings(true);
    try {
      await updateTenantAiSettings(token, editingServer.slug, aiSettings);
      const updated = await updateServerSettings(token, editingServer.slug, {
        name: editName.trim(),
        chat_types: chatTypes,
      });
      setServers((prev) =>
        prev.map((s) => (s.slug === editingServer.slug ? { ...s, ...updated } : s))
      );
      showToast(copy.settingsSaved(updated.name || editingServer.name));
      setEditingServer(null);
    } catch (err: any) {
      alert(err.message || copy.saveError);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDelete = async (slug: string) => {
    if (!token) return;
    if (!confirm(copy.confirmDelete(slug))) {
      return;
    }
    try {
      await deleteServer(token, slug);
      showToast(copy.delete);
      loadServers();
    } catch (err: any) {
      alert(err.message || "Failed to delete space");
    }
  };

  const handleCopyGhostToken = async (slug: string) => {
    if (!token) return;
    try {
      const ghostToken = await getGhostToken(token, slug);
      await navigator.clipboard.writeText(ghostToken);
      showToast(copy.ghostCopied(slug));
    } catch (err: any) {
      alert(err.message || "Failed to get Ghost Token");
    }
  };

  const handleCopyInvite = async (slug: string) => {
    if (!token) return;
    try {
      const inviteUrl = await createInviteLink(token, slug);
      const url = new URL(inviteUrl, window.location.origin);
      const fullUrl = `${window.location.origin}${url.pathname}${url.search}`;
      await navigator.clipboard.writeText(fullUrl);
      showToast(copy.inviteCopied(slug));
    } catch (err: any) {
      alert(err.message || "Failed to generate invite link");
    }
  };

  if (!token) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginCard}>
          <div style={styles.badgePill}>{copy.supervisor}</div>
          <h1 style={styles.title}>{copy.title}</h1>
          <p style={styles.subtitle}>{copy.login}</p>

          {loginError && <div style={styles.errorBox}>{loginError}</div>}

          <form onSubmit={handleLogin} style={styles.form}>
            <label style={styles.label}>
              {copy.username}
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={styles.inputPill}
                required
              />
            </label>
            <label style={styles.label}>
              {copy.password}
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.inputPill}
                required
              />
            </label>
            <button type="submit" style={styles.primaryPillButton}>
              {copy.loginButton}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page} className="supervisor-admin-page">
      {toast && <div style={styles.toast}>{toast}</div>}

      <header style={styles.header} className="header">
        <div style={styles.headerTitleGroup}>
          <div style={styles.badgePill}>{copy.supervisor}</div>
          <h1 style={styles.headerTitle}>{copy.title}</h1>
        </div>
        <div style={styles.headerActions}>
            <button
              onClick={() => setIsCreateOpen(true)}
            style={styles.secondaryPillButton}
          >
            {copy.createSpace}
          </button>
          <button onClick={handleLogout} style={styles.secondaryPillButton}>
            {copy.logout}
          </button>
        </div>
      </header>

      <main style={styles.main} className="main">
        {/* Stats Row */}
        <div style={styles.statsGrid} className="statsGrid">
          <div style={styles.statCard} className="statCard">
            <div style={styles.statLabel} className="statLabel">{copy.activeSpaces}</div>
            <div style={styles.statValue} className="statValue">{servers.length}</div>
          </div>
          <div style={styles.statCard} className="statCard">
            <div style={styles.statLabel} className="statLabel">{copy.systemStatus}</div>
            <div style={{ ...styles.statValue, color: "#34d399" }} className="statValue">{copy.operational}</div>
          </div>
          <div style={styles.statCard} className="statCard">
            <div style={styles.statLabel} className="statLabel">{copy.advancedMonitoring}</div>
            <div style={styles.monitoringStatus} className="monitoringStatus">
              <span style={styles.monitoringDisabledButton}>{copy.monitoringDisabled}</span>
              <span className="premium-feature-badge">{strings.admin.encryption.premium}</span>
            </div>
          </div>
        </div>

        {/* Server List */}
        <div style={styles.panelCard} className="panelCard">
          <div style={styles.sectionHeader} className="sectionHeader">
            <h2 style={styles.sectionTitle} className="sectionTitle">{copy.yourSpaces}</h2>
            <button
              onClick={loadServers}
              title={copy.refreshSpaces}
              style={styles.iconOnlyButton}
            >
              <RefreshCw size={18} aria-hidden="true" />
            </button>
          </div>

          {loading ? (
            <div style={styles.emptyState}>{copy.loadingSpaces}</div>
          ) : error ? (
            <div style={styles.errorBox}>{error}</div>
          ) : servers.length === 0 ? (
            <div style={styles.emptyState}>
              {copy.noSpaces} <strong style={{ color: "#60a5fa" }}>{copy.createSpace}</strong>
            </div>
          ) : (
            <div style={styles.tableWrapper} className="tableWrapper">
              <table style={styles.table} className="table">
                <thead>
                  <tr>
                    <th style={styles.th} className="th">{copy.id}</th>
                    <th style={styles.th} className="th">{copy.name}</th>
                    <th style={styles.th} className="th">{copy.spaceLink}</th>
                    <th style={styles.th} className="th">{copy.status}</th>
                    <th style={styles.th} className="th">{copy.createdAt}</th>
                    <th style={styles.th} className="th">{copy.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {servers.map((s: ServerRecord) => (
                    <tr key={s.id} style={styles.tr} className="supervisor-space-row">
                      <td style={styles.td} className="td">#{s.id}</td>
                      <td style={{ ...styles.td, fontWeight: "var(--font-weight-bold)", color: "#ffffff" }} className="td">{s.name}</td>
                      <td style={styles.td} className="td">
                        <a
                          href={`/s/${s.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          style={styles.linkPill}
                          title={copy.openSpace(s.name)}
                        >
                          /s/{s.slug}
                          <ExternalLink size={13} aria-hidden="true" style={{ marginLeft: 6 }} />
                        </a>
                      </td>
                      <td style={styles.td} className="td">
                        <span style={styles.statusPill}>{s.status || "running"}</span>
                      </td>
                      <td style={styles.td} className="td">
                        {new Date(s.created_at).toLocaleDateString()} {new Date(s.created_at).toLocaleTimeString()}
                      </td>
                      <td style={styles.td} className="td">
                        <div style={styles.actionGroup} className="actionGroup">
                          <button
                            onClick={() => handleOpenSettings(s)}
                            title={copy.settingsFor(s.name)}
                            style={styles.iconActionButton}
                            className="iconActionButton"
                            aria-label={copy.settingsFor(s.name)}
                          >
                            <Settings2 size={19} aria-hidden="true" />
                          </button>
                          <button
                            onClick={() => handleCopyInvite(s.slug)}
                            title={copy.inviteFor(s.name)}
                            style={styles.iconActionButton}
                            className="iconActionButton"
                            aria-label={copy.inviteFor(s.name)}
                          >
                            <UserPlus size={19} aria-hidden="true" />
                          </button>
                          <div className="space-actions-menu-wrap">
                            <button type="button" style={styles.iconActionButton} className="iconActionButton" aria-label={copy.actionsFor(s.name)} aria-haspopup="menu" aria-expanded={openMenu === s.slug} onClick={() => setOpenMenu(openMenu === s.slug ? null : s.slug)}><MoreVertical size={20} aria-hidden="true" /></button>
                            {openMenu === s.slug && <div className="space-actions-menu" role="menu">
                              <button type="button" role="menuitem" onClick={() => { setOpenMenu(null); void handleCopyGhostToken(s.slug); }}><KeyRound size={16} />{copy.ghostToken}</button>
                              <button type="button" role="menuitem" className="danger" onClick={() => { setOpenMenu(null); void handleDelete(s.slug); }}><Trash2 size={16} />{copy.delete}</button>
                            </div>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Server Settings Modal */}
      {editingServer && (
        <div style={styles.modalOverlay} className="modalOverlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingSettings) setEditingServer(null); }}>
          <div style={styles.modalCard} className="modalCard" role="dialog" aria-modal="true" aria-labelledby="space-settings-title">
            <button type="button" style={styles.modalCloseButton} className="modalCloseButton" aria-label={copy.closeSettings} onClick={() => setEditingServer(null)} disabled={savingSettings}><X size={23} strokeWidth={1.8} aria-hidden="true" /></button>
            <div style={styles.badgePill} className="badgePill">{copy.spaceSettings}</div>
            <h3 id="space-settings-title" style={styles.modalTitle} className="modalTitle">{editingServer.name}</h3>
            <p style={styles.modalSubtitle} className="modalSubtitle">{copy.manageSpace}</p>

            <form onSubmit={handleSaveSettings} style={styles.form}>
              <div className="supervisor-settings-tabs" role="tablist" aria-label={copy.spaceSettings}>
                {([['general', copy.generalTab], ['ai', strings.admin.serverSettings.aiFunctions], ['chats', strings.admin.rbac.supervisorChatTypes], ['premium', strings.admin.encryption.premium]] as const).map(([id, label]) => <button type="button" role="tab" aria-selected={settingsTab === id} className={settingsTab === id ? "active" : ""} key={id} onClick={() => setSettingsTab(id)}>{label}</button>)}
              </div>

              <div className="supervisor-settings-tab-panel" role="tabpanel">
                {settingsTab === "general" && <label style={styles.label}>{copy.spaceName}<input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} style={styles.inputPill} required /></label>}
                {settingsTab === "ai" && <section aria-label={strings.admin.serverSettings.aiFunctions}>
                  <p className="supervisor-settings-help">{copy.aiHelp}</p>
                  {([
                    ["translationEnabled", strings.admin.serverSettings.translation, copy.translationHelp],
                    ["callRecordingEnabled", strings.admin.serverSettings.callRecording, copy.recordingHelp],
                    ["aiNotesEnabled", strings.admin.serverSettings.aiNotes, copy.notesHelp],
                    ["voiceTranscriptionEnabled", strings.admin.serverSettings.voiceTranscription, copy.transcriptionHelp],
                  ] as const).map(([key, label, description]) => <label className="supervisor-setting-row" key={key}><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={aiSettings[key]} onChange={(event) => setAiSettings((current) => ({ ...current, [key]: event.target.checked }))} /></label>)}
                </section>}
                {settingsTab === "chats" && <section aria-labelledby="supervisor-chat-types-title">
                  <p className="supervisor-settings-help" id="supervisor-chat-types-title">{copy.chatsHelp}</p>
                  {([
                    ["direct", strings.admin.rbac.directMessages],
                    ["group", strings.admin.rbac.groupChats],
                    ["channel", strings.admin.rbac.textChannels],
                    ["voice", strings.admin.rbac.voiceChats],
                  ] as const).map(([key, label]) => <label className="supervisor-setting-row" key={key}><span><strong>{label}</strong><small>{strings.admin.rbac.supervisorChatTypes}</small></span><input type="checkbox" checked={chatTypes[key]} onChange={(event) => setChatTypes((current) => ({ ...current, [key]: event.target.checked }))} /></label>)}
                </section>}
                {settingsTab === "premium" && <section>
                  <p className="supervisor-settings-help">{copy.premiumDescription}</p>
                  {[[copy.roleLimits, copy.roleLimitsHelp], [copy.roleRestrictions, copy.roleRestrictionsHelp], [copy.advancedMonitoring, copy.monitoringHelp], [copy.antispam, copy.antispamHelp]].map(([title, desc]) => <div className="supervisor-setting-row is-locked" key={title}><span><strong>{title}</strong><small>{desc}</small></span><span className="premium-feature-badge">{strings.admin.encryption.premium}</span></div>)}
                </section>}
              </div>

              <div style={styles.modalActions} className="modalActions">
                <button
                  type="button"
                  onClick={() => setEditingServer(null)}
                  style={styles.secondaryPillButton}
                  disabled={savingSettings}
                >
                  {copy.cancel}
                </button>
                <button
                  type="submit"
                  style={styles.primaryPillButton}
                  disabled={savingSettings}
                >
                  {savingSettings ? copy.saving : copy.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {isCreateOpen && (
        <div style={styles.modalOverlay} className="modalOverlay">
          <div style={styles.modalCard} className="modalCard">
            <h3 style={styles.modalTitle} className="modalTitle">{copy.createSpaceTitle}</h3>
            <p style={styles.modalSubtitle}>
              {copy.createDescription}
            </p>

            {createResult ? (
              <div style={styles.resultBox}>
                <div style={{ fontWeight: "var(--font-weight-bold)", color: "#34d399", marginBottom: 8, fontSize: "var(--font-size-small)" }}>
                  {copy.provisioned}
                </div>
                <p style={{ fontSize: "var(--font-size-caption)", color: "#9ca3af", marginBottom: 12 }}>
                  {copy.adminCreated}
                </p>
                <div style={{ backgroundColor: "#1c1c1e", padding: 14, borderRadius: "var(--radius-surface)", marginBottom: 14, fontSize: "var(--font-size-caption)" }}>
                  <div><strong>{copy.username}:</strong> {createResult.adminUser}</div>
                  <div><strong>{copy.password}:</strong> {createResult.adminPassword}</div>
                </div>
                <div style={{ display: "flex", gap: 10, flexDirection: "column" }}>
                  <a
                    href={createResult.clusterUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ ...styles.primaryPillButton, textDecoration: "none", textAlign: "center" }}
                  >
                    {copy.openLogin}
                  </a>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createResult.inviteUrl);
                      showToast(copy.copyInviteLink);
                    }}
                    style={styles.secondaryPillButton}
                  >
                    {copy.copyInviteLink}
                  </button>
                  <button
                    onClick={() => {
                      setCreateResult(null);
                      setIsCreateOpen(false);
                    }}
                    style={{ ...styles.secondaryPillButton, marginTop: 8 }}
                  >
                    {copy.close}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate} style={styles.form}>
                <label style={styles.label}>
                  {copy.spaceName}
                  <input
                    type="text"
                    placeholder={copy.namePlaceholder}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    style={styles.inputPill}
                    autoFocus
                    required
                  />
                </label>
                <label style={styles.label}>
                  {copy.adminNickname}
                  <input
                    type="text"
                    value={adminUser}
                    onChange={(e) => setAdminUser(e.target.value)}
                    style={styles.inputPill}
                    required
                  />
                </label>
                <label style={styles.label}>
                  {copy.adminPassword}
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    style={styles.inputPill}
                    required
                  />
                </label>

                <div style={styles.modalActions}>
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    style={styles.secondaryPillButton}
                  >
                    {copy.cancel}
                  </button>
                  <button type="submit" style={styles.primaryPillButton}>
                    {copy.provisionServer}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#000000",
    color: "#f3f4f6",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
  },
  loginContainer: {
    display: "flex",
    minHeight: "100vh",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
    padding: 20,
  },
  loginCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#1c1c1e",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "var(--radius-panel)",
    padding: 36,
    boxShadow: "0 25px 60px rgba(0, 0, 0, 0.8)",
  },
  badgePill: {
    display: "inline-block",
    padding: "6px 14px",
    borderRadius: "var(--radius-pill)",
    backgroundColor: "rgba(96, 165, 250, 0.12)",
    color: "#60a5fa",
    fontSize: "var(--font-size-caption)",
    fontWeight: "var(--font-weight-bold)",
    letterSpacing: "0.5px",
    marginBottom: 16,
    border: "1px solid rgba(96, 165, 250, 0.25)",
  },
  title: {
    fontSize: "var(--font-size-heading)",
    fontWeight: "var(--font-weight-extrabold)",
    margin: "0 0 6px 0",
    letterSpacing: "-0.5px",
    color: "#ffffff",
  },
  subtitle: {
    fontSize: "var(--font-size-small)",
    color: "#9ca3af",
    marginBottom: 28,
    lineHeight: 1.5,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    fontSize: "var(--font-size-caption)",
    fontWeight: "var(--font-weight-semibold)",
    color: "#d1d5db",
  },
  inputPill: {
    padding: "12px 20px",
    backgroundColor: "#2c2c2e",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "var(--radius-pill)",
    color: "#ffffff",
    fontSize: "var(--font-size-small)",
    outline: "none",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  primaryPillButton: {
    padding: "12px 24px",
    backgroundColor: "#c66b24",
    color: "#ffffff",
    border: "none",
    borderRadius: "var(--radius-pill)",
    fontWeight: "var(--font-weight-bold)",
    fontSize: "var(--font-size-small)",
    cursor: "pointer",
    boxShadow: "none",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  secondaryPillButton: {
    padding: "12px 24px",
    backgroundColor: "#2c2c2e",
    color: "#e5e7eb",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "var(--radius-pill)",
    fontWeight: "var(--font-weight-semibold)",
    fontSize: "var(--font-size-small)",
    cursor: "pointer",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  iconOnlyButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    backgroundColor: "#2c2c2e",
    color: "#e5e7eb",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "var(--radius-pill)",
    cursor: "pointer",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  errorBox: {
    padding: 14,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "var(--radius-surface)",
    color: "#f87171",
    fontSize: "var(--font-size-caption)",
    marginBottom: 16,
    lineHeight: 1.4,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 28px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
    backgroundColor: "#050505",
  },
  headerTitleGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  headerTitle: {
    fontSize: "var(--font-size-heading)",
    fontWeight: "var(--font-weight-extrabold)",
    margin: 0,
    color: "#ffffff",
    letterSpacing: "-0.5px",
  },
  headerActions: {
    display: "flex",
    gap: 12,
  },
  main: {
    padding: "28px",
    maxWidth: 1320,
    margin: "0 auto",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 20,
    marginBottom: 36,
  },
  statCard: {
    backgroundColor: "#1c1c1e",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "var(--radius-panel)",
    padding: 24,
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
    transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease",
  },
  statLabel: {
    fontSize: "var(--font-size-caption)",
    fontWeight: "var(--font-weight-medium)",
    color: "#9ca3af",
    marginBottom: 8,
  },
  statValue: {
    fontSize: "var(--font-size-heading)",
    fontWeight: "var(--font-weight-extrabold)",
    color: "#ffffff",
  },
  monitoringStatus: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  monitoringDisabledButton: {
    padding: "6px 10px",
    border: "1px solid rgba(255,255,255,.12)",
    borderRadius: "var(--radius-control)",
    background: "rgba(255,255,255,.05)",
    color: "#9ca3af",
    fontSize: "var(--font-size-caption)",
    fontWeight: "var(--font-weight-bold)",
    cursor: "default",
  },
  panelCard: {
    backgroundColor: "#1c1c1e",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "var(--radius-panel)",
    padding: 32,
    boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: "var(--font-size-heading-small)",
    fontWeight: "var(--font-weight-extrabold)",
    margin: 0,
    color: "#ffffff",
  },
  tableWrapper: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: "0 10px",
    textAlign: "left",
  },
  th: {
    padding: "12px 20px",
    fontSize: "var(--font-size-caption)",
    fontWeight: "var(--font-weight-semibold)",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  tr: {
    backgroundColor: "#2c2c2e",
    borderRadius: "var(--radius-bubble)",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  td: {
    padding: "18px 20px",
    fontSize: "var(--font-size-small)",
    color: "#d1d5db",
  },
  linkPill: {
    display: "inline-flex",
    alignItems: "center",
    backgroundColor: "rgba(96, 165, 250, 0.12)",
    color: "#93c5fd",
    border: "1px solid rgba(96, 165, 250, 0.25)",
    padding: "6px 16px",
    borderRadius: "var(--radius-pill)",
    fontFamily: "monospace",
    fontSize: "var(--font-size-caption)",
    fontWeight: "var(--font-weight-semibold)",
    textDecoration: "none",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  statusPill: {
    padding: "6px 14px",
    borderRadius: "var(--radius-pill)",
    backgroundColor: "rgba(52, 211, 153, 0.15)",
    color: "#34d399",
    border: "1px solid rgba(52, 211, 153, 0.3)",
    fontSize: "var(--font-size-caption)",
    fontWeight: "var(--font-weight-bold)",
    letterSpacing: "0.5px",
  },
  actionGroup: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  iconActionButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    padding: 0,
    border: "1px solid #45464a",
    borderRadius: "var(--radius-circle)",
    backgroundColor: "#252629",
    color: "#d5d9e0",
    cursor: "pointer",
  },
  invitePillButton: {
    padding: "8px 18px",
    backgroundColor: "rgba(52, 211, 153, 0.15)",
    color: "#34d399",
    border: "1px solid rgba(52, 211, 153, 0.3)",
    borderRadius: "var(--radius-pill)",
    fontSize: "var(--font-size-caption)",
    fontWeight: "var(--font-weight-bold)",
    cursor: "pointer",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  ghostPillButton: {
    padding: "8px 18px",
    backgroundColor: "rgba(129, 140, 248, 0.15)",
    color: "#a5b4fc",
    border: "1px solid rgba(129, 140, 248, 0.3)",
    borderRadius: "var(--radius-pill)",
    fontSize: "var(--font-size-caption)",
    fontWeight: "var(--font-weight-bold)",
    cursor: "pointer",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  dangerIconButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    color: "#fca5a5",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "var(--radius-pill)",
    cursor: "pointer",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  emptyState: {
    textAlign: "center",
    padding: 60,
    color: "#9ca3af",
    fontSize: "var(--font-size-small)",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    backdropFilter: "blur(14px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 1000,
  },
  modalCard: {
    position: "relative",
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#1c1c1e",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "var(--radius-panel)",
    padding: 36,
    boxShadow: "0 30px 70px rgba(0, 0, 0, 0.9)",
  },
  modalTitle: {
    fontSize: "var(--font-size-heading-small)",
    fontWeight: "var(--font-weight-extrabold)",
    margin: "0 0 8px 0",
    color: "#ffffff",
  },
  modalCloseButton: {
    position: "absolute",
    top: 18,
    right: 18,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: "var(--radius-pill)",
    border: "1px solid rgba(255,255,255,.12)",
    background: "#2c2c2e",
    color: "#d1d5db",
    cursor: "pointer",
  },
  modalSubtitle: {
    fontSize: "var(--font-size-small)",
    color: "#9ca3af",
    marginBottom: 24,
    lineHeight: 1.5,
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 24,
  },
  resultBox: {
    backgroundColor: "#2c2c2e",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    padding: 20,
    borderRadius: "var(--radius-panel)",
  },
  settingsPillButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "8px 18px",
    backgroundColor: "rgba(96, 165, 250, 0.15)",
    color: "#60a5fa",
    border: "1px solid rgba(96, 165, 250, 0.3)",
    borderRadius: "var(--radius-pill)",
    fontSize: "var(--font-size-caption)",
    fontWeight: "var(--font-weight-bold)",
    cursor: "pointer",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  tabBadgeGroup: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
  },
  tabBadgeActive: {
    fontSize: "var(--font-size-caption)",
    fontWeight: "var(--font-weight-bold)",
    padding: "3px 8px",
    borderRadius: "var(--radius-pill)",
    backgroundColor: "rgba(52, 211, 153, 0.15)",
    color: "#34d399",
    border: "1px solid rgba(52, 211, 153, 0.3)",
  },
  tabBadgeInactive: {
    fontSize: "var(--font-size-caption)",
    fontWeight: "var(--font-weight-semibold)",
    padding: "3px 8px",
    borderRadius: "var(--radius-pill)",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    color: "#6b7280",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    textDecoration: "line-through",
  },
  tabsConfigCard: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    backgroundColor: "#2c2c2e",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "var(--radius-bubble)",
    padding: 14,
  },
  tabToggleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer",
    padding: "6px 4px",
  },
  tabToggleTitle: {
    fontSize: "var(--font-size-small)",
    fontWeight: "var(--font-weight-bold)",
    color: "#ffffff",
  },
  tabToggleDesc: {
    fontSize: "var(--font-size-caption)",
    color: "#9ca3af",
    marginTop: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    accentColor: "#3b82f6",
    cursor: "pointer",
  },
  toast: {
    position: "fixed",
    bottom: 32,
    right: 32,
    backgroundColor: "#1c1c1e",
    color: "#ffffff",
    border: "1px solid rgba(96, 165, 250, 0.4)",
    padding: "14px 24px",
    borderRadius: "var(--radius-pill)",
    boxShadow: "0 15px 30px rgba(0, 0, 0, 0.8)",
    zIndex: 1100,
    fontWeight: "var(--font-weight-semibold)",
    fontSize: "var(--font-size-small)",
  },
};
