import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { ApiError } from "../api/client";
import { fetchSetupStatus } from "../api/auth";
import { useAuth } from "../auth/AuthContext";
import StovoLogo from "../components/StovoLogo";
import { useStrings } from "../i18n/LanguageContext";

export default function SetupPage() {
  const strings = useStrings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("token");
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

  const match = typeof window !== "undefined" ? window.location.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)/) : null;
  const prefix = match ? `/s/${match[1]}` : "";

  if (currentUser) {
    return <Navigate to={`${prefix}/app/chats`} replace />;
  }

  if (setupRequired === false && !inviteToken) {
    return <Navigate to={`${prefix}/login`} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await setup({ ...form, inviteToken: inviteToken || undefined });
      navigate(`${prefix}/app/chats`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : strings.setup.failed);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="auth-panel">
        <p className="eyebrow">{strings.setup.initialSetup}</p>
        <StovoLogo className="app-brand-logo" title="Stovo" />
        <h1>Stovo</h1>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            {strings.auth.nickname}
            <input
              required
              minLength={3}
              autoComplete="username"
              value={form.nickname}
              onChange={(event) => setForm({ ...form, nickname: event.target.value })}
            />
          </label>
          <label>
            {strings.auth.password}
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
            {isSubmitting ? strings.setup.creating : strings.setup.createOwnerAccount}
          </button>
        </form>
        <p className="secondary-link">
          {strings.setup.alreadySetUp} <Link to={`${prefix}/login`}>{strings.setup.logIn}</Link>
        </p>
        <p className="secondary-link">
          <Link to="/server-setup">{strings.setup.changeServerAddress}</Link>
        </p>
      </section>
    </main>
  );
}
