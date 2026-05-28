import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import { acceptInvite, previewInvite, InvitePreview } from "../api/family";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import VeloLogo from "../components/VeloLogo";

export default function InvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { acceptAuthResponse, currentUser } = useAuth();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    nickname: "",
    password: ""
  });

  useEffect(() => {
    if (!token) {
      return;
    }
    previewInvite(token)
      .then(setPreview)
      .catch((err) =>
        setError(err instanceof ApiError ? String(err.message) : "Invite is unavailable")
      );
  }, [token]);

  if (currentUser) {
    return <Navigate to="/app/chats" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await acceptInvite(token, form);
      acceptAuthResponse(response);
      navigate("/app/chats", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Invite acceptance failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="auth-panel">
        <p className="eyebrow">Invitation</p>
        <VeloLogo className="app-brand-logo" title="Velo" />
        <h1>{preview ? preview.familyName : "Velo"}</h1>
        {preview && (
          <div className="summary-band compact">
            <div>
              <span className="summary-label">Role</span>
              <strong>{preview.role}</strong>
            </div>
            <div>
              <span className="summary-label">Uses left</span>
              <strong>{preview.usesRemaining}</strong>
            </div>
            <div>
              <span className="summary-label">Expires</span>
              <span>{new Date(preview.expiresAt).toLocaleString()}</span>
            </div>
          </div>
        )}
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
          <button type="submit" disabled={!preview || isSubmitting}>
            {isSubmitting ? "Joining" : "Join family"}
          </button>
        </form>
      </section>
    </main>
  );
}
