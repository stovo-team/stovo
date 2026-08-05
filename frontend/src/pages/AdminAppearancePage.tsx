import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../api/client";
import { Family } from "../api/family";
import { useAuth } from "../auth/AuthContext";
import AppNav from "./AppNav";

export default function AdminAppearancePage() {
  const { accessToken, authRequest, currentUser } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const canViewAdmin = currentUser?.role === "owner" || currentUser?.role === "admin";

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
      setNotice("Chat layout saved for everyone");
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
          <Link to="/app/admin" className="mobile-back-button" aria-label="Back to Admin">
            <span className="ms-icon ms-icon--22" aria-hidden="true">
              arrow_back
            </span>
          </Link>
          <div>
            <h1>Appearance</h1>
          </div>
        </div>

        {!canViewAdmin && <p className="error-text">Admin access required.</p>}
        {error && <p className="error-text">{error}</p>}
        {notice && <p className="success-text">{notice}</p>}

        {canViewAdmin && (
          <section className="appearance-settings-panel admin-panel">
            <div className="public-access-header">
              <h2>Chat list</h2>
              <span className="admin-status-chip">{family?.minimizedChatLayout ? "Minimized" : "Full"}</span>
            </div>
            <label className="appearance-setting-row">
              <span>
                <strong>Minimized chat layout</strong>
                <small>
                  Shows avatars or chat icons and names, without the latest-message preview. This applies to every
                  frontend on this server.
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
