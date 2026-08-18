import { Link } from "react-router-dom";

import { Family } from "../api/family";
import { ApiError, getClusterPrefix } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCallback, useEffect, useState } from "react";
import AppNav from "./AppNav";

const ADMIN_TABS = [
  {
    to: "/app/admin/appearance",
    icon: "palette",
    title: "Appearance",
    description: "Shared chat-list layout for all frontends"
  },
  {
    to: "/app/admin/encryption",
    icon: "encrypted",
    title: "Message encryption",
    description: "Default protocol for new chats"
  },
  {
    to: "/app/admin/mcp",
    icon: "smart_toy",
    title: "MCP connectors",
    description: "Claude Code, Codex, OpenClaw, Hermes"
  },
  {
    to: "/app/admin/members",
    icon: "group",
    title: "Members",
    description: "Family members, roles, and account actions"
  }
] as const;

export default function AdminPage() {
  const { accessToken, authRequest, currentUser } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canViewAdmin = currentUser?.role === "owner" || currentUser?.role === "admin";
  const prefix = getClusterPrefix();

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


        {!canViewAdmin && <p className="error-text">Admin access required.</p>}
        {error && <p className="error-text">{error}</p>}

        {canViewAdmin && (
          <nav className="admin-hub-tabs" aria-label="Admin sections">
            {ADMIN_TABS.map((tab) => (
              <Link key={tab.to} to={`${prefix}${tab.to}`} className="admin-hub-tab">
                <span className="settings-row-icon">
                  <span className="ms-icon ms-icon--22" aria-hidden="true">
                    {tab.icon}
                  </span>
                </span>
                <span>
                  <strong>{tab.title}</strong>
                  <small>{tab.description}</small>
                </span>
                <span className="ms-icon ms-icon--20" aria-hidden="true">
                  chevron_right
                </span>
              </Link>
            ))}
          </nav>
        )}
      </section>
    </main>
  );
}
