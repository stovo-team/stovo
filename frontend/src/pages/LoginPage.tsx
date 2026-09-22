import { Capacitor } from "@capacitor/core";
import { Eye, EyeOff } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { fetchSetupStatus, requestDeviceLoginCode, verifyDeviceLoginCode } from "../api/auth";
import { ApiError, getApiUrl, getClusterPrefix, setApiUrlOverride } from "../api/client";
import { deriveServerNameFromUrl, getActiveServer } from "../api/serverRegistry";
import { useAuth } from "../auth/AuthContext";
import StovoLogo from "../components/StovoLogo";

export function OwnerSetupPrompt({ setupRequired }: { setupRequired: boolean | null }) {
  if (setupRequired === false) {
    return null;
  }
  const prefix = getClusterPrefix();

  return (
    <p className="secondary-link">
      New space? <Link to={`${prefix}/setup`}>Create owner account</Link>
    </p>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, login, acceptAuthResponse } = useAuth();
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [deviceCode, setDeviceCode] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);

  const activeServer = getActiveServer();
  const currentUrl = getApiUrl();
  const serverName = activeServer?.name || deriveServerNameFromUrl(currentUrl);
  const isDeviceLogin = new URLSearchParams(location.search).get("deviceLogin") === "1";

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setLoginValue(params.get("username") ?? "");
    // Passwords must never be accepted from URLs: URLs are commonly retained
    // in history, analytics, proxy logs, and copied links.
    setPassword("");
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;
    fetchSetupStatus()
      .then((status) => {
        if (!cancelled) {
          setSetupRequired(status.setupRequired);
          if (status.familyName) {
            setApiUrlOverride(currentUrl, status.familyName);
          }
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
  }, [currentUrl]);

  const prefix = getClusterPrefix();

  if (currentUser) {
    return <Navigate to={`${prefix}/app/chats`} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ username: loginValue, password });
      navigate(`${prefix}/app/chats`, { replace: true });
    } catch (err) {
      const detail = err instanceof ApiError ? String(err.message) : "Invalid credentials";
      setError(detail);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRequestDeviceCode() {
    if (!loginValue.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await requestDeviceLoginCode(loginValue);
      setCodeRequested(true);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not send verification code");
    } finally { setIsSubmitting(false); }
  }

  async function handleVerifyDeviceCode(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      acceptAuthResponse(await verifyDeviceLoginCode(loginValue, deviceCode));
      navigate(`${prefix}/app/chats`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Invalid verification code");
    } finally { setIsSubmitting(false); }
  }

  return (
    <main className="app-shell">
      <section className="auth-panel">
        <div className="auth-brand-header">
          <StovoLogo className="auth-brand-logo" title="Stovo" />
          <div className="auth-brand-info">
            <h1 className="auth-brand-title">Stovo</h1>
            {serverName && <span className="auth-server-name">{serverName}</span>}
          </div>
        </div>
        <form className="form-grid" onSubmit={isDeviceLogin && codeRequested ? handleVerifyDeviceCode : handleSubmit}>
          <label>
            Nickname
            <input
              required
              autoComplete="username"
              value={loginValue}
              onChange={(event) => setLoginValue(event.target.value)}
            />
          </label>
          {!isDeviceLogin && <label>
            Password
            <span className="password-input-wrap">
              <input required type={isPasswordVisible ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
              <button type="button" className="password-visibility-button" aria-label={isPasswordVisible ? "Hide password" : "Show password"} onClick={() => setIsPasswordVisible((value) => !value)}>
                {isPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>}
          {isDeviceLogin && codeRequested && <label>Verification code<input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={deviceCode} onChange={(event) => setDeviceCode(event.target.value.replace(/\D/g, ""))} /></label>}
          {error && <p className="error-text">{error}</p>}
          {isDeviceLogin ? (
            codeRequested ? <button type="submit" disabled={isSubmitting || deviceCode.length !== 6}>{isSubmitting ? "Verifying…" : "Verify and log in"}</button> : <button type="button" disabled={isSubmitting || !loginValue.trim()} onClick={() => void handleRequestDeviceCode()}>{isSubmitting ? "Sending…" : "Send code to Message Archive"}</button>
          ) : <button type="submit" disabled={isSubmitting}>{isSubmitting ? "Signing in" : "Log in"}</button>}
        </form>
        {isDeviceLogin && <p className="muted-copy">Open Message Archive on a device where you are already signed in. The code is valid for 10 minutes.</p>}
        <OwnerSetupPrompt setupRequired={setupRequired} />
        {Capacitor.isNativePlatform() && (
          <p className="secondary-link">
            <Link to="/server-setup">Change space address</Link>
          </p>
        )}
      </section>
    </main>
  );
}
