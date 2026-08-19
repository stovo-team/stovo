import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { AdminMessageEncryptionProtocol, EncryptionSettings } from "../api/admin";
import { ApiError, getClusterPrefix } from "../api/client";
import { Family } from "../api/family";
import { useAuth } from "../auth/AuthContext";
import AppNav from "./AppNav";
import { useStrings } from "../i18n/LanguageContext";

export default function AdminEncryptionPage() {
  const strings = useStrings();
  const { accessToken, authRequest, currentUser } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [encryptionSettings, setEncryptionSettings] = useState<EncryptionSettings | null>(null);
  const [encryptionProtocolDraft, setEncryptionProtocolDraft] =
    useState<AdminMessageEncryptionProtocol>("server_at_rest");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const canViewAdmin = currentUser?.role === "owner" || currentUser?.role === "admin";
  const prefix = getClusterPrefix();

  const load = useCallback(async () => {
    if (!accessToken || !canViewAdmin) return;
    setError(null);
    try {
      const [familyResult, encryptionResult] = await Promise.all([
        authRequest<Family>("/api/family"),
        authRequest<EncryptionSettings>("/api/admin/encryption-settings")
      ]);
      setFamily(familyResult);
      setEncryptionSettings(encryptionResult);
      setEncryptionProtocolDraft(encryptionResult.defaultMessageEncryptionProtocol);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not load encryption settings");
    }
  }, [accessToken, authRequest, canViewAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveEncryptionSettings(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setError(null);
    setNotice(null);
    setIsSaving(true);
    try {
      const updated = await authRequest<EncryptionSettings>("/api/admin/encryption-settings", {
        method: "PUT",
        body: { defaultMessageEncryptionProtocol: encryptionProtocolDraft }
      });
      setEncryptionSettings(updated);
      setEncryptionProtocolDraft(updated.defaultMessageEncryptionProtocol);
      setNotice(strings.admin.encryption.saved);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not save encryption settings");
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
            <h1>{strings.admin.encryption.title}</h1>
          </div>
        </div>

        {!canViewAdmin && <p className="error-text">{strings.admin.adminAccessRequired}</p>}
        {error && <p className="error-text">{error}</p>}
        {notice && <p className="success-text">{notice}</p>}

        {canViewAdmin && (
          <section className="encryption-settings-panel admin-panel">
            <div className="public-access-header">
              <h2>{strings.admin.encryption.protocol}</h2>
              <span className="admin-status-chip">
                {encryptionSettings?.supportedProtocols.find((protocol) => protocol.value === encryptionProtocolDraft)
                  ?.label ?? "Server-side"}
              </span>
            </div>
            <form className="encryption-settings-form" onSubmit={saveEncryptionSettings}>
              <label>
                {strings.admin.encryption.protocolDesc}
                <select
                  value={encryptionProtocolDraft}
                  onChange={(event) =>
                    setEncryptionProtocolDraft(event.target.value as AdminMessageEncryptionProtocol)
                  }
                >
                  {(encryptionSettings?.supportedProtocols ?? []).map((protocol) => (
                    <option key={protocol.value} value={protocol.value}>
                      {protocol.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="encryption-protocol-list" role="listbox" aria-label={strings.admin.encryption.protocol}>
                {(encryptionSettings?.supportedProtocols ?? []).map((protocol) => (
                  <button
                    type="button"
                    className={`encryption-protocol-option${
                      protocol.value === encryptionProtocolDraft ? " is-active" : ""
                    }`}
                    key={protocol.value}
                    role="option"
                    aria-selected={protocol.value === encryptionProtocolDraft}
                    onClick={() => setEncryptionProtocolDraft(protocol.value)}
                  >
                    <span className="encryption-protocol-radio" aria-hidden="true" />
                    <span className="encryption-protocol-copy">
                      <strong>{protocol.label}</strong>
                      <small>{protocol.description}</small>
                    </span>
                  </button>
                ))}
              </div>
              <button type="submit" className="encryption-save-button" disabled={isSaving}>
                {isSaving ? "Saving…" : strings.admin.encryption.save}
              </button>
            </form>
          </section>
        )}
      </section>
    </main>
  );
}

