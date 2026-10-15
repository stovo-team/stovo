import { FormEvent, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { startRegistration } from "@simplewebauthn/browser";
import { ExternalLink, Smartphone } from "lucide-react";

import { acceptInvite, acceptInviteWithPasskey, beginInvitePasskeyRegistration, previewInvite, InvitePreview } from "../api/family";
import { ApiError, getClusterPrefix, storeApiUrlFromInviteLink } from "../api/client";
import { getInviteApiUrl } from "../appLinks";
import { useAuth } from "../auth/AuthContext";
import StovoLogo from "../components/StovoLogo";
import { useResolvedLanguage, useStrings } from "../i18n/LanguageContext";

export default function InvitePage() {
  const strings = useStrings();
  const language = useResolvedLanguage();
  const { token } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { acceptAuthResponse, currentUser } = useAuth();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authMethod, setAuthMethod] = useState<"password" | "passkey" | null>(null);
  const [isSecureContext] = useState(() => typeof window !== "undefined" && window.isSecureContext);
  const [form, setForm] = useState({
    nickname: "",
    password: ""
  });

  const prefix = getClusterPrefix();
  const isNative = Capacitor.isNativePlatform();
  const appDeepLink = token
    ? (() => {
        const searchParams = new URLSearchParams(location.search);
        // Browser-originated deep links need the same server handoff as a
        // direct Android App Link. Without it, the app may look up the token
        // against whichever server was previously active on the device.
        searchParams.delete("apiUrl");
        const inviteApiUrl = getInviteApiUrl(window.location.href);
        if (inviteApiUrl) {
          searchParams.set("apiUrl", inviteApiUrl);
        }
        const search = searchParams.toString();
        return `stovo://invite/${encodeURIComponent(token)}${search ? `?${search}` : ""}`;
      })()
    : null;

  useEffect(() => {
    // On the web this is deliberately a no-op: the API is the same origin as
    // the invite page, not a destination supplied by its query string.
    storeApiUrlFromInviteLink(location.search);
    if (!token) {
      return;
    }
    previewInvite(token)
      .then(setPreview)
      .catch((err) =>
        setError(err instanceof ApiError ? String(err.message) : strings.invite.unavailable)
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
    if (!authMethod) {
      setError(strings.invite.chooseSignInMethod);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      let response;
      if (authMethod === "password") {
        response = await acceptInvite(token, form);
      } else {
        if (!isSecureContext || typeof window.PublicKeyCredential === "undefined") {
          throw new Error("Passkeys require a secure connection and a supported browser");
        }
        const ceremony = await beginInvitePasskeyRegistration(token, form.nickname);
        const credential = await startRegistration({ optionsJSON: ceremony.publicKey as never });
        response = await acceptInviteWithPasskey(token, { nickname: form.nickname, ceremonyId: ceremony.ceremonyId, response: credential });
      }
      acceptAuthResponse(response);
      navigate(`${prefix}/app/chats`, { replace: true });
    } catch (err) {
      if (!(err instanceof Error && ["NotAllowedError", "AbortError"].includes(err.name))) {
        setError(err instanceof ApiError ? String(err.message) : err instanceof Error ? err.message : strings.invite.acceptFailed);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="auth-panel">
        <p className="eyebrow">{strings.invite.invitation}</p>
        <StovoLogo className="app-brand-logo" title="Stovo" />
        <h1>{preview ? preview.familyName : "Stovo"}</h1>
        {preview && (
          <div className="summary-band compact">
            <div>
              <span className="summary-label">{strings.invite.role}</span>
              <strong>{preview.role}</strong>
            </div>
            <div>
              <span className="summary-label">{strings.invite.usesLeft}</span>
              <strong>{preview.usesRemaining}</strong>
            </div>
            <div>
              <span className="summary-label">{strings.invite.expires}</span>
              <span>{new Date(preview.expiresAt).toLocaleString(language)}</span>
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
              {strings.invite.openInApp}
            </button>
            <div className="auth-divider" style={{ margin: "0.75rem 0", textAlign: "center", opacity: 0.7, fontSize: "0.85rem" }}>
              <span>{strings.invite.orContinueInBrowser}</span>
            </div>
          </div>
        )}

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            {strings.invite.nickname}
            <input
              required
              minLength={3}
              autoComplete="username"
              value={form.nickname}
              onChange={(event) => setForm({ ...form, nickname: event.target.value })}
            />
          </label>
          <fieldset className="invite-auth-methods">
            <legend>{strings.invite.chooseSignIn}</legend>
            <button type="button" aria-pressed={authMethod === "password"} onClick={() => setAuthMethod("password")}>{strings.invite.createPassword}</button>
            <button type="button" aria-pressed={authMethod === "passkey"} disabled={!isSecureContext || typeof window.PublicKeyCredential === "undefined"} onClick={() => setAuthMethod("passkey")}>{strings.invite.createPasskey}</button>
            {(!isSecureContext || typeof window.PublicKeyCredential === "undefined") && <p className="muted-copy">{strings.invite.passkeyHelp}</p>}
          </fieldset>
          {authMethod === "password" && <label>
            {strings.invite.password}
            <input
              required
              minLength={8}
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </label>}
          {authMethod === "passkey" && <p data-auth-method="passkey-registration" className="muted-copy">{strings.invite.passkeyCreatedWithDevice}</p>}
          {error && <p className="error-text">{error}</p>}
          <button type="submit" disabled={isSubmitting || !authMethod}>
            {isSubmitting ? strings.invite.joining : strings.invite.joinFamily}
          </button>
        </form>
      </section>
    </main>
  );
}
