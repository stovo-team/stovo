import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import { fetchSetupStatus } from "../api/auth";
import { getClusterPrefix, isServerUrlConfigured } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Capacitor } from "@capacitor/core";

export function getUnconfiguredRootPath(isNative: boolean): string {
  // The browser root is intentionally the master console. A native install is
  // a family-member client, so it must start with server connection instead.
  return isNative ? "/server-setup" : "/multi-admin";
}

export default function RootRedirect() {
  const { currentUser, isLoading } = useAuth();
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const serverConfigured = isServerUrlConfigured();

  const prefix = getClusterPrefix();

  useEffect(() => {
    if (!serverConfigured) {
      return;
    }
    fetchSetupStatus()
      .then((status) => setSetupRequired(status.setupRequired))
      .catch(() => setSetupRequired(false));
  }, [serverConfigured]);

  // The browser root is the master multi-server console. Native clients use
  // the currently configured family server instead.
  if (!Capacitor.isNativePlatform()) {
    return <Navigate to="/multi-admin" replace />;
  }

  if (!serverConfigured) {
    return <Navigate to={getUnconfiguredRootPath(Capacitor.isNativePlatform())} replace />;
  }

  if (isLoading || setupRequired === null) {
    return <main className="app-shell">Checking server state...</main>;
  }

  if (currentUser) {
    return <Navigate to={`${prefix}/app/chats`} replace />;
  }

  return <Navigate to={setupRequired ? `${prefix}/setup` : `${prefix}/login`} replace />;
}
