import { ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function RequireAuth({ children }: { children: ReactElement }) {
  const { currentUser, isLoading } = useAuth();
  if (isLoading && !currentUser) {
    return <main className="app-shell">Loading session...</main>;
  }
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default RequireAuth;
