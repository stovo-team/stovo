import { getClusterPrefix } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import AppNav from "./AppNav";
import { useStrings } from "../i18n/LanguageContext";
import { BackButton } from "../components/BackButton";

export default function AdminEncryptionPage() {
  const strings = useStrings();
  const { currentUser } = useAuth();
  const canViewAdmin = currentUser?.role === "owner" || currentUser?.permissions?.includes("manage_server") === true;
  const prefix = getClusterPrefix();

  return (
    <main className="app-shell app-frame admin-page admin-detail-page">
      <AppNav />
      <section className="page-surface admin-surface">
        <div className="admin-detail-header">
          <BackButton to={`${prefix}/app/admin`} className="mobile-back-button" ariaLabel={strings.admin.backToAdmin} />
          <div>
            <h1>{strings.admin.encryption.title}</h1>
          </div>
        </div>

        {!canViewAdmin && <p className="error-text">{strings.admin.adminAccessRequired}</p>}
        {canViewAdmin && (
          <section className="encryption-settings-panel admin-panel">
            <div className="public-access-header">
              <h2>
                {strings.admin.encryption.protocol}
                <span className="premium-feature-badge">{strings.admin.encryption.premium}</span>
              </h2>
              <span className="admin-status-chip">{strings.admin.encryption.serverAtRest}</span>
            </div>
            <div className="encryption-settings-form">
              <label>
                {strings.admin.encryption.protocolDesc}
                <select value="server_at_rest" disabled>
                  <option value="server_at_rest">{strings.admin.encryption.serverAtRest}</option>
                </select>
              </label>
              <p className="admin-feature-unavailable">{strings.admin.encryption.premiumDesc}</p>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

