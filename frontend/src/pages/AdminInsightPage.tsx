import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError, getClusterPath, getClusterPrefix } from "../api/client";
import { Family } from "../api/family";
import { useAuth } from "../auth/AuthContext";
import AppNav from "./AppNav";
import { BackButton } from "../components/BackButton";
import { showToast } from "../components/ToastViewport";
import { useStrings } from "../i18n/LanguageContext";
import {
  loadIntelligenceConnections,
  revokeIntelligenceConnection,
  type IntelligenceConnection
} from "../api/intelligence";

export default function AdminInsightPage() {
  const strings = useStrings();
  const copy = strings.admin.insight;
  const { accessToken, authRequest, currentUser } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [connections, setConnections] = useState<IntelligenceConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevoking, setIsRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (notice) showToast(notice);
  }, [notice]);

  const canViewAdmin =
    currentUser?.role === "owner" ||
    currentUser?.permissions?.includes("manage_integrations") === true ||
    currentUser?.permissions?.includes("manage_server") === true;
  const prefix = getClusterPrefix();

  const loadData = useCallback(async () => {
    if (!accessToken || !canViewAdmin) return;
    setIsLoading(true);
    setError(null);
    try {
      const [familyResult, connectionsResult] = await Promise.all([
        authRequest<Family>("/api/family").catch(() => null),
        loadIntelligenceConnections(authRequest).catch(() => ({ connections: [] }))
      ]);
      if (familyResult) setFamily(familyResult);
      setConnections(connectionsResult.connections ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : copy.couldNotLoad);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authRequest, canViewAdmin, copy.couldNotLoad]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeSpaceConnection = connections.find(
    (conn) => conn.revoked_at === null && (conn.scope_kind === "space" || !conn.chat_id)
  ) ?? connections.find((conn) => conn.revoked_at === null);

  const isConnected = Boolean(activeSpaceConnection);

  async function handleDisconnect() {
    if (!activeSpaceConnection) return;
    if (!window.confirm(copy.disconnectConfirmation)) return;
    setIsRevoking(true);
    setError(null);
    try {
      await revokeIntelligenceConnection(authRequest, activeSpaceConnection.id, "connection");
      setNotice(copy.disconnectedSuccessfully);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : copy.couldNotLoad);
    } finally {
      setIsRevoking(false);
    }
  }

  const consentLink = `${getClusterPath("/intelligence/consent")}?flow=source_v2&scope_kind=space`;

  return (
    <main className="app-shell app-frame admin-page admin-detail-page">
      <AppNav />
      <section className="page-surface admin-surface">
        <div className="admin-detail-header">
          <BackButton to={`${prefix}/app/admin`} className="mobile-back-button" ariaLabel={strings.admin.backToAdmin} />
          <div>
            <h1>{copy.title}</h1>
            <p className="muted-text">{copy.description}</p>
          </div>
        </div>

        {!canViewAdmin && <p className="error-text">{copy.adminAccessRequired}</p>}
        {error && <p className="error-text" role="alert">{error}</p>}

        {canViewAdmin && accessToken && (
          <section className="admin-panel mcp-section-box stovo-insight-panel">
            <div className="insight-status-card">
              <div className="insight-status-header">
                <div className="insight-status-heading">
                  <span className="mcp-mode-kicker">{family?.name ?? copy.thisSpace}</span>
                  <h3>{copy.knowledgeBaseStatus}</h3>
                  <small className="muted-text">{copy.sourceV2Consent}</small>
                </div>
                <span className={`mcp-status-pill ${isConnected ? "is-connected" : "is-disabled"}`}>
                  {isConnected ? copy.connected : copy.notConnected}
                </span>
              </div>

              <div className="insight-status-body">
                <p className="muted-text">{copy.spaceScopeDescription}</p>

                {activeSpaceConnection && (
                  <div className="insight-connection-meta">
                    <div className="insight-meta-row">
                      <span className="insight-meta-label">{copy.connectionScope}:</span>
                      <strong>{activeSpaceConnection.scope_kind === "space" ? copy.allSpaceScope : activeSpaceConnection.chat_title}</strong>
                    </div>
                    <div className="insight-meta-row">
                      <span className="insight-meta-label">{copy.connectedAt}:</span>
                      <span>{new Date(activeSpaceConnection.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="insight-meta-row">
                      <span className="insight-meta-label">{copy.expiresAt}:</span>
                      <span>{new Date(activeSpaceConnection.expires_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                )}

                <div className="insight-sync-status-row">
                  <div className="insight-sync-label-group">
                    <span className="ms-icon ms-icon--20" aria-hidden="true">sync</span>
                    <div>
                      <strong>{copy.syncStatus}</strong>
                      <p className="muted-text">{isConnected ? copy.syncActive : copy.syncDisabled}</p>
                    </div>
                  </div>
                  <span className={`mcp-status-dot ${isConnected ? "is-connected" : "is-disabled"}`} />
                </div>
              </div>

              <div className="public-access-actions insight-actions-row">
                {isConnected ? (
                  <button
                    type="button"
                    className="danger-button"
                    disabled={isRevoking || isLoading}
                    onClick={() => void handleDisconnect()}
                  >
                    {isRevoking ? copy.disconnecting : copy.disconnectSpace}
                  </button>
                ) : (
                  <Link to={consentLink} className="primary-button insight-connect-button">
                    {copy.connectSpace}
                  </Link>
                )}
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
