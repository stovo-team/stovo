import { FormEvent, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { ExternalLink, Smartphone } from "lucide-react";

import { acceptInvite, previewInvite, InvitePreview } from "../api/family";
import { ApiError, getClusterPrefix, storeApiUrlFromInviteLink } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import VeloLogo from "../components/VeloLogo";

export default function InvitePage() {
  const { token } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { acceptAuthResponse, currentUser } = useAuth();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    nickname: "",
    password: ""
  });

  const prefix = getClusterPrefix();
  const isNative = Capacitor.isNativePlatform();
  const appDeepLink = token ? `stovo://invite/${encodeURIComponent(token)}${location.search}` : null;

  useEffect(() => {
    storeApiUrlFromInviteLink(location.search);
    if (!token) {
      return;
    }
    previewInvite(token)
      .then(setPreview)
      .catch((err) =>
        setError(err instanceof ApiError ? String(err.message) : "Invite is unavailable")
      );
  }, [token, location.search]);

  function handleOpenInApp() {
    if (appDeepLink) {
      window.location.href = appDeepLink;
    }
  }

  if (currentUser) {
    return <Navigate to={`${prefix}/app/chats`} replace />;
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
      navigate(`${prefix}/app/chats`, { replace: true });
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
        <VeloLogo className="app-brand-logo" title="Stovo" />
        <h1>{preview ? preview.familyName : "Stovo"}</h1>
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

        {!isNative && appDeepLink && (
          <div className="invite-app-prompt">
            <button
              type="button"
              className="primary-button full-width"
              onClick={handleOpenInApp}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                marginBottom: "1rem"
              }}
            >
              <Smartphone aria-hidden="true" size={18} />
              Open in Stovo App
            </button>
            <div className="auth-divider" style={{ margin: "0.75rem 0", textAlign: "center", opacity: 0.7, fontSize: "0.85rem" }}>
              <span>or continue in browser</span>
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
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Joining" : "Join family"}
          </button>
        </form>
      </section>
    </main>
  );
}
