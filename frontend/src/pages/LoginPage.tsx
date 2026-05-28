import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import VeloLogo from "../components/VeloLogo";

export default function LoginPage() {
  const navigate = useNavigate();
  const { currentUser, login } = useAuth();
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (currentUser) {
    return <Navigate to="/app/chats" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ login: loginValue, password });
      navigate("/app/chats", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="auth-panel">
        <p className="eyebrow">Private family space</p>
        <VeloLogo className="app-brand-logo" title="Velo" />
        <h1>Velo</h1>
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
        <p className="secondary-link">
          New server? <Link to="/setup">Create owner account</Link>
        </p>
      </section>
    </main>
  );
}
