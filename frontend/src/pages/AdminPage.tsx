import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";

import { Family } from "../api/family";
import { ApiError, getClusterPrefix } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import AppNav from "./AppNav";
import { useStrings } from "../i18n/LanguageContext";

export default function AdminPage() {
  const strings = useStrings();
  const { accessToken, authRequest, currentUser } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canViewAdmin = currentUser?.role === "owner" || Boolean(currentUser?.permissions?.length);
  const isOwner = currentUser?.role === "owner";
  const can = (permission: string) => isOwner || currentUser?.permissions?.includes(permission) === true;
  const prefix = getClusterPrefix();

  const adminTabs: Array<{ to: string; icon: string; title: string; description: string; premium?: boolean; disabled?: boolean }> = [
    ...(isOwner || can("manage_server") ? [{ to: "/app/admin/server-settings", icon: "settings", title: strings.admin.hub.serverSettings, description: strings.admin.hub.serverSettingsDesc }] : []),
    ...(can("manage_members") ? [{
      to: "/app/admin/members",
      icon: "group",
      title: strings.admin.hub.members,
      description: strings.admin.hub.membersDesc,
    }] : []),
    ...(isOwner ? [{ to: "/app/admin/defaults", icon: "tune", title: strings.admin.hub.memberDefaults, description: strings.admin.hub.memberDefaultsDesc }] : []),
    ...(can("manage_roles") ? [{
      to: "/app/admin/roles",
      icon: "admin_panel_settings",
      title: strings.admin.hub.roles,
      description: strings.admin.hub.rolesDesc,
    }] : []),
    ...(can("manage_server") ? [{
      to: "/app/admin/appearance",
      icon: "palette",
      title: strings.admin.hub.appearance,
      description: strings.admin.hub.appearanceDesc,
    }] : []),
    ...(can("manage_integrations") ? [{
      to: "/app/admin/mcp",
      icon: "smart_toy",
      title: strings.admin.hub.mcp,
      description: strings.admin.hub.mcpDesc,
    }] : []),
    ...(can("manage_server") ? [{
      to: "/app/admin/encryption",
      icon: "encrypted",
      title: strings.admin.hub.encryption,
      description: strings.admin.hub.encryptionDesc,
      premium: true,
      disabled: true,
    }] : []),
    ...(can("manage_server") ? [{
      to: "/app/admin/plugins",
      icon: "extension",
      title: strings.admin.hub.plugins,
      description: strings.admin.hub.pluginsDesc,
    }] : []),
  ];

  const load = useCallback(async () => {
    if (!accessToken || !canViewAdmin) return;
    try {
      const familyResult = await authRequest<Family>("/api/family");
      setFamily(familyResult);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not load admin");
    }
  }, [accessToken, authRequest, canViewAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="app-shell app-frame admin-page admin-hub-page">
      <AppNav />
      <section className="page-surface admin-surface">
        {!canViewAdmin && <p className="error-text">{strings.admin.adminAccessRequired}</p>}
        {error && <p className="error-text">{error}</p>}

        {canViewAdmin && (
          <nav className="admin-hub-tabs" aria-label={strings.admin.title}>
            {adminTabs.map((tab) => {
              const tabContent = (
                <>
                  <span className="settings-row-icon">
                    <span className="ms-icon ms-icon--22" aria-hidden="true">
                      {tab.icon}
                    </span>
                  </span>
                  <span>
                    <strong>
                      {tab.title}
                      {tab.premium && <span className="premium-feature-badge">{strings.admin.encryption.premium}</span>}
                    </strong>
                    <small>{tab.description}</small>
                  </span>
                  <span className="ms-icon ms-icon--20" aria-hidden="true">
                    chevron_right
                  </span>
                </>
              );

              if (tab.disabled) {
                return (
                  <div key={tab.to} className="admin-hub-tab is-disabled" aria-disabled="true">
                    {tabContent}
                  </div>
                );
              }

              return (
                <Link key={tab.to} to={`${prefix}${tab.to}`} className="admin-hub-tab">
                  {tabContent}
                </Link>
              );
            })}
          </nav>
        )}
      </section>
    </main>
  );
}
