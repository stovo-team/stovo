import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import { fetchSetupStatus } from "../api/auth";
import { useAuth } from "../auth/AuthContext";

export default function RootRedirect() {
  const { currentUser, isLoading } = useAuth();
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);

  useEffect(() => {
    fetchSetupStatus()
      .then((status) => setSetupRequired(status.setupRequired))
      .catch(() => setSetupRequired(false));
  }, []);

  if (isLoading || setupRequired === null) {
    return <main className="app-shell">Checking server state...</main>;
  }

  if (currentUser) {
    return <Navigate to="/app/chats" replace />;
  }

  return <Navigate to={setupRequired ? "/setup" : "/login"} replace />;
}
