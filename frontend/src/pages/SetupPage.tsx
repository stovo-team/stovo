import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { ApiError } from "../api/client";
import { fetchSetupStatus } from "../api/auth";
import { useAuth } from "../auth/AuthContext";
import VeloLogo from "../components/VeloLogo";

export default function SetupPage() {
  const navigate = useNavigate();
  const { currentUser, setup } = useAuth();
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    nickname: "",
    password: ""
  });

  useEffect(() => {
    fetchSetupStatus()
      .then((status) => setSetupRequired(status.setupRequired))
      .catch(() => setSetupRequired(true));
  }, []);

  if (currentUser) {
    return <Navigate to="/app/chats" replace />;
  }

  if (setupRequired === false) {
    return <Navigate to="/login" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await setup(form);
      navigate("/app/chats", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Setup failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="auth-panel">
        <p className="eyebrow">Initial setup</p>
        <VeloLogo className="app-brand-logo" title="Stovo" />
        <h1>Stovo</h1>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Nickname
            <input
              required
              minLength={3}
              autoComplete="username"
              value={form.nickname}
              onChange={(event) => setForm({ ...form, nickname: event.target.value })}
            />
          </label>
          <label>
            Password
            <input
              required
              minLength={8}
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating" : "Create owner account"}
          </button>
        </form>
        <p className="secondary-link">
          Already set up? <Link to="/login">Log in</Link>
        </p>
        <p className="secondary-link">
          <Link to="/server-setup">Change server address</Link>
        </p>
      </section>
    </main>
  );
}
