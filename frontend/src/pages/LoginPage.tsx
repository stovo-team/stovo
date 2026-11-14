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
import { ANDROID_QR_SCANNER_INSTALLING_MESSAGE, isAndroidQrCameraUnavailable, scanAndroidLoginQR } from "../native/androidQrScanner";
import AndroidQrConfirmation from "../components/AndroidQrConfirmation";
import StovoLogo from "../components/StovoLogo";
import { useResolvedLanguage, useStrings } from "../i18n/LanguageContext";

export function OwnerSetupPrompt({ setupRequired }: { setupRequired: boolean | null }) {
  if (setupRequired === false) {
    return null;
  }
  const prefix = getClusterPrefix();
  const strings = useStrings();

  return (
    <p className="secondary-link">
      {strings.auth.newServer} <Link to={`${prefix}/setup`}>{strings.auth.createOwnerAccount}</Link>
    </p>
  );
}

export function getSafeLoginReturnPath(value: unknown, fallback: string): string {
  const target = value && typeof value === "object" && "from" in value
    ? (value as { from?: unknown }).from
    : value;
  if (!target || typeof target !== "object") return safeFallbackPath(fallback);
  const location = target as { pathname?: unknown; search?: unknown; hash?: unknown };
  if (typeof location.pathname !== "string" || !location.pathname.startsWith("/") || location.pathname.startsWith("//") || location.pathname.includes("\\")) {
    return safeFallbackPath(fallback);
  }
  const search = typeof location.search === "string" ? location.search : "";
  const hash = typeof location.hash === "string" ? location.hash : "";
  if ((search && !search.startsWith("?")) || (hash && !hash.startsWith("#"))) return safeFallbackPath(fallback);
  try {
    const parsed = new URL(`${location.pathname}${search}${hash}`, "https://messenger.invalid");
    if (parsed.origin !== "https://messenger.invalid" || parsed.pathname === "/login" || parsed.pathname.endsWith("/login")) {
      return safeFallbackPath(fallback);
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return safeFallbackPath(fallback);
  }
}

function safeFallbackPath(fallback: string): string {
  if (!fallback.startsWith("/") || fallback.startsWith("//") || fallback.includes("\\")) return "/app/chats";
  try {
    const parsed = new URL(fallback, "https://messenger.invalid");
    return parsed.origin === "https://messenger.invalid" ? `${parsed.pathname}${parsed.search}${parsed.hash}` : "/app/chats";
  } catch {
    return "/app/chats";
  }
}

function openStovoApp(url: string) {
  const appLink = document.createElement("a");
  appLink.href = url;
  document.body.appendChild(appLink);
  appLink.click();
  appLink.remove();
}

export default function LoginPage() {
  const strings = useStrings();
  const language = useResolvedLanguage();
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
  const [qrLogin, setQrLogin] = useState<{ requestId: string; image: string; scanUrl: string; expiresAt: string; status: string } | null>(null);
  const [androidQR, setAndroidQR] = useState<AndroidLoginQR | null>(null);
  const [authView, setAuthView] = useState<"password" | "qr">("password");
  const [isSecureContext, setIsSecureContext] = useState(() => typeof window !== "undefined" && window.isSecureContext);

  const activeServer = getActiveServer();
  const currentUrl = getApiUrl();
  const serverName = activeServer?.name || deriveServerNameFromUrl(currentUrl);
  const prefix = getClusterPrefix();
  const isDeviceLogin = new URLSearchParams(location.search).get("deviceLogin") === "1";
  const isMobileBrowser = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const passkeyLabel = isMobileBrowser ? strings.auth.signInWithPasskeyShort : strings.auth.signInWithPasskey;
  const postLoginPath = getSafeLoginReturnPath(location.state, `${prefix}/app/chats`);

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
          navigate(postLoginPath, { replace: true });
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
  }, [qrLogin?.requestId, qrLogin?.status, acceptAuthResponse, navigate, postLoginPath]);

  if (currentUser) {
    return <Navigate to={postLoginPath} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ username: loginValue, password });
      navigate(postLoginPath, { replace: true });
    } catch (err) {
      const detail = err instanceof ApiError ? String(err.message) : strings.auth.invalidCredentials;
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
      setError(err instanceof ApiError ? String(err.message) : strings.auth.sendCodeFailed);
    } finally { setIsSubmitting(false); }
  }

  async function handleVerifyDeviceCode(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      acceptAuthResponse(await verifyDeviceLoginCode(loginValue, deviceCode));
      navigate(postLoginPath, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : strings.auth.invalidVerificationCode);
    } finally { setIsSubmitting(false); }
  }

  async function handlePasskeyLogin() {
    setError(null);
    if (!isSecureContext || typeof window.PublicKeyCredential === "undefined") {
      setError(strings.auth.secureBrowserRequired);
      return;
    }
    setIsSubmitting(true);
    try {
      const options = await beginPasskeyAuthentication();
      const response = await startAuthentication({ optionsJSON: options.publicKey as never });
      acceptAuthResponse(await finishPasskeyAuthentication(options.ceremonyId, response));
      navigate(postLoginPath, { replace: true });
    } catch (err) {
      if (!((err instanceof Error || err instanceof DOMException) && ["NotAllowedError", "AbortError"].includes(err.name))) {
        setError(err instanceof ApiError ? String(err.message) : strings.auth.signInFailed);
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
        ? strings.auth.qrScannerInstalling
        : isAndroidQrCameraUnavailable(err)
          ? strings.auth.qrLoginCameraUnavailable
          : strings.auth.scanQrFailed);
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
      if (isMobileBrowser) openStovoApp(request.scanUrl);
      setQrLogin({ requestId: request.requestId, image, scanUrl: request.scanUrl, expiresAt: request.expiresAt, status: "pending" });
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : strings.auth.qrStartFailed);
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
        {!androidQR && (isDeviceLogin || authView === "password") && (
          <form className="form-grid" onSubmit={isDeviceLogin && codeRequested ? handleVerifyDeviceCode : handleSubmit}>
            <label>
              {strings.auth.nickname}
              <input
                required
                autoComplete="username"
                value={loginValue}
                onChange={(event) => setLoginValue(event.target.value)}
              />
            </label>
            {!isDeviceLogin && <label>
              {strings.auth.password}
              <span className="password-input-wrap">
                <input required type={isPasswordVisible ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
                <button type="button" className="password-visibility-button" aria-label={isPasswordVisible ? strings.auth.hidePassword : strings.auth.showPassword} onClick={() => setIsPasswordVisible((value) => !value)}>
                  {isPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>}
            {isDeviceLogin && codeRequested && <label>{strings.auth.verificationCode}<input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={deviceCode} onChange={(event) => setDeviceCode(event.target.value.replace(/\D/g, ""))} /></label>}
            {isDeviceLogin ? (
              codeRequested ? <button type="submit" disabled={isSubmitting || deviceCode.length !== 6}>{isSubmitting ? strings.auth.verifying : strings.auth.verifyAndLogIn}</button> : <button type="button" disabled={isSubmitting || !loginValue.trim()} onClick={() => void handleRequestDeviceCode()}>{isSubmitting ? strings.auth.sending : strings.auth.sendCodeToArchive}</button>
            ) : <button type="submit" disabled={isSubmitting}>{isSubmitting ? strings.auth.signingIn : strings.auth.signIn}</button>}
          </form>
        )}
        {error && <p className="error-text auth-error" role="alert">{error}</p>}
        {isDeviceLogin && <p className="muted-copy">{strings.auth.deviceCodeHint}</p>}
        {!androidQR && !isDeviceLogin && !Capacitor.isNativePlatform() && <div className="auth-method-options">
          {authView === "qr" ? <>
            <div className="qr-login-panel" aria-live="polite">
              {!qrLogin ? <p>{strings.auth.qrPreparing}</p> : qrLogin.status === "pending" ? <>
                <img src={qrLogin.image} alt={strings.auth.qrApproveAlt} />
                <p>{strings.auth.qrScanWithStovo}</p>
                <p className="muted-copy">{strings.auth.qrWaiting} {new Date(qrLogin.expiresAt).toLocaleTimeString(language)}</p>
              </> : <p>{qrLogin.status === "approved" ? strings.auth.signedIn : qrLogin.status === "rejected" ? strings.auth.requestRejected : strings.auth.qrExpired}</p>}
            </div>
            <div className="auth-divider" role="separator" aria-label="or">
              <svg aria-hidden="true" viewBox="0 0 100 2" preserveAspectRatio="none" focusable="false">
                <path d="M0 1h43M57 1h43" />
              </svg>
              <span>{strings.auth.or}</span>
            </div>
            <div className="auth-method-grid">
              <button type="button" className="secondary-button" data-auth-method="passkey" disabled={isSubmitting || !isSecureContext || typeof window.PublicKeyCredential === "undefined"} onClick={() => void handlePasskeyLogin()}>
                <KeyRound aria-hidden="true" size={18} /> <span>{passkeyLabel}</span>
              </button>
              <button type="button" className="secondary-button" disabled={isSubmitting} onClick={() => { setAuthView("password"); setQrLogin(null); }}>
                <span>{strings.auth.signInWithPassword}</span>
              </button>
            </div>
            {!isSecureContext && <p className="muted-copy">{strings.auth.secureContextRequired}</p>}
          </> : <>
            <div className="auth-divider" role="separator" aria-label="or">
              <svg aria-hidden="true" viewBox="0 0 100 2" preserveAspectRatio="none" focusable="false">
                <path d="M0 1h43M57 1h43" />
              </svg>
              <span>{strings.auth.or}</span>
            </div>
            <div className="auth-method-grid">
              <button type="button" className="secondary-button" data-auth-method="passkey" disabled={isSubmitting || !isSecureContext || typeof window.PublicKeyCredential === "undefined"} onClick={() => void handlePasskeyLogin()}>
                <KeyRound aria-hidden="true" size={18} /> <span>{passkeyLabel}</span>
              </button>
              <button type="button" className="secondary-button" data-auth-method="qr" disabled={isSubmitting} onClick={() => void handleStartQRLogin()}>
                <QrCode aria-hidden="true" size={18} /> <span>{isMobileBrowser ? strings.auth.signInWithQrShort : strings.auth.signInWithQr}</span>
              </button>
            </div>
            {!isSecureContext && <p className="muted-copy">{strings.auth.secureContextRequired}</p>}
          </>}
        </div>}
        {!isDeviceLogin && Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android" && (
          androidQR ? <AndroidQrConfirmation
            apiUrl={androidQR.apiUrl}
            isSubmitting={isSubmitting}
            onConfirm={() => void handleConfirmAndroidQR()}
            onCancel={() => setAndroidQR(null)}
          /> : <div className="auth-method-options android-auth-methods">
            <button type="button" className="secondary-button" data-auth-method="passkey" disabled={isSubmitting || !isSecureContext || typeof window.PublicKeyCredential === "undefined"} onClick={() => void handlePasskeyLogin()}>
              <KeyRound aria-hidden="true" size={18} /> <span>{strings.auth.signInWithPasskeyShort}</span>
            </button>
            {!isSecureContext ? <p className="muted-copy">{strings.auth.secureContextRequired}</p> : typeof window.PublicKeyCredential === "undefined" && <p className="muted-copy">{strings.auth.supportedAndroidWebView}</p>}
            <button type="button" className="secondary-button" data-auth-method="scan-qr" aria-describedby="android-qr-find-guide" disabled={isSubmitting} onClick={() => void handleScanAndroidQR()}>
              <QrCode aria-hidden="true" size={18} /> <span>{strings.auth.scanDesktopQrShort}</span>
            </button>
            <p id="android-qr-find-guide" className="muted-copy">{strings.auth.androidQrFindOnComputer}</p>
          </div>
        )}
        {!androidQR && <OwnerSetupPrompt setupRequired={setupRequired} />}
        {!androidQR && Capacitor.isNativePlatform() && (
          <p className="secondary-link">
            <Link to="/server-setup">{strings.auth.changeServerAddress}</Link>
          </p>
        )}
      </section>
    </main>
  );
}
