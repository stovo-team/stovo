import { Capacitor } from "@capacitor/core";
import { KeyRound, QrCode } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { beginPasskeyAuthentication, finishPasskeyAuthentication, redeemAndroidQRLogin } from "../api/auth";
import { ApiError, setApiUrlOverride } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import AndroidQrConfirmation from "../components/AndroidQrConfirmation";
import StovoLogo from "../components/StovoLogo";
import { useStrings } from "../i18n/LanguageContext";
import { parseAndroidLoginQR, type AndroidLoginQR } from "../native/androidQrLogin";
import { ANDROID_QR_SCANNER_INSTALLING_MESSAGE, scanAndroidLoginQR } from "../native/androidQrScanner";

function normalizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export default function ServerSetupPage() {
  const strings = useStrings();
  const copy = strings.serverSetup;
  const navigate = useNavigate();
  const location = useLocation();
  const { acceptAuthResponse } = useAuth();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [androidQR, setAndroidQR] = useState<AndroidLoginQR | null>(null);
  const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  const supportsPasskeys = Boolean(window.isSecureContext && typeof window.PublicKeyCredential !== "undefined");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const server = normalizeUrl(params.get("server") ?? "");
    if (server) setUrl(server);
  }, [location.search]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setError(copy.invalidUrl);
      return;
    }
    setError(null);
    setIsTesting(true);
    try {
      const res = await fetch(`${normalized}/api/auth/setup-status`, {
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok && res.status !== 401) {
        setError(copy.serverReply(res.status));
        return;
      }
      const data = await res.json().catch(() => null);
      const familyName = typeof data?.familyName === "string" ? data.familyName : undefined;
      setApiUrlOverride(normalized, familyName);
      const loginParams = new URLSearchParams();
      const supplied = new URLSearchParams(location.search);
      const username = supplied.get("username");
      const deviceLogin = supplied.get("deviceLogin");
      if (username) loginParams.set("username", username);
      if (deviceLogin === "1") loginParams.set("deviceLogin", "1");
      navigate(`/login${loginParams.size ? `?${loginParams}` : ""}`, { replace: true });
    } catch (err) {
      setError(copy.cannotReach(normalized, String(err)));
    } finally {
      setIsTesting(false);
    }
  }

  async function handlePasskeyLogin() {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setError(copy.invalidUrl);
      return;
    }
    setError(null);
    setIsAuthenticating(true);
    setApiUrlOverride(normalized);
    try {
      const options = await beginPasskeyAuthentication();
      const response = await startAuthentication({ optionsJSON: options.publicKey as never });
      acceptAuthResponse(await finishPasskeyAuthentication(options.ceremonyId, response));
      navigate("/app/chats", { replace: true });
    } catch (err) {
      if (!((err instanceof Error || err instanceof DOMException) && ["NotAllowedError", "AbortError"].includes(err.name))) {
        setError(err instanceof ApiError ? String(err.message) : strings.auth.signInFailed);
      }
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function handleScanAndroidQR() {
    setError(null);
    setAndroidQR(null);
    setIsAuthenticating(true);
    try {
      const value = await scanAndroidLoginQR();
      if (value !== null) setAndroidQR(parseAndroidLoginQR(value));
    } catch (err) {
      setError(err instanceof Error && err.message === ANDROID_QR_SCANNER_INSTALLING_MESSAGE
        ? ANDROID_QR_SCANNER_INSTALLING_MESSAGE
        : strings.auth.scanQrFailed);
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function handleConfirmAndroidQR() {
    if (!androidQR || isAuthenticating) return;
    setError(null);
    setIsAuthenticating(true);
    try {
      const response = await redeemAndroidQRLogin(androidQR.apiUrl, androidQR.requestId);
      setApiUrlOverride(androidQR.apiUrl);
      acceptAuthResponse(response);
      navigate("/app/chats", { replace: true });
    } catch (err) {
      setAndroidQR(null);
      setError(err instanceof ApiError ? String(err.message) : strings.auth.androidQrSignInFailed);
    } finally {
      setIsAuthenticating(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="auth-panel">
        <p className="eyebrow">{strings.brand.setup}</p>
        <StovoLogo className="app-brand-logo" title="Stovo" />
        <h1>{copy.title}</h1>
        {!androidQR && <p className="muted-copy">
          {copy.hint} <strong>{copy.hintHttps}</strong> {copy.hintSuffix}
        </p>}
        {!androidQR && <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            {copy.serverUrl}
            <input
              required
              type="url"
              placeholder={copy.placeholder}
              autoComplete="url"
              disabled={isTesting || isAuthenticating}
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setError(null);
              }}
            />
          </label>
          {error && <p className="error-text" role="alert">{error}</p>}
          <button type="submit" disabled={isTesting || isAuthenticating}>
            {isTesting ? copy.testingConnection : copy.connect}
          </button>
        </form>}
        {isAndroid && !androidQR && <div className="auth-method-options android-auth-methods">
          <button type="button" className="secondary-button" data-auth-method="passkey" disabled={!supportsPasskeys || isTesting || isAuthenticating} onClick={handlePasskeyLogin}>
            <KeyRound aria-hidden="true" size={18} />
            <span>{strings.auth.signInWithPasskeyShort}</span>
          </button>
          {!supportsPasskeys && <p className="muted-copy">
            {!window.isSecureContext ? strings.auth.secureContextRequired : strings.auth.supportedAndroidWebView}
          </p>}
          <button type="button" className="secondary-button" data-auth-method="scan-qr" disabled={isTesting || isAuthenticating} onClick={handleScanAndroidQR}>
            <QrCode aria-hidden="true" size={18} />
            <span>{strings.auth.scanDesktopQrShort}</span>
          </button>
        </div>}
        {androidQR && <AndroidQrConfirmation
          apiUrl={androidQR.apiUrl}
          isSubmitting={isAuthenticating}
          onConfirm={handleConfirmAndroidQR}
          onCancel={() => setAndroidQR(null)}
        />}
        {androidQR && error && <p className="error-text" role="alert">{error}</p>}
      </section>
    </main>
  );
}
