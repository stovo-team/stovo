import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import { fetchSetupStatus } from "../api/auth";
import { getClusterPrefix, isServerUrlConfigured } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Capacitor } from "@capacitor/core";
import { useStrings } from "../i18n/LanguageContext";

export function getUnconfiguredRootPath(isNative: boolean): string {
  // The browser root is intentionally the master console. A native install is
  // a family-member client, so it must start with server connection instead.
  return isNative ? "/server-setup" : "/multi-admin";
}

export function shouldOpenMasterConsole(isNative: boolean, clusterPrefix: string): boolean {
  return !isNative && !clusterPrefix;
}

export function getDefaultAppPath(
  prefix: string,
  navTabs?: { chats?: boolean; storage?: boolean; plans?: boolean; settings?: boolean }
): string {
  if (navTabs?.chats !== false) return `${prefix}/app/chats`;
  if (navTabs?.storage !== false) return `${prefix}/app/files`;
  if (navTabs?.plans !== false) return `${prefix}/app/plans`;
  if (navTabs?.settings !== false) return `${prefix}/app/settings`;
  return `${prefix}/app/admin`;
}

export default function RootRedirect() {
  const copy = useStrings().sharedUi;
  const { currentUser, isLoading } = useAuth();
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [navTabs, setNavTabs] = useState<{ chats?: boolean; storage?: boolean; plans?: boolean; settings?: boolean } | undefined>(undefined);
  const serverConfigured = isServerUrlConfigured();

  const prefix = getClusterPrefix();

  useEffect(() => {
    if (!serverConfigured) {
      return;
    }
    fetchSetupStatus()
      .then((status) => {
        setSetupRequired(status.setupRequired);
        if (status.navTabs) {
          setNavTabs(status.navTabs);
        }
      })
      .catch(() => setSetupRequired(false));
  }, [serverConfigured]);

  // The browser root is the master multi-server console. Native clients use
  // the currently configured family server instead.
  if (shouldOpenMasterConsole(Capacitor.isNativePlatform(), prefix)) {
    return <Navigate to="/multi-admin" replace />;
  }

  if (!serverConfigured) {
    return <Navigate to={getUnconfiguredRootPath(Capacitor.isNativePlatform())} replace />;
  }

  if (currentUser) {
    return <Navigate to={getDefaultAppPath(prefix, navTabs)} replace />;
  }

  if (isLoading || setupRequired === null) {
    return <main className="app-shell">{copy.checkingServer}</main>;
  }

  return <Navigate to={setupRequired ? `${prefix}/setup` : `${prefix}/login`} replace />;
}
