import { useCallback, useEffect, useState } from "react";

import { ApiError, getClusterPrefix } from "../api/client";
import { Family } from "../api/family";
import { useAuth } from "../auth/AuthContext";
import MCPConnectorsPanel from "../components/MCPConnectorsPanel";
import AppNav from "./AppNav";
import { BackButton } from "../components/BackButton";
import { useStrings } from "../i18n/LanguageContext";

export default function AdminMcpPage() {
  const strings = useStrings();
  const copy = strings.admin.mcp;
  const { accessToken, authRequest, currentUser } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canViewAdmin = currentUser?.role === "owner" || currentUser?.permissions?.includes("manage_integrations") === true;
  const prefix = getClusterPrefix();

  const load = useCallback(async () => {
    if (!accessToken || !canViewAdmin) return;
    try {
      const familyResult = await authRequest<Family>("/api/family");
      setFamily(familyResult);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : copy.couldNotLoad);
    }
  }, [accessToken, authRequest, canViewAdmin, copy.couldNotLoad]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="app-shell app-frame admin-page admin-detail-page">
      <AppNav />
      <section className="page-surface admin-surface">
        <div className="admin-detail-header">
          <BackButton to={`${prefix}/app/admin`} className="mobile-back-button" ariaLabel={strings.admin.backToAdmin} />
          <div>
            <h1>{copy.title}</h1>
          </div>
        </div>

        {!canViewAdmin && <p className="error-text">{copy.adminAccessRequired}</p>}
        {error && <p className="error-text">{error}</p>}
        {notice && <p className="success-text">{notice}</p>}

        {canViewAdmin && accessToken && (
          <section className="mcp-connectors-admin-section admin-panel">
            <MCPConnectorsPanel
              accessToken={accessToken}
              authRequest={authRequest}
              spaceName={family?.name ?? copy.thisSpace}
              onError={setError}
              onNotice={setNotice}
            />
          </section>
        )}
      </section>
    </main>
  );
}
