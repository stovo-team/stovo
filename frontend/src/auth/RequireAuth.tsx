import { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getClusterPath } from "../api/client";
import { useAuth } from "./AuthContext";

export function RequireAuth({ children }: { children: ReactElement }) {
  const { currentUser, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading && !currentUser) {
    return <main className="app-shell">Loading session...</main>;
  }
  if (!currentUser) {
    return <Navigate to={getClusterPath("/login")} state={{ from: location }} replace />;
  }
  return children;
}

export default RequireAuth;
