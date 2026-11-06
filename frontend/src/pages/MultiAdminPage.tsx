import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical, Settings2, UserPlus, RefreshCw, ExternalLink, KeyRound, Trash2 } from "lucide-react";
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
  NavTabsConfig,
  ChatTypesConfig,
  TenantAiSettings,
  ServerRecord,
} from "../api/masterAdmin";
import { useStrings } from "../i18n/LanguageContext";
import { PopupDialog } from "../components/ui/Popup";
import { PopupButton } from "../components/ui/PopupButton";
import { PopupField } from "../components/ui/PopupField";
import InviteModal from "../components/InviteModal";
import StovoLogo from "../components/StovoLogo";
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
  const [newNavTabs, setNewNavTabs] = useState<NavTabsConfig>({ chats: true, storage: true, plans: true, settings: true });
  const [newChatTypes, setNewChatTypes] = useState<ChatTypesConfig>({ direct: true, group: true, channel: true, voice: true });
  const [createResult, setCreateResult] = useState<{
    inviteUrl: string;
    name: string;
  } | null>(null);

  // Settings Modal State
  const [editingServer, setEditingServer] = useState<ServerRecord | null>(null);
  const [editName, setEditName] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"general" | "ai" | "chats" | "premium">("general");
  const [chatTypes, setChatTypes] = useState<ChatTypesConfig>({ direct: true, group: true, channel: true, voice: true });
  const [aiSettings, setAiSettings] = useState<TenantAiSettings>({ translationEnabled: true, callRecordingEnabled: true, aiNotesEnabled: true, voiceTranscriptionEnabled: true });
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });

  // Notification / Toast info
  const [toast, setToast] = useState<string | null>(null);
  const [spaceInvite, setSpaceInvite] = useState<{ name: string; url: string } | null>(null);

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
    if (!openMenu) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".space-actions-menu-wrap, .space-actions-menu")) setOpenMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    const closeOnMove = () => setOpenMenu(null);
    document.addEventListener("scroll", closeOnMove, true);
    window.addEventListener("resize", closeOnMove);
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("scroll", closeOnMove, true);
      window.removeEventListener("resize", closeOnMove);
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
      const res = await createServer(token, "", newName.trim(), newNavTabs, newChatTypes);
      const originInviteUrl = `${window.location.origin}/s/${res.slug}/setup?token=${new URL(res.invite_url).searchParams.get("token") || ""}`;
      setCreateResult({
        inviteUrl: originInviteUrl,
        name: res.name,
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

  const handleOpenInvite = async (s: ServerRecord) => {
    if (!token) return;
    try {
      const inviteUrl = await createInviteLink(token, s.slug);
      const url = new URL(inviteUrl, window.location.origin);
      const fullUrl = `${window.location.origin}${url.pathname}${url.search}`;
      setSpaceInvite({ name: s.name, url: fullUrl });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to generate invite link");
    }
  };

  if (!token) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginCard}>
          <div style={{ marginBottom: 16 }}>
            <StovoLogo size={36} />
          </div>
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
          <StovoLogo size={32} />
          <h1 style={styles.headerTitle}>{copy.title}</h1>
        </div>
        <div style={styles.headerActions}>
          <button
            onClick={() => setIsCreateOpen(true)}
            style={styles.primaryPillButton}
            className="primaryPillButton"
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
            <div style={{ ...styles.statValue, color: "var(--color-palette-0f176030df85)" }} className="statValue">{copy.operational}</div>
          </div>
          <div style={styles.statCard} className="statCard">
            <div style={styles.statLabel} className="statLabel">{copy.advancedMonitoring}</div>
            <div style={{ ...styles.statValue, color: "var(--color-palette-177804c22590)" }} className="statValue">{copy.monitoringDisabled}</div>
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
              {copy.noSpaces} <strong style={{ color: "var(--color-palette-f2074b6cef37)" }}>{copy.createSpace}</strong>
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
                      <td style={{ ...styles.td, fontWeight: "var(--font-weight-bold)", color: "var(--color-palette-f2074b6cef37)" }} className="td">{s.name}</td>
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
                            onClick={() => void handleOpenInvite(s)}
                            title={copy.inviteFor(s.name)}
                            style={styles.iconActionButton}
                            className="iconActionButton"
                            aria-label={copy.inviteFor(s.name)}
                          >
                            <UserPlus size={19} aria-hidden="true" />
                          </button>
                          <div className="space-actions-menu-wrap">
                            <button type="button" style={styles.iconActionButton} className="iconActionButton" aria-label={copy.actionsFor(s.name)} aria-haspopup="menu" aria-expanded={openMenu === s.slug} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setMenuPosition({ top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 110)), right: Math.max(8, window.innerWidth - rect.right) }); setOpenMenu(openMenu === s.slug ? null : s.slug); }}><MoreVertical size={20} aria-hidden="true" /></button>
                            {openMenu === s.slug && createPortal(<div className="space-actions-menu" role="menu" style={menuPosition}>
                              <button type="button" role="menuitem" onClick={() => { setOpenMenu(null); void handleCopyGhostToken(s.slug); }}><KeyRound size={16} />{copy.ghostToken}</button>
                              <button type="button" role="menuitem" className="danger" onClick={() => { setOpenMenu(null); void handleDelete(s.slug); }}><Trash2 size={16} />{copy.delete}</button>
                            </div>, document.body)}
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
        <PopupDialog className="multi-admin-dialog" ariaLabelledBy="space-settings-title" onClose={savingSettings ? undefined : () => setEditingServer(null)} closeOnBackdrop={!savingSettings} closeOnEscape={false} size="lg">
            <h2 id="space-settings-title" style={{ ...styles.title, marginBottom: 16 }}>{copy.spaceSettings}</h2>

            <form onSubmit={handleSaveSettings} style={styles.form}>
              <div className="supervisor-settings-tabs" role="tablist" aria-label={copy.spaceSettings}>
                {([['general', copy.generalTab], ['ai', strings.admin.serverSettings.aiFunctions], ['chats', strings.admin.rbac.supervisorChatTypes], ['premium', strings.admin.encryption.premium]] as const).map(([id, label]) => <button type="button" role="tab" aria-selected={settingsTab === id} className={settingsTab === id ? "active" : ""} key={id} onClick={() => setSettingsTab(id)}>{label}</button>)}
              </div>

              <div className="supervisor-settings-tab-panel" role="tabpanel">
                {settingsTab === "general" && <PopupField label={copy.spaceName} type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required />}
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
                <PopupButton type="button" variant="secondary" onClick={() => setEditingServer(null)} disabled={savingSettings}>
                  {copy.cancel}
                </PopupButton>
                <PopupButton type="submit" variant="primary" disabled={savingSettings} className="supervisor-save-settings-button">
                  {savingSettings ? copy.saving : copy.save}
                </PopupButton>
              </div>
            </form>
        </PopupDialog>
      )}

      {/* Create Modal */}
      {isCreateOpen && (
        <PopupDialog className="multi-admin-dialog" ariaLabelledBy="create-space-title" onClose={() => { setCreateResult(null); setIsCreateOpen(false); }} size="md">
            <h2 id="create-space-title">{copy.createSpaceTitle}</h2>
            <p>
              {copy.createDescription}
            </p>

            {createResult ? (
              <div style={styles.resultBox}>
                <div style={{ fontWeight: "var(--font-weight-bold)", color: "var(--color-palette-0f176030df85)", marginBottom: 8, fontSize: "var(--font-size-small)" }}>
                  {copy.provisioned}
                </div>
                <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-palette-177804c22590)", marginBottom: 12 }}>
                  {copy.ownerInviteReady}
                </p>
                <div style={{ display: "flex", gap: 10, flexDirection: "column" }}>
                  <PopupButton
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setSpaceInvite({ name: createResult.name, url: createResult.inviteUrl });
                    }}
                  >
                    {copy.copyInviteLink}
                  </PopupButton>
                  <PopupButton
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setCreateResult(null);
                      setIsCreateOpen(false);
                    }}
                  >
                    {copy.close}
                  </PopupButton>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate} style={styles.form}>
                <PopupField
                    label={copy.spaceName}
                    type="text"
                    placeholder={copy.namePlaceholder}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                    required
                  />
                <section aria-label={copy.featureSetup}>
                  <p className="supervisor-settings-help">{copy.featureSetup}</p>
                  {([["chats", strings.nav.chats], ["storage", strings.nav.storage], ["plans", strings.nav.plans], ["settings", strings.nav.settings]] as const).map(([key, label]) => <label className="supervisor-setting-row" key={key}><span><strong>{label}</strong></span><input type="checkbox" checked={newNavTabs[key]} onChange={(event) => setNewNavTabs((current) => ({ ...current, [key]: event.target.checked }))} /></label>)}
                  {([["direct", strings.admin.rbac.directMessages], ["group", strings.admin.rbac.groupChats], ["channel", strings.admin.rbac.textChannels], ["voice", strings.admin.rbac.voiceChats]] as const).map(([key, label]) => <label className="supervisor-setting-row" key={key}><span><strong>{label}</strong><small>{copy.chatsHelp}</small></span><input type="checkbox" checked={newChatTypes[key]} onChange={(event) => setNewChatTypes((current) => ({ ...current, [key]: event.target.checked }))} /></label>)}
                </section>

                <div style={styles.modalActions}>
                  <PopupButton
                    type="button"
                    variant="secondary"
                    onClick={() => setIsCreateOpen(false)}
                  >
                    {copy.cancel}
                  </PopupButton>
                  <PopupButton type="submit" variant="primary" className="supervisor-provision-button">
                    {copy.provisionServer}
                  </PopupButton>
                </div>
              </form>
            )}
        </PopupDialog>
      )}
      {spaceInvite && (
        <InviteModal
          familyName={spaceInvite.name}
          inviteUrl={spaceInvite.url}
          open={Boolean(spaceInvite)}
          onClose={() => setSpaceInvite(null)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    backgroundColor: "var(--color-palette-7b2817bf9b80)",
    color: "var(--color-palette-8c857e7d938d)",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
  },
  loginContainer: {
    display: "flex",
    minHeight: "100vh",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "var(--color-palette-7b2817bf9b80)",
    padding: 20,
  },
  loginCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "var(--color-palette-95b1a9665923)",
    border: "1px solid var(--color-palette-c34f5a2a4d80)",
    borderRadius: "var(--radius-panel)",
    padding: 36,
    boxShadow: "0 25px 60px var(--color-palette-2101efd095aa)",
  },
  badgePill: {
    display: "inline-block",
    padding: "4px 12px",
    borderRadius: "var(--radius-pill)",
    backgroundColor: "var(--surface-card, var(--color-palette-95b1a9665923))",
    color: "var(--text-secondary, var(--color-palette-177804c22590))",
    fontSize: "var(--font-size-micro)",
    fontWeight: "var(--font-weight-bold)",
    letterSpacing: "0.5px",
    marginBottom: 12,
    border: "1px solid var(--border-default, var(--color-palette-c34f5a2a4d80))",
  },
  title: {
    fontSize: "var(--font-size-heading)",
    fontWeight: "var(--font-weight-extrabold)",
    margin: "0 0 6px 0",
    letterSpacing: "-0.5px",
    color: "var(--color-palette-f2074b6cef37)",
  },
  subtitle: {
    fontSize: "var(--font-size-small)",
    color: "var(--color-palette-177804c22590)",
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
    color: "var(--color-palette-9643a6d44ff3)",
  },
  inputPill: {
    padding: "12px 20px",
    backgroundColor: "var(--color-palette-47ed8310ca0c)",
    border: "1px solid var(--color-palette-d635c939daff)",
    borderRadius: "var(--radius-pill)",
    color: "var(--color-palette-f2074b6cef37)",
    fontSize: "var(--font-size-small)",
    outline: "none",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  primaryPillButton: {
    padding: "12px 24px",
    background: "var(--color-brand-gradient)",
    color: "var(--color-palette-f2074b6cef37)",
    border: "none",
    borderRadius: "var(--radius-pill)",
    fontWeight: "var(--font-weight-bold)",
    fontSize: "var(--font-size-small)",
    cursor: "pointer",
    boxShadow: "0 4px 14px var(--color-palette-9bd3ad92fa9e)",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  secondaryPillButton: {
    padding: "12px 24px",
    backgroundColor: "var(--color-palette-47ed8310ca0c)",
    color: "var(--color-palette-bfd4f8ffcad7)",
    border: "1px solid var(--color-palette-d635c939daff)",
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
    backgroundColor: "var(--color-palette-47ed8310ca0c)",
    color: "var(--color-palette-bfd4f8ffcad7)",
    border: "1px solid var(--color-palette-d635c939daff)",
    borderRadius: "var(--radius-pill)",
    cursor: "pointer",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  errorBox: {
    padding: 14,
    backgroundColor: "var(--color-palette-a6f391cd38f2)",
    border: "1px solid var(--color-palette-774f5df9b3a3)",
    borderRadius: "var(--radius-surface)",
    color: "var(--color-palette-1a75dc9e3972)",
    fontSize: "var(--font-size-caption)",
    marginBottom: 16,
    lineHeight: 1.4,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 28px",
    borderBottom: "1px solid var(--color-palette-c34f5a2a4d80)",
    backgroundColor: "var(--color-palette-c2081841e010)",
  },
  headerTitleGroup: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  headerTitle: {
    fontSize: "var(--font-size-heading)",
    fontWeight: "var(--font-weight-extrabold)",
    margin: 0,
    color: "var(--color-palette-f2074b6cef37)",
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
    backgroundColor: "var(--color-palette-95b1a9665923)",
    border: "1px solid var(--color-palette-c34f5a2a4d80)",
    borderRadius: "var(--radius-panel)",
    padding: 24,
    boxShadow: "0 10px 30px var(--color-palette-4c85ca9b7179)",
    transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease",
  },
  statLabel: {
    fontSize: "var(--font-size-caption)",
    fontWeight: "var(--font-weight-medium)",
    color: "var(--color-palette-177804c22590)",
    marginBottom: 8,
  },
  statValue: {
    fontSize: "var(--font-size-heading)",
    fontWeight: "var(--font-weight-extrabold)",
    color: "var(--color-palette-f2074b6cef37)",
  },
  panelCard: {
    backgroundColor: "var(--color-palette-95b1a9665923)",
    border: "1px solid var(--color-palette-c34f5a2a4d80)",
    borderRadius: "var(--radius-panel)",
    padding: 32,
    boxShadow: "0 20px 40px var(--color-palette-f71fbab13810)",
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
    color: "var(--color-palette-f2074b6cef37)",
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
    color: "var(--color-palette-66341b70b395)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  tr: {
    backgroundColor: "var(--color-palette-47ed8310ca0c)",
    borderRadius: "var(--radius-bubble)",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  td: {
    padding: "18px 20px",
    fontSize: "var(--font-size-small)",
    color: "var(--color-palette-9643a6d44ff3)",
  },
  linkPill: {
    display: "inline-flex",
    alignItems: "center",
    backgroundColor: "var(--surface-card, var(--color-palette-95b1a9665923))",
    color: "var(--text-primary, var(--color-palette-f2074b6cef37))",
    border: "1px solid var(--border-default, var(--color-palette-c34f5a2a4d80))",
    padding: "6px 14px",
    borderRadius: "var(--radius-pill)",
    fontFamily: "var(--font-family-mono, monospace)",
    fontSize: "var(--font-size-caption)",
    fontWeight: "var(--font-weight-semibold)",
    textDecoration: "none",
    transition: "none",
  },
  statusPill: {
    padding: "6px 14px",
    borderRadius: "var(--radius-pill)",
    backgroundColor: "color-mix(in srgb, var(--success, var(--color-palette-0f176030df85)) 15%, transparent)",
    color: "var(--success, var(--color-palette-0f176030df85))",
    border: "1px solid color-mix(in srgb, var(--success, var(--color-palette-0f176030df85)) 30%, transparent)",
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
    border: "1px solid var(--color-palette-7efb07d2be54)",
    borderRadius: "var(--radius-circle)",
    backgroundColor: "var(--color-palette-e6505b2c1235)",
    color: "var(--color-palette-5fb433fc7bea)",
    cursor: "pointer",
  },
  invitePillButton: {
    padding: "8px 18px",
    backgroundColor: "var(--accent-soft)",
    color: "var(--accent-primary)",
    border: "1px solid var(--accent-border-soft)",
    borderRadius: "var(--radius-pill)",
    fontSize: "var(--font-size-caption)",
    fontWeight: "var(--font-weight-bold)",
    cursor: "pointer",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  ghostPillButton: {
    padding: "8px 18px",
    backgroundColor: "transparent",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
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
    backgroundColor: "var(--danger-soft)",
    color: "var(--danger)",
    border: "1px solid var(--danger)",
    borderRadius: "var(--radius-pill)",
    cursor: "pointer",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  emptyState: {
    textAlign: "center",
    padding: 60,
    color: "var(--color-palette-177804c22590)",
    fontSize: "var(--font-size-small)",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 24,
  },
  resultBox: {
    backgroundColor: "var(--color-palette-47ed8310ca0c)",
    border: "1px solid var(--color-palette-c34f5a2a4d80)",
    padding: 20,
    borderRadius: "var(--radius-panel)",
  },
  settingsPillButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "8px 18px",
    backgroundColor: "var(--accent-soft)",
    color: "var(--accent-primary)",
    border: "1px solid var(--accent-border-soft)",
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
    backgroundColor: "var(--accent-soft)",
    color: "var(--accent-primary)",
    border: "1px solid var(--accent-border-soft)",
  },
  tabBadgeInactive: {
    fontSize: "var(--font-size-caption)",
    fontWeight: "var(--font-weight-semibold)",
    padding: "3px 8px",
    borderRadius: "var(--radius-pill)",
    backgroundColor: "var(--color-palette-0c501f182ba9)",
    color: "var(--color-palette-66341b70b395)",
    border: "1px solid var(--color-palette-c34f5a2a4d80)",
    textDecoration: "line-through",
  },
  tabsConfigCard: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    backgroundColor: "var(--color-palette-47ed8310ca0c)",
    border: "1px solid var(--color-palette-c34f5a2a4d80)",
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
    color: "var(--color-palette-f2074b6cef37)",
  },
  tabToggleDesc: {
    fontSize: "var(--font-size-caption)",
    color: "var(--color-palette-177804c22590)",
    marginTop: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    accentColor: "var(--color-palette-b51de63d0eac)",
    cursor: "pointer",
  },
  toast: {
    position: "fixed",
    bottom: 32,
    right: 32,
    backgroundColor: "var(--color-palette-95b1a9665923)",
    color: "var(--color-palette-f2074b6cef37)",
    border: "1px solid var(--color-palette-670e494f8dfd)",
    padding: "14px 24px",
    borderRadius: "var(--radius-pill)",
    boxShadow: "0 15px 30px var(--color-palette-2101efd095aa)",
    zIndex: 1100,
    fontWeight: "var(--font-weight-semibold)",
    fontSize: "var(--font-size-small)",
  },
};
