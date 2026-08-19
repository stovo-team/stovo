import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError, getClusterPrefix } from "../api/client";
import { Family } from "../api/family";
import { useAuth } from "../auth/AuthContext";
import AppNav from "./AppNav";
import { useStrings } from "../i18n/LanguageContext";

export default function AdminAppearancePage() {
  const strings = useStrings();
  const { accessToken, authRequest, currentUser } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const canViewAdmin = currentUser?.role === "owner" || currentUser?.role === "admin";
  const prefix = getClusterPrefix();

  const load = useCallback(async () => {
    if (!accessToken || !canViewAdmin) return;
    setError(null);
    try {
      const familyResult = await authRequest<Family>("/api/family");
      setFamily(familyResult);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not load appearance settings");
    }
  }, [accessToken, authRequest, canViewAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateMinimizedChatLayout(minimizedChatLayout: boolean) {
    if (!accessToken) return;
    setError(null);
    setNotice(null);
    setIsSaving(true);
    try {
      const updated = await authRequest<Family>("/api/family", {
        method: "PATCH",
        body: { minimizedChatLayout }
      });
      setFamily(updated);
      setNotice(strings.admin.appearance.saved);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not save chat layout");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="app-shell app-frame admin-page admin-detail-page">
      <AppNav />
      <section className="page-surface admin-surface">
        <div className="admin-detail-header">
          <Link to={`${prefix}/app/admin`} className="mobile-back-button" aria-label={strings.admin.backToAdmin}>
            <span className="ms-icon ms-icon--22" aria-hidden="true">
              arrow_back
            </span>
          </Link>
          <div>
            <h1>{strings.admin.appearance.title}</h1>
          </div>
        </div>

        {!canViewAdmin && <p className="error-text">{strings.admin.adminAccessRequired}</p>}
        {error && <p className="error-text">{error}</p>}
        {notice && <p className="success-text">{notice}</p>}

        {canViewAdmin && (
          <section className="appearance-settings-panel admin-panel">
            <div className="public-access-header">
              <h2>{strings.admin.appearance.chatLayout}</h2>
              <span className="admin-status-chip">{family?.minimizedChatLayout ? "Minimized" : "Full"}</span>
            </div>
            <label className="appearance-setting-row">
              <span>
                <strong>{strings.admin.appearance.minimizedLayout}</strong>
                <small>
                  {strings.admin.appearance.minimizedLayoutDesc}
                </small>
              </span>
              <input
                type="checkbox"
                checked={family?.minimizedChatLayout ?? false}
                disabled={!family || isSaving}
                onChange={(event) => void updateMinimizedChatLayout(event.target.checked)}
              />
            </label>
          </section>
        )}
      </section>
    </main>
  );
}

