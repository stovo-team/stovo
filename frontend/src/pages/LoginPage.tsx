import { Capacitor } from "@capacitor/core";
import { Eye, EyeOff, KeyRound, QrCode } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import QRCode from "qrcode";
import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import {
  beginPasskeyAuthentication,
  createBrowserQRLogin,
  fetchSetupStatus,
  finishPasskeyAuthentication,
  getBrowserQRLoginStatus,
  redeemAndroidQRLogin,
  requestDeviceLoginCode,
  verifyDeviceLoginCode,
} from "../api/auth";
import { ApiError, getApiUrl, getClusterPrefix, setApiUrlOverride } from "../api/client";
import { deriveServerNameFromUrl, getActiveServer } from "../api/serverRegistry";
import { useAuth } from "../auth/AuthContext";
import { parseAndroidLoginQR, type AndroidLoginQR } from "../native/androidQrLogin";
import { ANDROID_QR_SCANNER_INSTALLING_MESSAGE, scanAndroidLoginQR } from "../native/androidQrScanner";
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
  const [qrLogin, setQrLogin] = useState<{ requestId: string; image: string; expiresAt: string; status: string } | null>(null);
  const [androidQR, setAndroidQR] = useState<AndroidLoginQR | null>(null);
  const [authView, setAuthView] = useState<"password" | "qr">("password");
  const [isSecureContext, setIsSecureContext] = useState(() => typeof window !== "undefined" && window.isSecureContext);

  const activeServer = getActiveServer();
  const currentUrl = getApiUrl();
  const serverName = activeServer?.name || deriveServerNameFromUrl(currentUrl);
  const prefix = getClusterPrefix();
  const isDeviceLogin = new URLSearchParams(location.search).get("deviceLogin") === "1";

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setLoginValue(params.get("username") ?? "");
    setAuthView("password");
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

  useEffect(() => {
    if (!qrLogin || qrLogin.status !== "pending") return;
    let active = true;
    const timer = window.setInterval(() => {
      void getBrowserQRLoginStatus(qrLogin.requestId).then((result) => {
        if (!active) return;
        if (result.accessToken && result.user) {
          acceptAuthResponse({ accessToken: result.accessToken, tokenType: "Bearer", expiresInSeconds: result.expiresInSeconds ?? 900, user: result.user, refreshToken: result.auth?.refreshToken });
          navigate(`${prefix}/app/chats`, { replace: true });
          setQrLogin((current) => current?.requestId === qrLogin.requestId ? { ...current, status: "approved" } : current);
        } else if (result.status && result.status !== "pending") {
          setQrLogin((current) => current?.requestId === qrLogin.requestId ? { ...current, status: result.status ?? "expired" } : current);
        }
      }).catch(() => {
        // Keep polling through transient network errors until the request expires.
      });
    }, 1500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [qrLogin?.requestId, qrLogin?.status, acceptAuthResponse, navigate, prefix]);

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

  async function handlePasskeyLogin() {
    setError(null);
    if (!isSecureContext || typeof window.PublicKeyCredential === "undefined") {
      setError("Passkeys require a secure connection and a supported browser");
      return;
    }
    setIsSubmitting(true);
    try {
      const options = await beginPasskeyAuthentication();
      const response = await startAuthentication({ optionsJSON: options.publicKey as never });
      acceptAuthResponse(await finishPasskeyAuthentication(options.ceremonyId, response));
      navigate(`${prefix}/app/chats`, { replace: true });
    } catch (err) {
      if (!(err instanceof Error && ["NotAllowedError", "AbortError"].includes(err.name))) {
        setError(err instanceof ApiError ? String(err.message) : "Passkey sign-in failed. Try again or use your password.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleScanAndroidQR() {
    setError(null);
    setAndroidQR(null);
    setIsSubmitting(true);
    try {
      const value = await scanAndroidLoginQR();
      if (value !== null) setAndroidQR(parseAndroidLoginQR(value));
    } catch (err) {
      setError(err instanceof Error && err.message === ANDROID_QR_SCANNER_INSTALLING_MESSAGE
        ? ANDROID_QR_SCANNER_INSTALLING_MESSAGE
        : "Could not scan a desktop sign-in QR code. Try again or use your password.");
    } finally { setIsSubmitting(false); }
  }

  async function handleConfirmAndroidQR() {
    if (!androidQR || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await redeemAndroidQRLogin(androidQR.apiUrl, androidQR.requestId);
      setApiUrlOverride(androidQR.apiUrl);
      acceptAuthResponse(response);
      navigate(`${getClusterPrefix()}/app/chats`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "QR sign-in failed. Try again or use your password.");
    } finally {
      setAndroidQR(null);
      setIsSubmitting(false);
    }
  }

  async function handleStartQRLogin() {
    setError(null);
    setQrLogin(null);
    setAuthView("qr");
    setIsSubmitting(true);
    try {
      const request = await createBrowserQRLogin();
      const image = await QRCode.toDataURL(request.scanUrl, { width: 240, margin: 1 });
      setQrLogin({ requestId: request.requestId, image, expiresAt: request.expiresAt, status: "pending" });
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not start QR sign-in");
      setAuthView("password");
    } finally {
      setIsSubmitting(false);
    }
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
        {(isDeviceLogin || authView === "password") && (
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
            {isDeviceLogin ? (
              codeRequested ? <button type="submit" disabled={isSubmitting || deviceCode.length !== 6}>{isSubmitting ? "Verifying…" : "Verify and log in"}</button> : <button type="button" disabled={isSubmitting || !loginValue.trim()} onClick={() => void handleRequestDeviceCode()}>{isSubmitting ? "Sending…" : "Send code to Message Archive"}</button>
            ) : <button type="submit" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Sign In"}</button>}
          </form>
        )}
        {error && <p className="error-text auth-error" role="alert">{error}</p>}
        {isDeviceLogin && <p className="muted-copy">Open Message Archive on a device where you are already signed in. The code is valid for 10 minutes.</p>}
        {!isDeviceLogin && !Capacitor.isNativePlatform() && <div className="auth-method-options">
          {authView === "qr" ? <>
            <div className="qr-login-panel" aria-live="polite">
              {!qrLogin ? <p>Preparing your QR code…</p> : qrLogin.status === "pending" ? <>
                <img src={qrLogin.image} alt="QR code to approve this browser sign-in with Stovo" />
                <p>Scan this code with Stovo</p>
                <p className="muted-copy">Waiting for approval · Expires {new Date(qrLogin.expiresAt).toLocaleTimeString()}</p>
              </> : <p>{qrLogin.status === "approved" ? "Signed in" : qrLogin.status === "rejected" ? "Sign-in request rejected" : "QR code expired"}</p>}
            </div>
            <div className="auth-divider" role="separator" aria-label="or">
              <svg aria-hidden="true" viewBox="0 0 100 2" preserveAspectRatio="none" focusable="false">
                <path d="M0 1h43M57 1h43" />
              </svg>
              <span>or</span>
            </div>
            <div className="auth-method-grid">
              <button type="button" className="secondary-button" data-auth-method="passkey" disabled={isSubmitting || !isSecureContext || typeof window.PublicKeyCredential === "undefined"} onClick={() => void handlePasskeyLogin()}>
                <KeyRound aria-hidden="true" size={18} /> <span>Sign in with Passkey</span>
              </button>
              <button type="button" className="secondary-button" disabled={isSubmitting} onClick={() => { setAuthView("password"); setQrLogin(null); }}>
                <span>Sign in with Password</span>
              </button>
            </div>
            {!isSecureContext && <p className="muted-copy">Passkeys require a secure connection (HTTPS).</p>}
          </> : <>
            <div className="auth-divider" role="separator" aria-label="or">
              <svg aria-hidden="true" viewBox="0 0 100 2" preserveAspectRatio="none" focusable="false">
                <path d="M0 1h43M57 1h43" />
              </svg>
              <span>or</span>
            </div>
            <div className="auth-method-grid">
              <button type="button" className="secondary-button" data-auth-method="passkey" disabled={isSubmitting || !isSecureContext || typeof window.PublicKeyCredential === "undefined"} onClick={() => void handlePasskeyLogin()}>
                <KeyRound aria-hidden="true" size={18} /> <span>Sign in with Passkey</span>
              </button>
              <button type="button" className="secondary-button" data-auth-method="qr" disabled={isSubmitting} onClick={() => void handleStartQRLogin()}>
                <QrCode aria-hidden="true" size={18} /> <span>Sign in with QR code</span>
              </button>
            </div>
            {!isSecureContext && <p className="muted-copy">Passkeys require a secure connection (HTTPS).</p>}
          </>}
        </div>}
        {!isDeviceLogin && Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android" && (
          <div className="auth-method-options">
            {androidQR ? <div className="qr-login-panel" role="region" aria-label="Confirm scanned server">
              <p>Sign in to <strong>{new URL(androidQR.apiUrl).host}</strong>?</p>
              <p className="muted-copy">Confirm that this is your space address: {androidQR.apiUrl}</p>
              <button type="button" disabled={isSubmitting} onClick={() => void handleConfirmAndroidQR()}>Confirm sign-in</button>
              <button type="button" className="secondary-button" disabled={isSubmitting} onClick={() => setAndroidQR(null)}>Cancel</button>
            </div> : <button type="button" className="secondary-button" disabled={isSubmitting} onClick={() => void handleScanAndroidQR()}>
              <QrCode aria-hidden="true" size={18} /> <span>Scan desktop QR</span>
            </button>}
          </div>
        )}
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
