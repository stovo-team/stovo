import React, { useEffect, useState } from "react";
import {
  createInviteLink,
  createServer,
  deleteServer,
  fetchServers,
  getGhostToken,
  masterLogin,
  updateServerSettings,
  ServerRecord,
} from "../api/masterAdmin";
import { useStrings } from "../i18n/LanguageContext";

export default function MultiAdminPage() {
  const strings = useStrings();
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("master_admin_token")
  );
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("changeme_master_pass");
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

  const loadServers = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchServers(token);
      setServers(data || []);
    } catch (err: any) {
      setError(err.message || "Failed to load spaces");
      if (err.message?.includes("token") || err.message?.includes("Unauthorized")) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    try {
      const authToken = await masterLogin(username, password);
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
      showToast(`Space "${res.name}" provisioned cleanly!`);
    } catch (err: any) {
      alert(err.message || "Failed to create space");
    }
  };

  const handleOpenSettings = async (s: ServerRecord) => {
    setEditingServer(s);
    setEditName(s.name);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingServer) return;
    setSavingSettings(true);
    try {
      const updated = await updateServerSettings(token, editingServer.slug, {
        name: editName.trim(),
      });
      setServers((prev) =>
        prev.map((s) => (s.slug === editingServer.slug ? { ...s, ...updated } : s))
      );
      showToast(`Space settings for "${updated.name || editingServer.name}" saved!`);
      setEditingServer(null);
    } catch (err: any) {
      alert(err.message || "Failed to update space settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDelete = async (slug: string) => {
    if (!token) return;
    if (!confirm(`Are you sure you want to delete space "${slug}"? This will drop its database and stop its container.`)) {
      return;
    }
    try {
      await deleteServer(token, slug);
      showToast(`Space "${slug}" deleted.`);
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
      showToast(`Ghost Superadmin token for "${slug}" copied to clipboard!`);
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
      showToast(`Single-use invite link for "${slug}" copied to clipboard!`);
    } catch (err: any) {
      alert(err.message || "Failed to generate invite link");
    }
  };

  if (!token) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginCard}>
          <div style={styles.badgePill}>CLUSTER SUPERVISOR</div>
          <h1 style={styles.title}>Stovo Supervisor</h1>
          <p style={styles.subtitle}>Sign in to manage spaces and root infrastructure</p>

          {loginError && <div style={styles.errorBox}>{loginError}</div>}

          <form onSubmit={handleLogin} style={styles.form}>
            <label style={styles.label}>
              Username
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={styles.inputPill}
                required
              />
            </label>
            <label style={styles.label}>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.inputPill}
                required
              />
            </label>
            <button type="submit" style={styles.primaryPillButton}>
              Login to Master Console
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {toast && <div style={styles.toast}>{toast}</div>}

      <header style={styles.header}>
        <div style={styles.headerTitleGroup}>
          <div style={styles.badgePill}>CLUSTER SUPERVISOR</div>
          <h1 style={styles.headerTitle}>Stovo Spaces</h1>
        </div>
        <div style={styles.headerActions}>
          <button
            onClick={() => setIsCreateOpen(true)}
            style={styles.primaryPillButton}
          >
            + Create New Space
          </button>
          <button onClick={handleLogout} style={styles.secondaryPillButton}>
            Logout
          </button>
        </div>
      </header>

      <main style={styles.main}>
        {/* Stats Row */}
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Active Spaces</div>
            <div style={styles.statValue}>{servers.length}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>System Status</div>
            <div style={{ ...styles.statValue, color: "#34d399" }}>Operational</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Advanced Monitoring</div>
            <div style={styles.monitoringStatus}>
              <button type="button" style={styles.monitoringDisabledButton} disabled>Monitoring disabled</button>
              <span className="premium-feature-badge">Premium</span>
            </div>
          </div>
        </div>

        {/* Server List */}
        <div style={styles.panelCard}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Provisioned Spaces</h2>
            <button
              onClick={loadServers}
              title="Refresh Spaces"
              style={styles.iconOnlyButton}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
              </svg>
            </button>
          </div>

          {loading ? (
            <div style={styles.emptyState}>Loading spaces from orchestrator...</div>
          ) : error ? (
            <div style={styles.errorBox}>{error}</div>
          ) : servers.length === 0 ? (
            <div style={styles.emptyState}>
              No spaces created yet. Click <strong style={{ color: "#60a5fa" }}>+ Create New Space</strong> to provision one.
            </div>
          ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>ID</th>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Space Link</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Created At</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {servers.map((s: ServerRecord) => (
                    <tr key={s.id} style={styles.tr}>
                      <td style={styles.td}>#{s.id}</td>
                      <td style={{ ...styles.td, fontWeight: 700, color: "#ffffff" }}>{s.name}</td>
                      <td style={styles.td}>
                        <a
                          href={`/s/${s.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          style={styles.linkPill}
                          title={`Open ${s.name} space in new tab`}
                        >
                          /s/{s.slug}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}>
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                          </svg>
                        </a>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.statusPill}>{s.status || "running"}</span>
                      </td>
                      <td style={styles.td}>
                        {new Date(s.created_at).toLocaleDateString()} {new Date(s.created_at).toLocaleTimeString()}
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actionGroup}>
                          <button
                            onClick={() => handleOpenSettings(s)}
                            title={`Configure ${s.name}`}
                            style={styles.settingsPillButton}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z"/></svg>
                            Settings
                          </button>
                          <button
                            onClick={() => handleCopyInvite(s.slug)}
                            title="Generate and copy fresh single-use invite link"
                            style={styles.invitePillButton}
                          >
                            + Invite
                          </button>
                          <button
                            onClick={() => handleCopyGhostToken(s.slug)}
                            title="Copy short-lived Ghost Superadmin JWT"
                            style={styles.ghostPillButton}
                          >
                            Ghost Token
                          </button>
                          <button
                            onClick={() => handleDelete(s.slug)}
                            title={`Delete space ${s.name}`}
                            style={styles.dangerIconButton}
                          >
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              <line x1="10" y1="11" x2="10" y2="17"></line>
                              <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                          </button>
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
        <div style={styles.modalOverlay} onMouseDown={(event) => { if (event.target === event.currentTarget && !savingSettings) setEditingServer(null); }}>
          <div style={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="space-settings-title">
            <button type="button" style={styles.modalCloseButton} aria-label="Close settings" onClick={() => setEditingServer(null)} disabled={savingSettings}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m18 6-12 12M6 6l12 12"/></svg></button>
            <div style={styles.badgePill}>SPACE SETTINGS</div>
            <h3 id="space-settings-title" style={styles.modalTitle}>{editingServer.name}</h3>
            <p style={styles.modalSubtitle}>
              Manage this space.
            </p>

            <form onSubmit={handleSaveSettings} style={styles.form}>
              <label style={styles.label}>
                Space Name
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={styles.inputPill}
                  required
                />
              </label>

              <section style={{ marginTop: 8 }} aria-labelledby="supervisor-chat-types-title">
                <div style={{ ...styles.label, marginBottom: 10 }}>
                  <span id="supervisor-chat-types-title">{strings.admin.rbac.supervisorChatTypes}</span>
                  <span style={styles.tabToggleDesc}>{strings.admin.rbac.supervisorChatTypesDesc}</span>
                </div>
                <div style={styles.tabsConfigCard}>
                  {[strings.admin.rbac.directMessages, strings.admin.rbac.groupChats, strings.admin.rbac.textChannels, strings.admin.rbac.voiceChats].map((chatType) => <div key={chatType} style={styles.tabToggleRow}>
                    <span style={styles.tabToggleTitle}>{chatType}</span>
                    <span className="premium-feature-badge">{strings.admin.encryption.premium}</span>
                  </div>)}
                </div>
              </section>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setEditingServer(null)}
                  style={styles.secondaryPillButton}
                  disabled={savingSettings}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={styles.primaryPillButton}
                  disabled={savingSettings}
                >
                  {savingSettings ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {isCreateOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3 style={styles.modalTitle}>Provision New Space</h3>
            <p style={styles.modalSubtitle}>
              Spins up a dedicated space environment with isolated backend, database, and storage.
            </p>

            {createResult ? (
              <div style={styles.resultBox}>
                <div style={{ fontWeight: 700, color: "#34d399", marginBottom: 8, fontSize: 15 }}>
                  Space Provisioned
                </div>
                <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 12 }}>
                  Admin account created. You can log in directly or share the invite link:
                </p>
                <div style={{ backgroundColor: "#1c1c1e", padding: 14, borderRadius: 16, marginBottom: 14, fontSize: 13 }}>
                  <div><strong>Username:</strong> {createResult.adminUser}</div>
                  <div><strong>Password:</strong> {createResult.adminPassword}</div>
                </div>
                <div style={{ display: "flex", gap: 10, flexDirection: "column" }}>
                  <a
                    href={createResult.clusterUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ ...styles.primaryPillButton, textDecoration: "none", textAlign: "center" }}
                  >
                    Open Space Login
                  </a>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createResult.inviteUrl);
                      showToast("Invite link copied to clipboard!");
                    }}
                    style={styles.secondaryPillButton}
                  >
                    Copy Invite Link
                  </button>
                  <button
                    onClick={() => {
                      setCreateResult(null);
                      setIsCreateOpen(false);
                    }}
                    style={{ ...styles.secondaryPillButton, marginTop: 8 }}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate} style={styles.form}>
                <label style={styles.label}>
                  Space Name
                  <input
                    type="text"
                    placeholder="e.g. Awesome Corp"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    style={styles.inputPill}
                    autoFocus
                    required
                  />
                </label>
                <label style={styles.label}>
                  Admin Nickname
                  <input
                    type="text"
                    value={adminUser}
                    onChange={(e) => setAdminUser(e.target.value)}
                    style={styles.inputPill}
                    required
                  />
                </label>
                <label style={styles.label}>
                  Admin Password
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
                    Cancel
                  </button>
                  <button type="submit" style={styles.primaryPillButton}>
                    Provision Server
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
    borderRadius: 28,
    padding: 36,
    boxShadow: "0 25px 60px rgba(0, 0, 0, 0.8)",
  },
  badgePill: {
    display: "inline-block",
    padding: "6px 14px",
    borderRadius: 999,
    backgroundColor: "rgba(96, 165, 250, 0.12)",
    color: "#60a5fa",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.5px",
    marginBottom: 16,
    border: "1px solid rgba(96, 165, 250, 0.25)",
  },
  title: {
    fontSize: 28,
    fontWeight: 800,
    margin: "0 0 6px 0",
    letterSpacing: "-0.5px",
    color: "#ffffff",
  },
  subtitle: {
    fontSize: 14,
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
    fontSize: 13,
    fontWeight: 600,
    color: "#d1d5db",
  },
  inputPill: {
    padding: "12px 20px",
    backgroundColor: "#2c2c2e",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: 999,
    color: "#ffffff",
    fontSize: 14,
    outline: "none",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  primaryPillButton: {
    padding: "12px 24px",
    backgroundColor: "#3b82f6",
    color: "#ffffff",
    border: "none",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(59, 130, 246, 0.4)",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  secondaryPillButton: {
    padding: "12px 24px",
    backgroundColor: "#2c2c2e",
    color: "#e5e7eb",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: 999,
    fontWeight: 600,
    fontSize: 14,
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
    borderRadius: 999,
    cursor: "pointer",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  errorBox: {
    padding: 14,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: 16,
    color: "#f87171",
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 1.4,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "24px 40px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
    backgroundColor: "#050505",
  },
  headerTitleGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 800,
    margin: 0,
    color: "#ffffff",
    letterSpacing: "-0.5px",
  },
  headerActions: {
    display: "flex",
    gap: 12,
  },
  main: {
    padding: "40px",
    maxWidth: 1200,
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
    borderRadius: 24,
    padding: 24,
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
    transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease",
  },
  statLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: "#9ca3af",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 26,
    fontWeight: 800,
    color: "#ffffff",
  },
  monitoringStatus: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  monitoringDisabledButton: {
    padding: "8px 14px",
    border: "1px solid rgba(255,255,255,.12)",
    borderRadius: 999,
    background: "rgba(255,255,255,.05)",
    color: "#9ca3af",
    fontSize: 13,
    fontWeight: 650,
    cursor: "not-allowed",
  },
  panelCard: {
    backgroundColor: "#1c1c1e",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: 28,
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
    fontSize: 20,
    fontWeight: 800,
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
    fontSize: 12,
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  tr: {
    backgroundColor: "#2c2c2e",
    borderRadius: 20,
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  td: {
    padding: "18px 20px",
    fontSize: 14,
    color: "#d1d5db",
  },
  linkPill: {
    display: "inline-flex",
    alignItems: "center",
    backgroundColor: "rgba(96, 165, 250, 0.12)",
    color: "#93c5fd",
    border: "1px solid rgba(96, 165, 250, 0.25)",
    padding: "6px 16px",
    borderRadius: 999,
    fontFamily: "monospace",
    fontSize: 13,
    fontWeight: 600,
    textDecoration: "none",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  statusPill: {
    padding: "6px 14px",
    borderRadius: 999,
    backgroundColor: "rgba(52, 211, 153, 0.15)",
    color: "#34d399",
    border: "1px solid rgba(52, 211, 153, 0.3)",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.5px",
  },
  actionGroup: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  invitePillButton: {
    padding: "8px 18px",
    backgroundColor: "rgba(52, 211, 153, 0.15)",
    color: "#34d399",
    border: "1px solid rgba(52, 211, 153, 0.3)",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  ghostPillButton: {
    padding: "8px 18px",
    backgroundColor: "rgba(129, 140, 248, 0.15)",
    color: "#a5b4fc",
    border: "1px solid rgba(129, 140, 248, 0.3)",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 700,
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
    borderRadius: 999,
    cursor: "pointer",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  emptyState: {
    textAlign: "center",
    padding: 60,
    color: "#9ca3af",
    fontSize: 15,
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
    borderRadius: 32,
    padding: 36,
    boxShadow: "0 30px 70px rgba(0, 0, 0, 0.9)",
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 800,
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
    width: 36,
    height: 36,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,.12)",
    background: "#2c2c2e",
    color: "#d1d5db",
    cursor: "pointer",
  },
  modalSubtitle: {
    fontSize: 14,
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
    borderRadius: 24,
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
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  tabBadgeGroup: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
  },
  tabBadgeActive: {
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 999,
    backgroundColor: "rgba(52, 211, 153, 0.15)",
    color: "#34d399",
    border: "1px solid rgba(52, 211, 153, 0.3)",
  },
  tabBadgeInactive: {
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 999,
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
    borderRadius: 20,
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
    fontSize: 14,
    fontWeight: 700,
    color: "#ffffff",
  },
  tabToggleDesc: {
    fontSize: 12,
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
    borderRadius: 999,
    boxShadow: "0 15px 30px rgba(0, 0, 0, 0.8)",
    zIndex: 1100,
    fontWeight: 600,
    fontSize: 14,
  },
};
