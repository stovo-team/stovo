import { Capacitor } from "@capacitor/core";
import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { fetchSetupStatus } from "../api/auth";
import { ApiError, getApiUrl } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import VeloLogo from "../components/VeloLogo";

export function OwnerSetupPrompt({ setupRequired }: { setupRequired: boolean | null }) {
  if (setupRequired !== true) {
    return null;
  }

  return (
    <p className="secondary-link">
      New server? <Link to="/setup">Create owner account</Link>
    </p>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { currentUser, login } = useAuth();
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSetupStatus()
      .then((status) => {
        if (!cancelled) {
          setSetupRequired(status.setupRequired);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSetupRequired(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (currentUser) {
    return <Navigate to="/app/chats" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ username: loginValue, password });
      navigate("/app/chats", { replace: true });
    } catch (err) {
      const detail = err instanceof ApiError ? `${err.status}: ${String(err.message)}` : String(err);
      setError(`${detail}\n(${getApiUrl()})`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="auth-panel">
        <p className="eyebrow">Private family space</p>
        <VeloLogo className="app-brand-logo" title="Stovo" />
        <h1>Stovo</h1>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Nickname
            <input
              required
              autoComplete="username"
              value={loginValue}
              onChange={(event) => setLoginValue(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in" : "Log in"}
          </button>
        </form>
        <OwnerSetupPrompt setupRequired={setupRequired} />
        {Capacitor.isNativePlatform() && (
          <p className="secondary-link">
            <Link to="/server-setup">Change server address</Link>
          </p>
        )}
      </section>
    </main>
  );
}
