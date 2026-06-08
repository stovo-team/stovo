import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import { fetchSetupStatus } from "../api/auth";
import { isServerUrlConfigured } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function RootRedirect() {
  const { currentUser, isLoading } = useAuth();
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const serverConfigured = isServerUrlConfigured();

  useEffect(() => {
    if (!serverConfigured) {
      return;
    }
    fetchSetupStatus()
      .then((status) => setSetupRequired(status.setupRequired))
      .catch(() => setSetupRequired(false));
  }, [serverConfigured]);

  if (!serverConfigured) {
    return <Navigate to="/server-setup" replace />;
  }

  if (isLoading || setupRequired === null) {
    return <main className="app-shell">Checking server state...</main>;
  }

  if (currentUser) {
    return <Navigate to="/app/chats" replace />;
  }

  return <Navigate to={setupRequired ? "/setup" : "/login"} replace />;
}
